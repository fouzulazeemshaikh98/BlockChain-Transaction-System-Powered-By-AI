"""Shared crop/resize logic for the stamp-forgery CNN, used identically by
the training-set generator and the live inference service so the model
never sees a distribution shift between train and inference preprocessing.
"""

from typing import Optional

import cv2
import numpy as np

CROP_SIZE = 64
_PAD_FRACTION = 0.15


def crop_stamp_region(image_bgr: np.ndarray, mask: np.ndarray, crop_size: int = CROP_SIZE) -> Optional[np.ndarray]:
    """Crops a padded square around the stamp mask's bounding box and
    resizes to (crop_size, crop_size). Returns None if the mask is empty."""
    if mask is None or not np.any(mask):
        return None

    x, y, w, h = cv2.boundingRect(mask)
    pad = int(_PAD_FRACTION * max(w, h))
    x0, y0 = max(x - pad, 0), max(y - pad, 0)
    x1, y1 = min(x + w + pad, image_bgr.shape[1]), min(y + h + pad, image_bgr.shape[0])

    crop = image_bgr[y0:y1, x0:x1]
    if crop.size == 0:
        return None
    return cv2.resize(crop, (crop_size, crop_size), interpolation=cv2.INTER_AREA)
