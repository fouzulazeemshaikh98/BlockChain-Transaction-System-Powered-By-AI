from typing import Optional, Tuple

import cv2
import numpy as np

from models.noc import NocStampAnalysis

# Official stamps/seals are almost always applied in blue, red, or purple
# ink. HSV ranges are intentionally generous since scans vary in exposure
# and ink saturation.
_COLOR_RANGES = {
    "blue": [((90, 40, 40), (140, 255, 255))],
    "red": [((0, 60, 40), (10, 255, 255)), ((170, 60, 40), (180, 255, 255))],
    "purple": [((130, 40, 40), (160, 255, 255))],
}

_MIN_AREA_FRACTION = 0.0008
_MAX_AREA_FRACTION = 0.08


def _mask_for_color(hsv: np.ndarray, ranges: list[Tuple[tuple, tuple]]) -> np.ndarray:
    mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
    for lower, upper in ranges:
        mask |= cv2.inRange(hsv, np.array(lower), np.array(upper))
    return mask


def locate_stamp(image_bgr: np.ndarray) -> Tuple[NocStampAnalysis, Optional[np.ndarray]]:
    """Locates the most stamp-like colored, roughly-circular ink region on
    the document. Returns the analysis plus a binary mask of the chosen
    region (used downstream by the forensic checks), or (not-detected, None)."""
    height, width = image_bgr.shape[:2]
    page_area = float(height * width)
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)

    best_score = 0.0
    best: Optional[dict] = None
    best_mask_full: Optional[np.ndarray] = None

    for color_label, ranges in _COLOR_RANGES.items():
        color_mask = _mask_for_color(hsv, ranges)
        color_mask = cv2.morphologyEx(color_mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
        color_mask = cv2.morphologyEx(color_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

        contours, _ = cv2.findContours(color_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for contour in contours:
            area = cv2.contourArea(contour)
            area_fraction = area / page_area
            if area_fraction < _MIN_AREA_FRACTION or area_fraction > _MAX_AREA_FRACTION:
                continue

            perimeter = cv2.arcLength(contour, True)
            if perimeter == 0:
                continue

            circularity = float(4 * np.pi * area / (perimeter**2))
            circularity = min(circularity, 1.0)
            if circularity < 0.35:
                continue

            score = circularity * area
            if score > best_score:
                x, y, w, h = cv2.boundingRect(contour)
                best_score = score
                best = {
                    "bbox": [int(x), int(y), int(w), int(h)],
                    "circularity": round(circularity, 3),
                    "color": color_label,
                }
                region_mask = np.zeros_like(color_mask)
                cv2.drawContours(region_mask, [contour], -1, 255, thickness=cv2.FILLED)
                best_mask_full = region_mask

    if best is None:
        return NocStampAnalysis(stamp_detected=False), None

    analysis = NocStampAnalysis(
        stamp_detected=True,
        bounding_box=best["bbox"],
        circularity=best["circularity"],
        color_label=best["color"],
    )
    return analysis, best_mask_full
