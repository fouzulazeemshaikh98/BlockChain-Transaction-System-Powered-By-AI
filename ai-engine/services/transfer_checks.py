"""Protocol-template verification and micro-level anomaly detection for
POST /v1/risk/score (report sections 5.2.3 B and C).

Both return (risk 0..1, findings). Micro-level checks keep a small
in-memory ledger of attested transfer ids and (sender, nonce) pairs to spot
replays. The backend also enforces transfer-id uniqueness in SQL Server and
the contract enforces it on-chain, so a restart of this service loses no
protection; it only loses this early warning.
"""

import threading

from eth_abi import encode
from eth_account import Account
from eth_account.messages import encode_defunct
from eth_utils import keccak, to_checksum_address

_SECP256K1_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

# Function names a template may list without a full signature.
_KNOWN_SIGNATURES = {
    "transfer": "transfer(address,uint256)",
    "transferfrom": "transferFrom(address,address,uint256)",
    "approve": "approve(address,uint256)",
}
_DEFAULT_ALLOWED = ["transfer(address,uint256)", "transferFrom(address,address,uint256)"]


def _selector(signature: str) -> str:
    return keccak(text=signature)[:4].hex()


def _strip0x(value: str) -> str:
    return value[2:] if value.lower().startswith("0x") else value


def _combine(scores: list[float]) -> float:
    """Noisy-OR: several independent weak signals add up, one strong signal dominates."""
    remaining = 1.0
    for s in scores:
        remaining *= 1.0 - max(0.0, min(1.0, s))
    return round(1.0 - remaining, 4)


def _decode_address(word: str) -> tuple[str, bool]:
    """Returns (checksummed address, padding_is_clean)."""
    return to_checksum_address("0x" + word[24:]), word[:24] == "0" * 24


# ---------------------------------------------------------------------------
# B. Protocol template verification
# ---------------------------------------------------------------------------

def match_protocol_template(req) -> tuple[float, list[str], str | None]:
    allowed = []
    for fn in req.allowed_functions or _DEFAULT_ALLOWED:
        name = fn.strip()
        if "(" not in name:
            name = _KNOWN_SIGNATURES.get(name.lower(), "")
        if name:
            allowed.append(name)
    by_selector = {_selector(sig): sig for sig in allowed}

    data = _strip0x(req.calldata or "").lower()
    if not data:
        return 0.5, ["No calldata supplied: the transfer structure cannot be checked against a protocol template."], None
    if len(data) % 2 or any(c not in "0123456789abcdef" for c in data):
        return 1.0, ["Calldata is not valid hex: payload is malformed."], None
    if len(data) < 8:
        return 1.0, ["Calldata is shorter than a 4-byte function selector."], None

    selector, args = data[:8], data[8:]
    signature = by_selector.get(selector)
    if signature is None:
        return 1.0, [f"Function selector 0x{selector} does not match any active protocol template {allowed}."], None

    findings: list[str] = []
    scores: list[float] = []
    receiver = to_checksum_address(req.receiver)
    sender = to_checksum_address(req.sender)

    words = [args[i:i + 64] for i in range(0, len(args), 64)]
    if signature.startswith("transfer(") or signature.startswith("approve("):
        expected_words = 2
    elif signature.startswith("transferFrom("):
        expected_words = 3
    else:
        return 0.0, [], signature

    if len(args) < expected_words * 64:
        return 0.9, [f"Calldata arguments for {signature} are truncated."], signature
    if len(args) > expected_words * 64:
        scores.append(0.6)
        findings.append(f"{(len(args) - expected_words * 64) // 2} unexpected trailing bytes appended to {signature} calldata.")

    if signature.startswith("approve("):
        scores.append(1.0)
        findings.append("Calldata is an approve() allowance grant, not a transfer: the protocol structure deviates from a payment.")
        return _combine(scores), findings, signature

    if signature.startswith("transferFrom("):
        from_addr, clean_from = _decode_address(words[0])
        if from_addr != sender:
            scores.append(1.0)
            findings.append(f"transferFrom source {from_addr} differs from the declared sender {sender}.")
        if not clean_from:
            scores.append(0.8)
            findings.append("Non-zero padding in the address argument (inconsistent data padding).")
        to_word, amount_word = words[1], words[2]
    else:
        to_word, amount_word = words[0], words[1]

    to_addr, clean_to = _decode_address(to_word)
    if not clean_to:
        scores.append(0.8)
        findings.append("Non-zero padding in the recipient address argument (inconsistent data padding).")
    if to_addr != receiver:
        scores.append(1.0)
        findings.append(
            f"Calldata recipient {to_addr} differs from the declared receiver {receiver}: possible unauthorized re-routing."
        )
    if int(amount_word, 16) != req.amount:
        scores.append(0.8)
        findings.append(f"Calldata amount {int(amount_word, 16)} differs from the declared amount {req.amount}.")

    return _combine(scores), findings, signature


# ---------------------------------------------------------------------------
# C. Micro-level anomaly detection
# ---------------------------------------------------------------------------

class _ReplayLedger:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.transfer_ids: set[str] = set()
        self.nonce_payload: dict[tuple[str, int], str] = {}
        self.payload_ids: dict[str, str] = {}
        self.last_nonce: dict[str, int] = {}

    def record(self, transfer_id: str, sender: str, nonce: int, payload_hash: str) -> None:
        with self._lock:
            self.transfer_ids.add(transfer_id)
            self.nonce_payload.setdefault((sender, nonce), payload_hash)
            self.payload_ids.setdefault(payload_hash, transfer_id)
            self.last_nonce[sender] = max(nonce, self.last_nonce.get(sender, -1))


LEDGER = _ReplayLedger()


def client_payload_digest(chain_id: int, req) -> bytes:
    """What a client signs (EIP-191 personal_sign over this 32-byte digest)
    when it attaches `signature` to a transfer request."""
    return keccak(
        encode(
            ["uint256", "address", "address", "address", "uint256", "uint256", "bytes32"],
            [
                chain_id,
                to_checksum_address(req.sender),
                to_checksum_address(req.token),
                to_checksum_address(req.receiver),
                req.amount,
                req.nonce,
                bytes.fromhex(_strip0x(req.transfer_id)),
            ],
        )
    )


def _payload_hash(req) -> str:
    return keccak(
        text=f"{req.sender.lower()}|{req.token.lower()}|{req.receiver.lower()}|{req.amount}|{_strip0x(req.calldata).lower()}"
    ).hex()


def micro_level_checks(req, chain_id: int) -> tuple[float, list[str]]:
    findings: list[str] = []
    scores: list[float] = []
    sender = to_checksum_address(req.sender)
    tid = req.transfer_id.lower()
    payload = _payload_hash(req)

    # Replayed identifiers / nonces
    if tid in LEDGER.transfer_ids:
        scores.append(1.0)
        findings.append("Replayed authorization: this transfer id has already been attested.")
    prior = LEDGER.nonce_payload.get((sender, req.nonce))
    if prior is not None and prior != payload:
        scores.append(0.9)
        findings.append(f"Nonce {req.nonce} was already used by {sender} for a different payload (nonce reuse).")
    elif prior is not None and tid not in LEDGER.transfer_ids:
        # Same sender + nonce + payload, fresh transfer id: the old
        # authorization re-submitted under a new id. (An identical payload
        # with a NEW nonce is just a repeat payment and is not flagged.)
        scores.append(0.9)
        findings.append(f"Nonce {req.nonce} and payload were already attested under another transfer id (replay under a new id).")
    last = LEDGER.last_nonce.get(sender)
    if last is not None and req.nonce < last and prior is None:
        scores.append(0.6)
        findings.append(f"Out-of-order nonce {req.nonce} (last seen {last}).")

    # Chain id
    if req.chain_id is not None and req.chain_id != chain_id:
        scores.append(1.0)
        findings.append(f"Chain id {req.chain_id} does not match the settlement chain {chain_id} (cross-chain replay).")

    # Signature components vs signed payload
    if req.signature:
        sig = _strip0x(req.signature)
        try:
            raw = bytes.fromhex(sig)
        except ValueError:
            raw = b""
        if len(raw) != 65:
            scores.append(0.8)
            findings.append("Malformed signature: expected 65 bytes (r, s, v).")
        else:
            s_val, v_val = int.from_bytes(raw[32:64], "big"), raw[64]
            if s_val > _SECP256K1_N // 2:
                scores.append(0.7)
                findings.append("Non-canonical (malleable) signature: s is in the upper half of the curve order.")
            if v_val not in (0, 1, 27, 28):
                scores.append(0.7)
                findings.append(f"Invalid signature recovery id v={v_val}.")
            else:
                try:
                    recovered = Account.recover_message(
                        encode_defunct(primitive=client_payload_digest(chain_id, req)), signature=raw
                    )
                except Exception:
                    recovered = None
                if recovered != sender:
                    scores.append(0.9)
                    findings.append(
                        "Signature components do not correspond to the signed transfer payload (possible signature splicing)."
                    )

    # Gas parameters
    if req.gas_price == 0:
        scores.append(0.5)
        findings.append("Zero gas price.")
    if req.recent_gas_prices:
        recent = sorted(req.recent_gas_prices)
        median = recent[len(recent) // 2]
        if median > 0:
            ratio = req.gas_price / median
            if ratio > 5 or ratio < 0.2:
                scores.append(0.7)
                findings.append(f"Gas price deviates {ratio:.1f}x from the recent median (possible gas manipulation).")
    if req.gas_limit is not None and req.gas_limit > 500_000:
        scores.append(0.5)
        findings.append(f"Gas limit {req.gas_limit} is far above what an ERC-20 transfer needs.")

    return _combine(scores), findings


def record_attested(req) -> None:
    LEDGER.record(req.transfer_id.lower(), to_checksum_address(req.sender), req.nonce, _payload_hash(req))
