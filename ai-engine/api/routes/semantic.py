from fastapi import APIRouter

from models.analysis import SemanticRequest, SemanticResponse
from services.semantic_service import analyze_semantic

router = APIRouter()


@router.post("/semantic", response_model=SemanticResponse)
def semantic_analysis(request: SemanticRequest) -> SemanticResponse:
    return analyze_semantic(request.transaction)
