"""CNN-based stamp-authenticity signal, complementary to the classical
ELA/edge/noise checks in noc_forensic_service.py. Lazily loads the trained
StampCNN weights on first use; if torch isn't installed or the model
hasn't been trained yet (ml/artifacts/stamp_cnn.pt missing), the check is
skipped entirely rather than blocking verification - the same fallback
philosophy the spec's behavioral IsolationForest already uses.
"""

import os
from typing import Optional

import numpy as np

from ml.stamp_crop import crop_stamp_region

_ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "..", "ml", "artifacts", "stamp_cnn.pt")
_FORGED_PROB_THRESHOLD = 0.6

_model = None
_load_attempted = False


def _get_model():
    global _model, _load_attempted
    if _load_attempted:
        return _model
    _load_attempted = True

    if not os.path.exists(_ARTIFACT_PATH):
        return None
    try:
        import torch

        from ml.stamp_cnn import StampCNN

        model = StampCNN()
        model.load_state_dict(torch.load(_ARTIFACT_PATH, map_location="cpu"))
        model.eval()
        _model = model
    except Exception:
        _model = None
    return _model


def is_available() -> bool:
    return _get_model() is not None


def forged_probability(image_bgr: np.ndarray, mask: Optional[np.ndarray]) -> Optional[float]:
    """Returns the model's forged-class probability in [0, 1], or None if
    the model isn't available or no stamp region was found to crop."""
    model = _get_model()
    if model is None or mask is None:
        return None

    crop = crop_stamp_region(image_bgr, mask)
    if crop is None:
        return None

    import torch

    rgb = crop[:, :, ::-1].astype(np.float32) / 255.0  # BGR -> RGB, [0,1]
    tensor = torch.from_numpy(rgb).permute(2, 0, 1).unsqueeze(0)  # 1,3,H,W
    with torch.no_grad():
        probs = torch.softmax(model(tensor), dim=1)[0]
    return float(probs[1])  # class 1 = forged


def is_forged_anomaly(image_bgr: np.ndarray, mask: Optional[np.ndarray]) -> tuple[Optional[float], bool]:
    prob = forged_probability(image_bgr, mask)
    if prob is None:
        return None, False
    return prob, prob >= _FORGED_PROB_THRESHOLD


def explain(image_bgr: np.ndarray, mask: Optional[np.ndarray]) -> Optional[str]:
    """Returns a base64 Grad-CAM heatmap overlay data URI showing which
    pixels drove the forged-class score, or None if the model/stamp region
    aren't available. Best-effort: any failure here degrades to no
    heatmap rather than failing NOC verification."""
    model = _get_model()
    if model is None or mask is None:
        return None

    crop = crop_stamp_region(image_bgr, mask)
    if crop is None:
        return None

    try:
        from ml.grad_cam import generate_heatmap_overlay

        return generate_heatmap_overlay(model, crop)
    except Exception:
        return None
