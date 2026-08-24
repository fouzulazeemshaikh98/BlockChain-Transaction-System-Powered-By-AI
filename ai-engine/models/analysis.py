from typing import Optional

from .anomaly import AnomalyDto
from .transaction import CamelModel, NormalizedTransaction


class SemanticRequest(CamelModel):
    transaction: NormalizedTransaction


class SemanticResponse(CamelModel):
    semantic_score: float  # 0-100, risk-oriented: higher = more mismatch
    issues: list[str]
    explanation: str
    confidence: float  # 0-1


class ProtocolTemplateDto(CamelModel):
    name: str
    network: str
    expected_contracts: list[str] = []
    expected_functions: list[str] = []
    expected_routing_path: list[str] = []


class TemplateRequest(CamelModel):
    transaction: NormalizedTransaction
    active_templates: list[ProtocolTemplateDto]


class TemplateResponse(CamelModel):
    template_name: Optional[str] = None
    similarity_score: float  # 0-100, higher = better match (NOT risk-oriented)
    is_match: bool
    deviations: list[str]


class HistoryEntry(CamelModel):
    """A prior transaction from the same FromAddress, used for replay/
    nonce-reuse/timing/duplicate-pattern comparisons in the forensics
    module."""

    transaction_hash: str
    nonce: int
    gas_used: float
    gas_price: float
    timestamp: str
    raw_data: str = ""
    function_name: str = ""
    to_address: str = ""
    amount: float = 0


class ForensicsRequest(CamelModel):
    transaction: NormalizedTransaction
    recent_history: list[HistoryEntry] = []


class ForensicsResponse(CamelModel):
    forensic_score: float  # 0-100, risk-oriented
    anomalies: list[AnomalyDto]


class ModuleScores(CamelModel):
    semantic: float
    template: float  # risk-oriented (already inverted from similarity by the caller)
    forensics: float
    behavioral: float


class BehavioralFeatures(CamelModel):
    amount: float
    gas_used: float
    gas_price: float


class RiskThresholds(CamelModel):
    """Score ceilings (0-100) for VERIFIED/LOW/MEDIUM/HIGH; anything above
    the HIGH ceiling is CRITICAL. Admin-configurable via SystemSetting; the
    AI engine falls back to the spec defaults (20/40/60/80) when omitted."""

    verified: float = 20
    low: float = 40
    medium: float = 60
    high: float = 80


class RiskRequest(CamelModel):
    module_scores: ModuleScores
    current_features: BehavioralFeatures
    historical_features: list[BehavioralFeatures] = []
    thresholds: Optional[RiskThresholds] = None


class RiskResponse(CamelModel):
    risk_score: float
    risk_level: str  # VERIFIED | LOW | MEDIUM | HIGH | CRITICAL
    recommendation: str
    module_scores: ModuleScores
    behavioral_score: float
