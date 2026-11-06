"""Behavioural feature vector for the XGBoost + Isolation Forest models.

The same function is used at training time (scripts/train_risk_models.py)
and at inference time (/v1/risk/score), so the two cannot drift apart.
"""

import math
from datetime import datetime, timezone

import numpy as np

FEATURE_NAMES = [
    "log_amount",           # log10(amount in whole tokens + 1)
    "amount_ratio",         # amount / sender's mean recent amount (1.0 when no history)
    "tx_count_last_hour",   # sender velocity
    "known_receiver",       # 1 if sender has paid this receiver before
    "log_gas_gwei",         # log10(gas price in gwei + 1)
    "gas_ratio",            # gas price / median recent gas price (1.0 when no history)
    "calldata_bytes",       # payload length
    "hour_utc",             # time-of-day
]


def build_vector(
    amount_tokens: float,
    recent_amounts_tokens: list[float],
    tx_count_last_hour: int,
    known_receiver: bool,
    gas_price_gwei: float,
    recent_gas_gwei: list[float],
    calldata_bytes: int,
    hour_utc: int,
) -> list[float]:
    mean_recent = float(np.mean(recent_amounts_tokens)) if recent_amounts_tokens else 0.0
    amount_ratio = amount_tokens / mean_recent if mean_recent > 0 else 1.0
    median_gas = float(np.median(recent_gas_gwei)) if recent_gas_gwei else 0.0
    gas_ratio = gas_price_gwei / median_gas if median_gas > 0 else 1.0
    return [
        math.log10(max(amount_tokens, 0.0) + 1.0),
        min(amount_ratio, 1000.0),
        float(tx_count_last_hour),
        1.0 if known_receiver else 0.0,
        math.log10(max(gas_price_gwei, 0.0) + 1.0),
        min(gas_ratio, 1000.0),
        float(calldata_bytes),
        float(hour_utc),
    ]


def extract_features(req) -> list[float]:
    """Feature vector for a models.risk_v1.TransferRequest."""
    scale = 10 ** req.token_decimals
    calldata = req.calldata[2:] if req.calldata.startswith("0x") else req.calldata
    return build_vector(
        amount_tokens=req.amount / scale,
        recent_amounts_tokens=[a / scale for a in req.recent_amounts],
        tx_count_last_hour=req.tx_count_last_hour,
        known_receiver=req.known_receiver,
        gas_price_gwei=req.gas_price / 1e9,
        recent_gas_gwei=[g / 1e9 for g in req.recent_gas_prices],
        calldata_bytes=len(calldata) // 2,
        hour_utc=datetime.now(timezone.utc).hour,
    )
