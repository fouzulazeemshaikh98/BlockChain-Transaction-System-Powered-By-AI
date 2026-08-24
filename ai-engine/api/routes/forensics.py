from fastapi import APIRouter

from models.analysis import ForensicsRequest, ForensicsResponse
from services.forensic_service import analyze_forensics

router = APIRouter()


@router.post("/forensics", response_model=ForensicsResponse)
def forensic_analysis(request: ForensicsRequest) -> ForensicsResponse:
    return analyze_forensics(request.transaction, request.recent_history)
