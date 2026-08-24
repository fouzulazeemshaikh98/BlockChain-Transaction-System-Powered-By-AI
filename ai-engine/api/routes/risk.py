from fastapi import APIRouter

from models.analysis import RiskRequest, RiskResponse
from services.risk_service import calculate_risk

router = APIRouter()


@router.post("/risk", response_model=RiskResponse)
def risk_scoring(request: RiskRequest) -> RiskResponse:
    return calculate_risk(request)
