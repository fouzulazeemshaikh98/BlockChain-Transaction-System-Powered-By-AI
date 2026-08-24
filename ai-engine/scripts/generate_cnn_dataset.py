"""Generates a synthetic training set for the stamp-forgery CNN
(ml/stamp_cnn.py), by scaling up the exact same clean-vs-spliced tamper
simulation used for the two hand-crafted samples in generate_noc_samples.py
(consistent single-pass compression/noise for a "genuine" stamp; a donor
stamp rendered with a *different* noise/compression signature and hard-
pasted in for a "forged" one) across hundreds of randomized documents, then
runs each one through the real services.noc_stamp_service.locate_stamp()
so the training crops match what the model will actually see at inference
time - not a hand-picked bounding box.

This is a synthetic dataset, not real scanned certificates - the model
below learns to recognize splice/recompression artifacts, the same signal
the classical ELA/edge/noise checks target, not arbitrary real-world
forgery styles. See docs/ARCHITECTURE.md for that caveat.

Run from ai-engine/: python scripts/generate_cnn_dataset.py
"""

import os
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from ml.stamp_crop import crop_stamp_region  # noqa: E402
from services.noc_stamp_service import locate_stamp  # noqa: E402

OUT_PATH = os.path.join(os.path.dirname(__file__), "..", "ml", "data", "stamp_dataset.npz")
CROP_SIZE = 64
SAMPLES_PER_CLASS = 350

_INK_HUES = [(30, 60, 170), (170, 30, 40), (120, 40, 150), (20, 90, 40), (150, 90, 20)]
_NAMES = ["Ayesha Khan", "Bilal Ahmed", "Fatima Malik", "Hamza Raza", "Sara Iqbal"]
_CITIES = [("Karachi", "Dubai"), ("Lahore", "London"), ("Islamabad", "Doha"), ("Multan", "Manama")]
_AUTHORITIES = ["Ministry of Interior", "State Bank Liaison Office", "Customs Directorate"]


def _font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def _draw_document(draw: ImageDraw.ImageDraw, rng: np.random.Generator) -> None:
    draw.rectangle([0, 0, 899, 599], fill="white")
    draw.text((60, 40), "NO OBJECTION CERTIFICATE", fill="black", font=_font(28))
    origin, dest = _CITIES[rng.integers(0, len(_CITIES))]
    amount = int(rng.integers(10, 999)) * 1000
    lines = [
        f"Name: {_NAMES[rng.integers(0, len(_NAMES))]}",
        f"Origin City: {origin}",
        f"Destination City: {dest}",
        f"Issued By: {_AUTHORITIES[rng.integers(0, len(_AUTHORITIES))]}",
        f"Date: {rng.integers(1, 28):02d}/{rng.integers(1, 12):02d}/2026",
        f"Authorized Amount: USD {amount:,}",
        "",
        "This certificate authorizes the above-named applicant to",
        "conduct a fund transfer from the origin to the destination",
        "city named above, subject to standard compliance review.",
    ]
    y = 110
    for line in lines:
        draw.text((60, y), line, fill="black", font=_font(18))
        y += 32


def _draw_stamp(draw: ImageDraw.ImageDraw, center, radius, ink) -> None:
    cx, cy = center
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=ink, width=4)
    draw.ellipse(
        [cx - radius + 10, cy - radius + 10, cx + radius - 10, cy + radius - 10], outline=ink, width=2
    )
    draw.text((cx - 55, cy - 12), "OFFICIAL SEAL", fill=ink, font=_font(14))
    draw.text((cx - 40, cy + 6), "VERIFIED", fill=ink, font=_font(12))


def _add_noise(image: np.ndarray, sigma: float, rng: np.random.Generator) -> np.ndarray:
    noise = rng.normal(0, sigma, image.shape).astype(np.float32)
    return np.clip(image.astype(np.float32) + noise, 0, 255).astype(np.uint8)


def _jpeg_roundtrip(image_bgr: np.ndarray, quality: int) -> np.ndarray:
    ok, encoded = cv2.imencode(".jpg", image_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
    assert ok
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR)


def _circular_mask(shape, center, radius) -> np.ndarray:
    h, w = shape[:2]
    yy, xx = np.ogrid[:h, :w]
    cx, cy = center
    return ((xx - cx) ** 2 + (yy - cy) ** 2) <= radius**2


def _hue_shift(image_bgr: np.ndarray, degrees: int) -> np.ndarray:
    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV).astype(np.int16)
    hsv[..., 0] = (hsv[..., 0] + degrees) % 180
    return cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2BGR)


def _random_stamp_placement(rng: np.random.Generator):
    center = (int(rng.integers(560, 780)), int(rng.integers(350, 480)))
    radius = int(rng.integers(55, 85))
    ink = _INK_HUES[rng.integers(0, len(_INK_HUES))]
    return center, radius, ink


def _crop_stamp(image_bgr: np.ndarray) -> np.ndarray | None:
    """Runs the real detector and hands off to the same crop_stamp_region()
    the inference service uses, so training and inference preprocessing
    never drift apart. Returns None if the detector found no stamp."""
    _, mask = locate_stamp(image_bgr)
    return crop_stamp_region(image_bgr, mask, CROP_SIZE)


def _make_genuine(rng: np.random.Generator) -> np.ndarray | None:
    center, radius, ink = _random_stamp_placement(rng)
    pil = Image.new("RGB", (900, 600), "white")
    draw = ImageDraw.Draw(pil)
    _draw_document(draw, rng)
    _draw_stamp(draw, center, radius, ink)
    bgr = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    bgr = _add_noise(bgr, sigma=float(rng.uniform(2, 6)), rng=rng)
    bgr = _jpeg_roundtrip(bgr, int(rng.integers(85, 96)))
    return _crop_stamp(bgr)


def _make_forged(rng: np.random.Generator) -> np.ndarray | None:
    center, radius, ink = _random_stamp_placement(rng)
    base_pil = Image.new("RGB", (900, 600), "white")
    base_draw = ImageDraw.Draw(base_pil)
    _draw_document(base_draw, rng)
    _draw_stamp(base_draw, center, radius, ink)
    base_bgr = cv2.cvtColor(np.array(base_pil), cv2.COLOR_RGB2BGR)
    base_bgr = _add_noise(base_bgr, sigma=float(rng.uniform(2, 6)), rng=rng)
    base_bgr = _jpeg_roundtrip(base_bgr, int(rng.integers(85, 96)))

    donor_pil = Image.new("RGB", (900, 600), "white")
    donor_draw = ImageDraw.Draw(donor_pil)
    donor_ink = ink if rng.random() > 0.4 else _INK_HUES[rng.integers(0, len(_INK_HUES))]
    _draw_stamp(donor_draw, center, radius, donor_ink)
    donor_bgr = cv2.cvtColor(np.array(donor_pil), cv2.COLOR_RGB2BGR)
    donor_bgr = _add_noise(donor_bgr, sigma=float(rng.uniform(2, 6)), rng=rng)
    donor_bgr = _add_noise(donor_bgr, sigma=float(rng.uniform(15, 40)), rng=rng)
    donor_bgr = _jpeg_roundtrip(donor_bgr, int(rng.integers(10, 45)))
    if rng.random() > 0.5:
        donor_bgr = _hue_shift(donor_bgr, int(rng.integers(-12, 12)))

    paste_radius = radius + int(rng.integers(10, 22))
    paste_mask = _circular_mask(base_bgr.shape, center, paste_radius)
    tampered = base_bgr.copy()
    tampered[paste_mask] = donor_bgr[paste_mask]
    tampered = _jpeg_roundtrip(tampered, int(rng.integers(85, 96)))
    return _crop_stamp(tampered)


def main() -> None:
    rng = np.random.default_rng(42)
    images: list[np.ndarray] = []
    labels: list[int] = []

    for label, maker, count in [(0, _make_genuine, SAMPLES_PER_CLASS), (1, _make_forged, SAMPLES_PER_CLASS)]:
        made = 0
        attempts = 0
        while made < count and attempts < count * 3:
            attempts += 1
            crop = maker(rng)
            if crop is not None:
                images.append(crop)
                labels.append(label)
                made += 1
        print(f"label={label}: generated {made}/{count} (detector missed {attempts - made} attempts)")

    images_arr = np.stack(images).astype(np.uint8)
    labels_arr = np.array(labels, dtype=np.int64)

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    np.savez_compressed(OUT_PATH, images=images_arr, labels=labels_arr)
    print(f"Wrote {images_arr.shape[0]} samples ({images_arr.nbytes / 1e6:.1f} MB raw) to {OUT_PATH}")


if __name__ == "__main__":
    main()
