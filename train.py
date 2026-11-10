"""Train the baseline on locally labeled staging-area photos."""

import argparse
import json
from pathlib import Path

from PIL import Image
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from classifier import CLASSES, features

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=ROOT / "dataset")
    parser.add_argument("--output", type=Path, default=ROOT / "model.json")
    args = parser.parse_args()
    samples, labels = [], []
    for label in CLASSES:
        folder = args.dataset / label
        files = sorted(p for p in folder.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
        if len(files) < 10:
            parser.error(f"Add at least 10 distinct images to {folder}. Use more for meaningful evaluation.")
        for file in files:
            with Image.open(file) as image:
                samples.append(features(image))
            labels.append(label)

    train_x, test_x, train_y, test_y = train_test_split(
        samples, labels, test_size=0.25, random_state=42, stratify=labels
    )
    pipeline = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
    pipeline.fit(train_x, train_y)
    print(classification_report(test_y, pipeline.predict(test_x), zero_division=0))
    scaler, model = pipeline.steps[0][1], pipeline.steps[1][1]
    weights = model.coef_ / scaler.scale_
    bias = model.intercept_ - weights @ scaler.mean_
    output = {"classes": model.classes_.tolist(), "weights": weights.tolist(), "bias": bias.tolist()}
    args.output.write_text(json.dumps(output, allow_nan=False), encoding="utf-8")
    print(f"Saved {args.output}. Confirm performance on additional photos before enabling the gate.")


if __name__ == "__main__":
    main()
