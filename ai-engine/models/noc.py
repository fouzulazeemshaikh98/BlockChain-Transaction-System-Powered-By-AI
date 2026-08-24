from typing import List, Optional

from .transaction import CamelModel


class NocExtractedFields(CamelModel):
    applicant_name: Optional[str] = None
    origin_city: Optional[str] = None
    origin_country: Optional[str] = None
    destination_city: Optional[str] = None
    destination_country: Optional[str] = None
    issuing_authority: Optional[str] = None
    issue_date: Optional[str] = None
    authorized_amount: Optional[float] = None  # monthly transfer cap this NOC authorizes
    raw_text: str = ""


class NocStampAnalysis(CamelModel):
    stamp_detected: bool
    bounding_box: Optional[List[int]] = None  # [x, y, w, h]
    circularity: Optional[float] = None
    color_label: Optional[str] = None


class NocForensicFlag(CamelModel):
    code: str
    message: str
    severity: str  # "info" | "warning" | "critical"


class NocVerificationResponse(CamelModel):
    document_hash: str
    verdict: str  # "genuine" | "suspicious" | "forged"
    authenticity_score: float  # 0-100
    risk_score: float  # 0-100, higher = riskier
    fields: NocExtractedFields
    stamp: NocStampAnalysis
    flags: List[NocForensicFlag]
    cnn_forged_probability: Optional[float] = None  # 0-1, None if the CNN model isn't available
    cnn_heatmap: Optional[str] = None  # base64 JPEG data URI, Grad-CAM overlay explaining the score
