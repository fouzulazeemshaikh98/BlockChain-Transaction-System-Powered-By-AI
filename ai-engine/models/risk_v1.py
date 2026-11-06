"""Request/response models for POST /v1/risk/score (report Appendix C.2).

Field names are snake_case on the wire, exactly as in the report. The
required fields match the report's TransferRequest; the optional ones carry
context the behavioural and micro-level modules need (sender history,
chain id, client signature, gas limit) and default to "not supplied".
"""

from typing import Optional

from pydantic import BaseModel, Field


class TransferRequest(BaseModel):
    transfer_id: str = Field(pattern=r"^0x[0-9a-fA-F]{64}$")
    sender: str
    token: str
    receiver: str
    amount: int = Field(ge=0)  # token base units
    calldata: str = ""
    nonce: int = Field(ge=0)
    gas_price: int = Field(ge=0)  # wei

    # --- optional context -------------------------------------------------
    chain_id: Optional[int] = None
    gas_limit: Optional[int] = None
    token_decimals: int = 6
    # Client-side ECDSA signature (65-byte hex) over the transfer payload -
    # when present it must recover to `sender`, otherwise it's flagged as a
    # spliced / mismatched signature.
    signature: Optional[str] = None
    # Behavioural history, supplied by the backend from SQL Server.
    recent_amounts: list[int] = []
    tx_count_last_hour: int = 0
    known_receiver: bool = False
    recent_gas_prices: list[int] = []
    # Function names allowed by active institutional protocol templates,
    # e.g. ["transfer(address,uint256)"]. Empty = built-in defaults.
    allowed_functions: list[str] = []


class ModuleBreakdown(BaseModel):
    behavioural: float  # 0-1
    template: float  # 0-1
    micro: float  # 0-1
    xgb_fraud_probability: float
    isolation_anomaly: float
    template_name: Optional[str] = None


class RiskResponse(BaseModel):
    risk_score: int
    decision: str  # APPROVE | BLOCK
    findings: list[str]
    expiry: int
    signature: str
    # extra transparency fields (not in the report's minimal response)
    modules: ModuleBreakdown
    chain_id: int
    settlement_contract: str
    oracle_address: str
