import hashlib
from datetime import datetime, timedelta

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile

from models.noc import NocForensicFlag, NocVerificationResponse
from services.cnn_forensic_service import explain as cnn_explain
from services.cnn_forensic_service import forged_probability as cnn_forged_probability
from services.noc_forensic_service import run_checks
from services.noc_ocr_service import extract_fields
from services.noc_stamp_service import locate_stamp

router = APIRouter()

_AUTHENTIC_THRESHOLD = 75.0
_SUSPICIOUS_THRESHOLD = 50.0
_MAX_DOC_AGE_DAYS = 180
_DATE_FORMATS = ["%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%d.%m.%Y", "%m/%d/%Y"]

# Every NOC must state its own authorized monthly transfer amount, and that
# amount must fall in this range - this platform is for institutional
# transfers, and an unstated or out-of-range amount is a hard rejection,
# not a soft risk nudge, regardless of how clean the stamp forensics are.
_MIN_AUTHORIZED_AMOUNT = 5_000.0
_MAX_AUTHORIZED_AMOUNT = 1_000_000.0


def _parse_date(raw: str | None) -> datetime | None:
    if not raw:
        return None
    cleaned = raw.strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(cleaned, fmt)
        except ValueError:
            continue
    return None


def _compute_risk_score(fields, flags: list[NocForensicFlag]) -> tuple[float, list[NocForensicFlag]]:
    """Lightweight, explainable risk scoring layered on top of the forensic
    authenticity checks: flags stale/unparseable dates and missing required
    routing fields, which matter for whether the transfer request itself
    should be trusted even if the stamp looks physically genuine."""
    risk = 0.0
    extra_flags: list[NocForensicFlag] = []

    issue_date = _parse_date(fields.issue_date)
    if issue_date is None:
        risk += 15
        extra_flags.append(
            NocForensicFlag(
                code="issue_date_unreadable",
                message="Could not confidently parse an issue date from the document.",
                severity="warning",
            )
        )
    elif datetime.now() - issue_date > timedelta(days=_MAX_DOC_AGE_DAYS):
        risk += 30
        extra_flags.append(
            NocForensicFlag(
                code="document_stale",
                message=f"Document is older than {_MAX_DOC_AGE_DAYS} days ({fields.issue_date}).",
                severity="warning",
            )
        )

    if not fields.origin_city or not fields.destination_city:
        risk += 25
        extra_flags.append(
            NocForensicFlag(
                code="missing_route_fields",
                message="Could not extract both an origin and a destination city from the document.",
                severity="warning",
            )
        )

    if not fields.applicant_name:
        risk += 10
        extra_flags.append(
            NocForensicFlag(
                code="missing_applicant_name",
                message="Could not extract an applicant name from the document.",
                severity="info",
            )
        )

    critical_forensic_flags = [f for f in flags if f.severity == "critical"]
    risk += 20 * len(critical_forensic_flags)

    return min(risk, 100.0), extra_flags


def _check_authorized_amount(fields) -> tuple[NocForensicFlag | None, bool]:
    """Returns (flag_if_any, force_reject). The authorized amount is a hard
    requirement, not a scored risk factor - a missing or out-of-range value
    forces the document to be rejected outright regardless of authenticity
    score."""
    amount = fields.authorized_amount

    if amount is None:
        return (
            NocForensicFlag(
                code="authorized_amount_missing",
                message=(
                    "No authorized monthly transfer amount could be found on the document. "
                    "Every NOC must explicitly state this amount."
                ),
                severity="critical",
            ),
            True,
        )

    if amount < _MIN_AUTHORIZED_AMOUNT or amount > _MAX_AUTHORIZED_AMOUNT:
        return (
            NocForensicFlag(
                code="authorized_amount_out_of_range",
                message=(
                    f"Authorized amount ${amount:,.0f} is outside the allowed range "
                    f"(${_MIN_AUTHORIZED_AMOUNT:,.0f}-${_MAX_AUTHORIZED_AMOUNT:,.0f} per month)."
                ),
                severity="critical",
            ),
            True,
        )

    return None, False


@router.post("/verify", response_model=NocVerificationResponse)
async def verify_noc(file: UploadFile = File(...)) -> NocVerificationResponse:
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    document_hash = hashlib.sha256(contents).hexdigest()

    file_bytes = np.frombuffer(contents, dtype=np.uint8)
    image_bgr = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise HTTPException(status_code=400, detail="Could not decode uploaded file as an image.")

    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    fields = extract_fields(image_rgb)

    stamp_analysis, stamp_mask = locate_stamp(image_bgr)
    forensic_flags, authenticity_score = run_checks(image_bgr, stamp_mask)
    cnn_prob = cnn_forged_probability(image_bgr, stamp_mask)
    cnn_heatmap = cnn_explain(image_bgr, stamp_mask)

    risk_score, extra_flags = _compute_risk_score(fields, forensic_flags)
    amount_flag, amount_forces_rejection = _check_authorized_amount(fields)
    if amount_flag is not None:
        extra_flags.append(amount_flag)

    all_flags = forensic_flags + extra_flags

    if amount_forces_rejection:
        verdict = "forged"
        risk_score = 100.0
    elif authenticity_score >= _AUTHENTIC_THRESHOLD and risk_score < 40:
        verdict = "genuine"
    elif authenticity_score >= _SUSPICIOUS_THRESHOLD:
        verdict = "suspicious"
    else:
        verdict = "forged"

    return NocVerificationResponse(
        document_hash=document_hash,
        verdict=verdict,
        authenticity_score=round(authenticity_score, 2),
        risk_score=round(risk_score, 2),
        fields=fields,
        stamp=stamp_analysis,
        flags=all_flags,
        cnn_forged_probability=round(cnn_prob, 4) if cnn_prob is not None else None,
        cnn_heatmap=cnn_heatmap,
    )
