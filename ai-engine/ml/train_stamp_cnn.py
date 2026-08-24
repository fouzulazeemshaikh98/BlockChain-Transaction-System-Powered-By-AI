"""Trains StampCNN on the synthetic dataset from
scripts/generate_cnn_dataset.py and saves weights to ml/artifacts/ - only
if validation accuracy clears a sanity bar, so a broken dataset/training
run can't silently ship a useless (or worse, confidently-wrong) model into
the forensic pipeline.

Run from ai-engine/: python ml/train_stamp_cnn.py
"""

import os

import numpy as np
import torch
import torch.nn as nn

from ml.stamp_cnn import StampCNN

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "stamp_dataset.npz")
ARTIFACT_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "stamp_cnn.pt")
MIN_VAL_ACCURACY = 0.90
EPOCHS = 25
BATCH_SIZE = 32
VAL_FRACTION = 0.2
SEED = 42


def _load_dataset() -> tuple[torch.Tensor, torch.Tensor, torch.Tensor, torch.Tensor]:
    data = np.load(DATA_PATH)
    images = data["images"].astype(np.float32) / 255.0  # N,H,W,3
    labels = data["labels"].astype(np.int64)

    rng = np.random.default_rng(SEED)
    idx = rng.permutation(len(labels))
    images, labels = images[idx], labels[idx]

    split = int(len(labels) * (1 - VAL_FRACTION))
    x_train = torch.from_numpy(images[:split]).permute(0, 3, 1, 2)  # N,3,H,W
    y_train = torch.from_numpy(labels[:split])
    x_val = torch.from_numpy(images[split:]).permute(0, 3, 1, 2)
    y_val = torch.from_numpy(labels[split:])
    return x_train, y_train, x_val, y_val


def main() -> None:
    torch.manual_seed(SEED)
    x_train, y_train, x_val, y_val = _load_dataset()
    print(f"train={len(y_train)} val={len(y_val)}")

    model = StampCNN()
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
    criterion = nn.CrossEntropyLoss()

    n = len(y_train)
    for epoch in range(1, EPOCHS + 1):
        model.train()
        perm = torch.randperm(n)
        total_loss = 0.0
        for start in range(0, n, BATCH_SIZE):
            batch_idx = perm[start : start + BATCH_SIZE]
            xb, yb = x_train[batch_idx], y_train[batch_idx]

            optimizer.zero_grad()
            logits = model(xb)
            loss = criterion(logits, yb)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * len(batch_idx)

        model.eval()
        with torch.no_grad():
            val_logits = model(x_val)
            val_preds = val_logits.argmax(dim=1)
            val_acc = float((val_preds == y_val).float().mean())
        print(f"epoch {epoch:02d}  train_loss={total_loss / n:.4f}  val_acc={val_acc:.4f}")

    if val_acc < MIN_VAL_ACCURACY:
        raise SystemExit(
            f"Refusing to save: val_acc={val_acc:.4f} is below the {MIN_VAL_ACCURACY} sanity bar. "
            "Check the dataset generator before retrying."
        )

    os.makedirs(os.path.dirname(ARTIFACT_PATH), exist_ok=True)
    torch.save(model.state_dict(), ARTIFACT_PATH)
    print(f"Saved model (val_acc={val_acc:.4f}) to {ARTIFACT_PATH}")


if __name__ == "__main__":
    main()
