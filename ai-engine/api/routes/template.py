from fastapi import APIRouter

from models.analysis import TemplateRequest, TemplateResponse
from services.template_service import match_template

router = APIRouter()


@router.post("/template", response_model=TemplateResponse)
def template_matching(request: TemplateRequest) -> TemplateResponse:
    return match_template(request.transaction, request.active_templates)
