from .transaction import CamelModel


class AnomalyDto(CamelModel):
    type: str
    severity: str  # Low | Medium | High | Critical
    confidence: float  # 0-1
    description: str
    evidence: str
