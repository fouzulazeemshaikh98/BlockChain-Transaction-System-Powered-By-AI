from typing import List, Optional

import cv2
import numpy as np

from models.noc import NocForensicFlag
from services.cnn_forensic_service import is_forged_anomaly as cnn_is_forged_anomaly

_ELA_JPEG_QUALITY = 90
_ELA_RATIO_THRESHOLD = 1.6
_EDGE_RATIO_THRESHOLD = 1.8
_NOISE_RATIO_THRESHOLD = 1.8
_INK_THRESHOLD = 235
_MIN_BACKGROUND_PIXELS = 200


def _ink_mask(gray: np.ndarray) -> np.ndarray:
    """Pixels that are meaningfully non-white, i.e. printed content (body
    text, the stamp) rather than blank paper."""
    _, mask = cv2.threshold(gray, _INK_THRESHOLD, 255, cv2.THRESH_BINARY_INV)
    return mask


def _reference_background_mask(gray: np.ndarray, region_mask: np.ndarray) -> np.ndarray:
    """The fair baseline for "does this region look like it belongs on this
    page" is the document's *other* printed content (mainly body text), not
    blank paper - blank paper legitimately differs from any ink, forged or
    not, which would otherwise flag every genuine stamp as anomalous."""
    ink = _ink_mask(gray)
    background = cv2.bitwise_and(ink, cv2.bitwise_not(region_mask))
    if int(np.count_nonzero(background)) < _MIN_BACKGROUND_PIXELS:
        background = cv2.bitwise_not(region_mask)
    return background


def _region_and_background_means(
    values: np.ndarray, region_mask: np.ndarray, background_mask: np.ndarray
) -> tuple[float, float]:
    region_pixels = values[region_mask > 0]
    background_pixels = values[background_mask > 0]
    region_mean = float(np.mean(region_pixels)) if region_pixels.size else 0.0
    background_mean = float(np.mean(background_pixels)) if background_pixels.size else 1e-6
    return region_mean, background_mean


def error_level_analysis(
    image_bgr: np.ndarray, mask: np.ndarray, background_mask: np.ndarray
) -> tuple[float, bool]:
    """Recompresses the image at a fixed JPEG quality and measures how much
    the stamp region changed versus the document's other printed content. A
    region pasted in from elsewhere (or re-touched) tends to have a
    different compression-error signature than content that went through
    the same single compression pass - either markedly higher or markedly
    lower (already-once-compressed regions often show *less* further loss)."""
    success, encoded = cv2.imencode(".jpg", image_bgr, [cv2.IMWRITE_JPEG_QUALITY, _ELA_JPEG_QUALITY])
    if not success:
        return 0.0, False

    recompressed = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    diff = cv2.absdiff(image_bgr, recompressed)
    diff_gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY).astype(np.float32)

    region_mean, background_mean = _region_and_background_means(diff_gray, mask, background_mask)
    ratio = region_mean / max(background_mean, 1e-6)
    is_anomaly = ratio >= _ELA_RATIO_THRESHOLD or ratio <= 1 / _ELA_RATIO_THRESHOLD
    return ratio, is_anomaly


def edge_boundary_discontinuity(
    image_bgr: np.ndarray, mask: np.ndarray, background_mask: np.ndarray
) -> tuple[float, bool]:
    """Compares the gradient magnitude in a thin ring around the stamp's
    contour against the document's other ink edges (text), so it's an
    edge-to-edge comparison rather than ink-to-blank-paper."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    grad_x = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    grad_y = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    magnitude = cv2.magnitude(grad_x, grad_y)

    dilated = cv2.dilate(mask, np.ones((9, 9), np.uint8))
    ring = cv2.subtract(dilated, mask)

    ring_mean, background_mean = _region_and_background_means(magnitude, ring, background_mask)
    ratio = ring_mean / max(background_mean, 1e-6)
    return ratio, ratio >= _EDGE_RATIO_THRESHOLD


def color_noise_consistency(
    image_bgr: np.ndarray, mask: np.ndarray, background_mask: np.ndarray
) -> tuple[float, bool]:
    """Compares the high-frequency noise "grain" inside the stamp region to
    the document's other printed content. A stamp sourced from a different
    photo/scan typically carries a different noise fingerprint."""
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY).astype(np.float32)
    laplacian = cv2.Laplacian(gray, cv2.CV_32F, ksize=3)

    region_pixels = laplacian[mask > 0]
    background_pixels = laplacian[background_mask > 0]
    region_std = float(np.std(region_pixels)) if region_pixels.size else 0.0
    background_std = float(np.std(background_pixels)) if background_pixels.size else 1e-6

    ratio = max(region_std, background_std) / max(min(region_std, background_std), 1e-6)
    return ratio, ratio >= _NOISE_RATIO_THRESHOLD


def run_checks(image_bgr: np.ndarray, mask: Optional[np.ndarray]) -> tuple[List[NocForensicFlag], float]:
    """Runs all forensic checks against the located stamp region and returns
    (flags, authenticity_score in [0, 100]). If no stamp region was found,
    the document fails outright."""
    flags: List[NocForensicFlag] = []

    if mask is None or not np.any(mask):
        flags.append(
            NocForensicFlag(
                code="no_stamp_detected",
                message="No official stamp/seal could be located on the document.",
                severity="critical",
            )
        )
        return flags, 0.0

    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    background_mask = _reference_background_mask(gray, mask)

    score = 100.0

    ela_ratio, ela_anomaly = error_level_analysis(image_bgr, mask, background_mask)
    if ela_anomaly:
        flags.append(
            NocForensicFlag(
                code="ela_anomaly",
                message=(
                    f"Stamp region shows a compression-error signature "
                    f"{ela_ratio:.2f}x the document's other printed content, "
                    f"consistent with digital editing or pasting."
                ),
                severity="critical",
            )
        )
        score -= 40

    edge_ratio, edge_anomaly = edge_boundary_discontinuity(image_bgr, mask, background_mask)
    if edge_anomaly:
        flags.append(
            NocForensicFlag(
                code="edge_boundary_anomaly",
                message=(
                    f"Stamp boundary edge strength is {edge_ratio:.2f}x the "
                    f"document's typical ink edges, suggesting a hard-edged "
                    f"copy-paste splice rather than natural ink bleed."
                ),
                severity="warning",
            )
        )
        score -= 25

    noise_ratio, noise_anomaly = color_noise_consistency(image_bgr, mask, background_mask)
    if noise_anomaly:
        flags.append(
            NocForensicFlag(
                code="noise_profile_anomaly",
                message=(
                    f"Stamp region's noise/grain profile differs {noise_ratio:.2f}x "
                    f"from the document's other printed content, suggesting it "
                    f"originated from a different image source."
                ),
                severity="warning",
            )
        )
        score -= 20

    cnn_forged_prob, cnn_anomaly = cnn_is_forged_anomaly(image_bgr, mask)
    if cnn_anomaly and cnn_forged_prob is not None:
        flags.append(
            NocForensicFlag(
                code="cnn_forgery_signal",
                message=(
                    f"CNN stamp-authenticity model flags this region as forged "
                    f"with {cnn_forged_prob * 100:.0f}% confidence."
                ),
                severity="critical",
            )
        )
        score -= 35

    if not flags:
        flags.append(
            NocForensicFlag(
                code="stamp_consistent",
                message="Stamp region is consistent with the rest of the document across all forensic checks.",
                severity="info",
            )
        )

    return flags, max(score, 0.0)
