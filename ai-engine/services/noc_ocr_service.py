import os
import re
import shutil

import numpy as np
import pytesseract
from PIL import Image

from models.noc import NocExtractedFields

# On Windows, tesseract.exe isn't always on PATH after a winget install.
_DEFAULT_WINDOWS_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
if not shutil.which("tesseract") and os.path.exists(_DEFAULT_WINDOWS_PATH):
    pytesseract.pytesseract.tesseract_cmd = _DEFAULT_WINDOWS_PATH
elif os.environ.get("TESSERACT_CMD"):
    pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]


_LABEL_PATTERNS = {
    "applicant_name": [r"(?:applicant|name|holder)\s*[:\-]\s*(.+)"],
    "origin_city": [r"(?:origin|from|departure)\s*(?:city)?\s*[:\-]\s*([A-Za-z ]+)"],
    "destination_city": [r"(?:destination|to)\s*(?:city)?\s*[:\-]\s*([A-Za-z ]+)"],
    "issuing_authority": [r"(?:issued\s*by|authority|issuing\s*authority)\s*[:\-]\s*(.+)"],
    "issue_date": [r"(?:date|issued\s*on|dated)\s*[:\-]\s*([\d/\-\. ]{6,12})"],
    "authorized_amount": [
        r"(?:authorized\s*amount|authorised\s*amount|monthly\s*limit|transfer\s*limit|"
        r"authorized\s*monthly\s*(?:transfer\s*)?amount)\s*[:\-]\s*(?:usd|us\$|\$)?\s*"
        r"([\d,]+(?:\.\d+)?)"
    ],
}

_COUNTRY_HINTS = {
    "karachi": "Pakistan",
    "lahore": "Pakistan",
    "islamabad": "Pakistan",
    "dubai": "United Arab Emirates",
    "abu dhabi": "United Arab Emirates",
    "london": "United Kingdom",
    "new york": "United States",
    "doha": "Qatar",
    "riyadh": "Saudi Arabia",
    "jeddah": "Saudi Arabia",
    "sydney": "Australia",
    "melbourne": "Australia",
    "canberra": "Australia",
}


def _first_match(text: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            value = match.group(1).strip(" \t.,")
            if value:
                return value
    return None


def _country_for_city(city: str | None) -> str | None:
    if not city:
        return None
    return _COUNTRY_HINTS.get(city.strip().lower())


def _parse_amount(raw: str | None) -> float | None:
    if not raw:
        return None
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return None


def extract_fields(image: np.ndarray) -> NocExtractedFields:
    """Runs Tesseract OCR over the document and pulls out the fields a NOC
    for a cross-border/cross-city transfer is expected to carry. Best-effort
    label matching, not a fixed template parser, since real NOC layouts
    vary."""
    pil_image = Image.fromarray(image)
    raw_text = pytesseract.image_to_string(pil_image)

    origin_city = _first_match(raw_text, _LABEL_PATTERNS["origin_city"])
    destination_city = _first_match(raw_text, _LABEL_PATTERNS["destination_city"])
    authorized_amount_raw = _first_match(raw_text, _LABEL_PATTERNS["authorized_amount"])

    return NocExtractedFields(
        applicant_name=_first_match(raw_text, _LABEL_PATTERNS["applicant_name"]),
        origin_city=origin_city,
        origin_country=_country_for_city(origin_city),
        destination_city=destination_city,
        destination_country=_country_for_city(destination_city),
        issuing_authority=_first_match(raw_text, _LABEL_PATTERNS["issuing_authority"]),
        issue_date=_first_match(raw_text, _LABEL_PATTERNS["issue_date"]),
        authorized_amount=_parse_amount(authorized_amount_raw),
        raw_text=raw_text.strip(),
    )
