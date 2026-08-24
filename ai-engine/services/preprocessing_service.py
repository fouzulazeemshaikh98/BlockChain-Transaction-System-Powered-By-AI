from datetime import datetime, timezone

from models.transaction import NormalizedTransaction, RawTransaction


def _normalize_hex(value: str | None) -> str:
    if not value:
        return ""
    value = value.strip()
    if value.startswith(("0x", "0X")):
        value = value[2:]
    return value.lower()


def _normalize_timestamp(raw: str | None) -> str:
    if not raw:
        return datetime.now(timezone.utc).isoformat()
    try:
        # Accept both plain ISO strings and unix-epoch-as-string.
        if raw.isdigit():
            dt = datetime.fromtimestamp(int(raw), tz=timezone.utc)
        else:
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            dt = dt.astimezone(timezone.utc)
        return dt.isoformat()
    except (ValueError, OverflowError):
        return datetime.now(timezone.utc).isoformat()


def preprocess(raw: RawTransaction) -> NormalizedTransaction:
    """Normalizes a raw submission: UTC timestamps, numeric coercion, HEX
    normalization (lowercase, no 0x prefix so entropy/padding checks operate
    on pure hex digits), and sensible defaults for missing optional fields."""
    return NormalizedTransaction(
        transaction_hash=_normalize_hex(raw.transaction_hash) or raw.transaction_hash.strip(),
        network=raw.network.strip().title(),
        from_address=raw.from_address.strip().lower(),
        to_address=raw.to_address.strip().lower(),
        amount=max(float(raw.amount or 0), 0.0),
        gas_used=max(float(raw.gas_used or 0), 0.0),
        gas_price=max(float(raw.gas_price or 0), 0.0),
        nonce=int(raw.nonce or 0),
        timestamp=_normalize_timestamp(raw.timestamp),
        contract_address=(raw.contract_address or "").strip().lower() or None,
        function_name=(raw.function_name or "").strip(),
        description=(raw.description or "").strip(),
        raw_data=_normalize_hex(raw.raw_data),
    )
