"""Generates two synthetic NOC-like documents so the /api/noc/verify
forensic pipeline can be exercised without real scanned certificates:

  samples/clean_noc.jpg    - a single, consistently-compressed document with
                              uniform paper "grain" noise throughout.
  samples/tampered_noc.jpg - the same document with its stamp swapped for
                              one lifted from an independently-generated
                              image (different grain realization, heavier
                              noise, lower JPEG quality) and hard-pasted in,
                              simulating a copy-paste/splicing forgery.

Run from ai-engine/: python scripts/generate_noc_samples.py
"""

import os

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "samples")
STAMP_CENTER = (680, 420)
STAMP_RADIUS = 70
PASTE_RADIUS = STAMP_RADIUS + 15


def _font(size: int) -> ImageFont.ImageFont:
    try:
        return ImageFont.truetype("arial.ttf", size)
    except OSError:
        return ImageFont.load_default()


def _draw_document(draw: ImageDraw.ImageDraw) -> None:
    draw.rectangle([0, 0, 899, 599], fill="white")
    draw.text((60, 40), "NO OBJECTION CERTIFICATE", fill="black", font=_font(28))
    lines = [
        "Name: Ayesha Khan",
        "Origin City: Karachi",
        "Destination City: Dubai",
        "Issued By: Ministry of Interior",
        "Date: 01/03/2026",
        "Authorized Amount: USD 750,000",
        "",
        "This certificate authorizes the above-named applicant to",
        "conduct a fund transfer from the origin to the destination",
        "city named above, subject to standard compliance review.",
    ]
    y = 110
    for line in lines:
        draw.text((60, y), line, fill="black", font=_font(18))
        y += 32


def _draw_stamp(draw: ImageDraw.ImageDraw, center, radius, ink=(30, 60, 170)) -> None:
    cx, cy = center
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], outline=ink, width=4)
    draw.ellipse(
        [cx - radius + 10, cy - radius + 10, cx + radius - 10, cy + radius - 10], outline=ink, width=2
    )
    draw.text((cx - 55, cy - 12), "OFFICIAL SEAL", fill=ink, font=_font(14))
    draw.text((cx - 40, cy + 6), "VERIFIED", fill=ink, font=_font(12))


def _add_noise(image: np.ndarray, sigma: float, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
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


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)

    clean_pil = Image.new("RGB", (900, 600), "white")
    draw = ImageDraw.Draw(clean_pil)
    _draw_document(draw)
    _draw_stamp(draw, STAMP_CENTER, STAMP_RADIUS)
    clean_bgr = cv2.cvtColor(np.array(clean_pil), cv2.COLOR_RGB2BGR)
    clean_bgr = _add_noise(clean_bgr, sigma=4.0, seed=1)
    clean_bgr = _jpeg_roundtrip(clean_bgr, 92)
    cv2.imwrite(os.path.join(OUT_DIR, "clean_noc.jpg"), clean_bgr)

    donor_pil = Image.new("RGB", (900, 600), "white")
    donor_draw = ImageDraw.Draw(donor_pil)
    _draw_stamp(donor_draw, STAMP_CENTER, STAMP_RADIUS, ink=(28, 58, 168))
    donor_bgr = cv2.cvtColor(np.array(donor_pil), cv2.COLOR_RGB2BGR)
    donor_bgr = _add_noise(donor_bgr, sigma=4.0, seed=2)
    donor_bgr = _add_noise(donor_bgr, sigma=30.0, seed=3)
    donor_bgr = _jpeg_roundtrip(donor_bgr, 20)

    paste_mask = _circular_mask(clean_bgr.shape, STAMP_CENTER, PASTE_RADIUS)
    tampered_bgr = clean_bgr.copy()
    tampered_bgr[paste_mask] = donor_bgr[paste_mask]
    tampered_bgr = _jpeg_roundtrip(tampered_bgr, 92)
    cv2.imwrite(os.path.join(OUT_DIR, "tampered_noc.jpg"), tampered_bgr)

    print(f"Wrote samples to {os.path.abspath(OUT_DIR)}")


if __name__ == "__main__":
    main()
