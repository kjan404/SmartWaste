"""Extract simple image features and run the trained baseline classifier."""

import json
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageOps

CLASSES = ("empty", "paper", "plastic")
Image.MAX_IMAGE_PIXELS = 2_000_000


def features(image):
    image = ImageOps.exif_transpose(image).convert("RGB")
    rgb = np.asarray(ImageOps.fit(image, (64, 64)), dtype=np.float64) / 255
    gray = rgb.mean(axis=2)
    dy, dx = np.gradient(gray)
    magnitude = np.hypot(dx, dy)
    angle = (np.arctan2(dy, dx) % np.pi) * (8 / np.pi)
    vector = []
    for y in range(0, 64, 16):
        for x in range(0, 64, 16):
            tile = np.s_[y:y + 16, x:x + 16]
            patch = rgb[tile]
            vector.extend(patch.mean(axis=(0, 1)))
            vector.extend(patch.std(axis=(0, 1)))
            histogram = np.bincount(
                np.minimum(angle[tile].astype(int), 7).ravel(),
                weights=magnitude[tile].ravel(),
                minlength=8,
            )
            vector.extend(histogram / max(np.linalg.norm(histogram), 1e-8))
            vector.append(magnitude[tile].mean())
    return vector


class Model:
    def __init__(self, path):
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        self.classes = data["classes"]
        self.weights = np.array(data["weights"], dtype=float)
        self.bias = np.array(data["bias"], dtype=float)
        if (self.classes != list(CLASSES) or self.weights.shape != (3, 240)
                or self.bias.shape != (3,) or not np.isfinite(self.weights).all()
                or not np.isfinite(self.bias).all()):
            raise ValueError("Invalid SortCycle model. Run train.py to regenerate it.")

    def predict(self, jpeg):
        with Image.open(BytesIO(jpeg)) as image:
            if image.format != "JPEG" or image.width * image.height > Image.MAX_IMAGE_PIXELS:
                raise ValueError("Expected a JPEG frame of at most 2 megapixels.")
            logits = self.weights @ features(image) + self.bias
        scores = np.exp(logits - logits.max())
        scores /= scores.sum()
        i = int(scores.argmax())
        return self.classes[i], float(scores[i])
