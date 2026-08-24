from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd

from models.analysis import AnomalyDto, ForensicsResponse, HistoryEntry
from models.transaction import NormalizedTransaction

_SEVERITY_WEIGHT = {"Low": 5, "Medium": 12, "High": 25, "Critical": 40}
_GAS_ZSCORE_THRESHOLD = 2.5
_NONCE_GAP_THRESHOLD = 5
_MIN_PAYLOAD_BYTES_FOR_ENTROPY_CHECK = 8
_ENTROPY_RATIO_HIGH = 0.92
_ENTROPY_RATIO_MEDIUM = 0.85


def _parse_ts(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _entropy_ratio(hex_str: str) -> tuple[float, float, int]:
    """Returns (entropy_bits_per_byte, ratio_of_achievable_max, byte_length).

    Normal ABI-encoded call data is full of zero-padding and reads as low
    entropy; encrypted/obfuscated or artificially randomized payloads read
    close to the *achievable* max. Comparing against a flat 8.0 bits/byte
    ceiling is meaningless for short payloads - with N distinct byte
    values possible in a sample of length N (N<256), the true ceiling is
    log2(N), not 8. Using the ratio to that sample-size-aware ceiling keeps
    the check meaningful for both short and long payloads.
    """
    if not hex_str:
        return 0.0, 0.0, 0
    try:
        data = bytes.fromhex(hex_str)
    except ValueError:
        return 0.0, 0.0, 0
    n = len(data)
    if n == 0:
        return 0.0, 0.0, 0
    counts = np.bincount(np.frombuffer(data, dtype=np.uint8), minlength=256)
    probs = counts[counts > 0] / n
    entropy = float(-np.sum(probs * np.log2(probs)))
    achievable_max = float(np.log2(min(n, 256))) if n > 1 else 1.0
    ratio = entropy / achievable_max if achievable_max > 0 else 0.0
    return entropy, ratio, n


def analyze_forensics(tx: NormalizedTransaction, history: list[HistoryEntry]) -> ForensicsResponse:
    anomalies: list[AnomalyDto] = []

    # --- Replay attack: identical transaction hash seen before ---
    for entry in history:
        if entry.transaction_hash and entry.transaction_hash == tx.transaction_hash:
            anomalies.append(
                AnomalyDto(
                    type="Replay Attack",
                    severity="Critical",
                    confidence=0.97,
                    description="This transaction hash has already been observed for this address.",
                    evidence=f"Duplicate transaction hash: {tx.transaction_hash}",
                )
            )
            break

    # --- Nonce reuse / gap ---
    prior_nonces = [e.nonce for e in history]
    if tx.nonce in prior_nonces:
        matching = next(e for e in history if e.nonce == tx.nonce)
        anomalies.append(
            AnomalyDto(
                type="Nonce Reuse",
                severity="High",
                confidence=0.94,
                description="Transaction nonce has been previously observed.",
                evidence=f"Nonce {tx.nonce} was already used in transaction {matching.transaction_hash}.",
            )
        )
    elif prior_nonces:
        gap = tx.nonce - max(prior_nonces) - 1
        if gap > _NONCE_GAP_THRESHOLD:
            anomalies.append(
                AnomalyDto(
                    type="Nonce Gap",
                    severity="Medium",
                    confidence=0.6,
                    description="Unexpected gap between this nonce and the sender's last known nonce.",
                    evidence=f"Nonce jumped from {max(prior_nonces)} to {tx.nonce} ({gap} missing in between).",
                )
            )

    # --- Timestamp anomalies ---
    tx_time = _parse_ts(tx.timestamp)
    if tx_time is not None:
        now = datetime.now(timezone.utc)
        if tx_time > now + timedelta(minutes=5):
            anomalies.append(
                AnomalyDto(
                    type="Timestamp Manipulation",
                    severity="High",
                    confidence=0.85,
                    description="Transaction timestamp is in the future.",
                    evidence=f"Timestamp {tx.timestamp} is ahead of the current time ({now.isoformat()}).",
                )
            )
        if any(e.timestamp == tx.timestamp for e in history):
            anomalies.append(
                AnomalyDto(
                    type="Suspicious Repeated Timing",
                    severity="Medium",
                    confidence=0.55,
                    description="Another transaction from this address shares the exact same timestamp.",
                    evidence=f"Timestamp {tx.timestamp} repeats a prior transaction's timestamp.",
                )
            )

    # --- Gas usage outlier (z-score over historical gas_used via pandas) ---
    if len(history) >= 3:
        gas_series = pd.Series([e.gas_used for e in history], dtype="float64")
        mean = gas_series.mean()
        std = gas_series.std()
        if std and std > 0:
            z = (tx.gas_used - mean) / std
            if abs(z) > _GAS_ZSCORE_THRESHOLD:
                anomalies.append(
                    AnomalyDto(
                        type="Gas Manipulation",
                        severity="High" if abs(z) > 3.5 else "Medium",
                        confidence=round(min(0.5 + abs(z) / 10, 0.95), 2),
                        description="Gas usage deviates sharply from this address's historical pattern.",
                        evidence=(
                            f"Gas used {tx.gas_used:.0f} is {z:.2f} standard deviations from the "
                            f"historical mean of {mean:.0f} (std {std:.0f})."
                        ),
                    )
                )

    # --- HEX payload entropy ---
    entropy, entropy_ratio, payload_len = _entropy_ratio(tx.raw_data)
    if payload_len >= _MIN_PAYLOAD_BYTES_FOR_ENTROPY_CHECK:
        if entropy_ratio >= _ENTROPY_RATIO_HIGH:
            anomalies.append(
                AnomalyDto(
                    type="Entropy Anomaly",
                    severity="High",
                    confidence=0.7,
                    description="Transaction payload entropy is unusually high for typical ABI-encoded call data.",
                    evidence=(
                        f"Payload entropy {entropy:.2f} bits/byte is {entropy_ratio:.0%} of the "
                        f"achievable maximum for a {payload_len}-byte payload, consistent with "
                        "encrypted, obfuscated, or artificially randomized content rather than "
                        "typical zero-padded ABI-encoded call data."
                    ),
                )
            )
        elif entropy_ratio >= _ENTROPY_RATIO_MEDIUM:
            anomalies.append(
                AnomalyDto(
                    type="Entropy Anomaly",
                    severity="Medium",
                    confidence=0.5,
                    description="Transaction payload entropy is higher than typical ABI-encoded call data.",
                    evidence=(
                        f"Payload entropy {entropy:.2f} bits/byte is {entropy_ratio:.0%} of the "
                        f"achievable maximum for a {payload_len}-byte payload."
                    ),
                )
            )

    # --- Duplicate transaction pattern: same function/destination/amount recently ---
    for entry in history:
        if (
            entry.function_name
            and entry.function_name == tx.function_name
            and entry.to_address == tx.to_address
            and abs(entry.amount - tx.amount) < 1e-9
        ):
            anomalies.append(
                AnomalyDto(
                    type="Duplicate Transaction Pattern",
                    severity="Medium",
                    confidence=0.65,
                    description="An identical function/destination/amount combination was recently observed.",
                    evidence=f"Matches transaction {entry.transaction_hash}.",
                )
            )
            break

    forensic_score = min(sum(_SEVERITY_WEIGHT[a.severity] for a in anomalies), 100.0)

    return ForensicsResponse(forensic_score=float(forensic_score), anomalies=anomalies)
