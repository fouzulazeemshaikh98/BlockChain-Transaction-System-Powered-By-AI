from ml.anomaly_model import compute_behavioral_score
from models.analysis import ModuleScores, RiskRequest, RiskResponse

# Spec section 8 weighting.
_WEIGHTS = {"semantic": 0.20, "template": 0.25, "forensics": 0.35, "behavioral": 0.20}

_LEVEL_THRESHOLDS = [
    (20, "VERIFIED"),
    (40, "LOW"),
    (60, "MEDIUM"),
    (80, "HIGH"),
    (100, "CRITICAL"),
]

_RECOMMENDATIONS = {
    "VERIFIED": "Transaction is consistent with expected patterns and can proceed without further review.",
    "LOW": "Transaction shows minor deviations. Routine monitoring is sufficient.",
    "MEDIUM": "Transaction shows moderate deviations from expected institutional patterns. Periodic review recommended.",
    "HIGH": "Transaction shows significant deviations from the expected institutional transaction template. Manual compliance review is recommended before settlement.",
    "CRITICAL": "Transaction exhibits strong indicators of fraudulent or malicious activity. Settlement should be blocked pending investigation.",
}


def _risk_level(score: float, thresholds: list[tuple[float, str]]) -> str:
    for threshold, level in thresholds:
        if score <= threshold:
            return level
    return "CRITICAL"


def _thresholds_for(request: RiskRequest) -> list[tuple[float, str]]:
    if request.thresholds is None:
        return _LEVEL_THRESHOLDS
    t = request.thresholds
    return [(t.verified, "VERIFIED"), (t.low, "LOW"), (t.medium, "MEDIUM"), (t.high, "HIGH"), (100, "CRITICAL")]


def calculate_risk(request: RiskRequest) -> RiskResponse:
    behavioral_score = compute_behavioral_score(request.current_features, request.historical_features)

    scores = request.module_scores
    final_score = (
        scores.semantic * _WEIGHTS["semantic"]
        + scores.template * _WEIGHTS["template"]
        + scores.forensics * _WEIGHTS["forensics"]
        + behavioral_score * _WEIGHTS["behavioral"]
    )
    final_score = round(min(max(final_score, 0.0), 100.0), 1)
    level = _risk_level(final_score, _thresholds_for(request))

    return RiskResponse(
        risk_score=final_score,
        risk_level=level,
        recommendation=_RECOMMENDATIONS[level],
        module_scores=ModuleScores(
            semantic=scores.semantic,
            template=scores.template,
            forensics=scores.forensics,
            behavioral=behavioral_score,
        ),
        behavioral_score=behavioral_score,
    )
