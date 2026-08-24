from typing import Optional

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    """Base for every request/response schema in this service so the JSON
    wire format is camelCase, matching the spec's own documented examples
    (e.g. `templateName`, `riskScore`) and the ASP.NET Core backend's default
    JSON casing - no per-field alias attributes needed on either side."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RawTransaction(CamelModel):
    """Exactly what a client submits - loosely typed on purpose since HEX/
    numeric fields may arrive as strings and preprocessing is responsible
    for coercing them."""

    transaction_hash: str
    network: str
    from_address: str
    to_address: str
    amount: float = 0
    gas_used: float = 0
    gas_price: float = 0
    nonce: int = 0
    timestamp: Optional[str] = None
    contract_address: Optional[str] = None
    function_name: Optional[str] = None
    description: Optional[str] = None
    raw_data: Optional[str] = None


class NormalizedTransaction(CamelModel):
    """Output of /api/analyze/preprocess and the input every later module
    consumes."""

    transaction_hash: str
    network: str
    from_address: str
    to_address: str
    amount: float
    gas_used: float
    gas_price: float
    nonce: int
    timestamp: str  # ISO-8601 UTC
    contract_address: Optional[str] = None
    function_name: str = ""
    description: str = ""
    raw_data: str = ""
