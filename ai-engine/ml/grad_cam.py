"""Grad-CAM for StampCNN: shows *where* in the stamp crop the model's
forged-class decision came from, rather than just a bare probability.

Standard Grad-CAM (Selvaraju et al.) targeting the last conv block's ReLU
output (features[10] - 64 channels, spatial 16x16, right before the
AdaptiveAvgPool2d that collapses to the classifier). Channel-wise gradients
of the forged-class logit w.r.t. those activations are global-average-pooled
into per-channel weights, used to weight-and-sum the activation maps, ReLU'd
(only positive contribution to the forged class matters), then resized back
up to the crop and rendered as a JET-colormap overlay.
"""

import base64

import cv2
import numpy as np
import torch
import torch.nn.functional as F

from ml.stamp_cnn import StampCNN

_TARGET_LAYER_INDEX = 10  # features[10] = ReLU after the 3rd conv block
_FORGED_CLASS = 1
_OVERLAY_ALPHA = 0.45


def generate_heatmap_overlay(model: StampCNN, crop_bgr: np.ndarray) -> str:
    """Returns a base64-encoded JPEG data URI of crop_bgr with a Grad-CAM
    heatmap overlaid, explaining the forged-class prediction."""
    activations: list[torch.Tensor] = []
    gradients: list[torch.Tensor] = []

    layer = model.features[_TARGET_LAYER_INDEX]
    fwd_handle = layer.register_forward_hook(lambda _m, _i, out: activations.append(out))
    bwd_handle = layer.register_full_backward_hook(lambda _m, _gi, go: gradients.append(go[0]))

    try:
        rgb = crop_bgr[:, :, ::-1].astype(np.float32) / 255.0
        tensor = torch.from_numpy(rgb.copy()).permute(2, 0, 1).unsqueeze(0)
        tensor.requires_grad_(False)

        model.zero_grad(set_to_none=True)
        logits = model(tensor)
        logits[0, _FORGED_CLASS].backward()

        activation = activations[0][0]  # C,H,W
        gradient = gradients[0][0]  # C,H,W
        weights = gradient.mean(dim=(1, 2))  # C

        cam = torch.einsum("c,chw->hw", weights, activation)
        cam = F.relu(cam)
        cam = cam.detach().numpy()
    finally:
        fwd_handle.remove()
        bwd_handle.remove()

    cam_max = cam.max()
    cam = cam / cam_max if cam_max > 1e-8 else cam
    cam_resized = cv2.resize(cam, (crop_bgr.shape[1], crop_bgr.shape[0]))
    heatmap = cv2.applyColorMap((cam_resized * 255).astype(np.uint8), cv2.COLORMAP_JET)

    overlay = cv2.addWeighted(heatmap, _OVERLAY_ALPHA, crop_bgr, 1 - _OVERLAY_ALPHA, 0)

    ok, encoded = cv2.imencode(".jpg", overlay, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        raise RuntimeError("Failed to encode Grad-CAM overlay.")
    return "data:image/jpeg;base64," + base64.b64encode(encoded.tobytes()).decode("ascii")
