"""A small CNN that classifies a localized NOC-stamp crop as genuine or
forged - a signal complementary to the classical ELA/edge/noise checks in
services/noc_forensic_service.py, not a replacement for them.

Deliberately small (three conv blocks, ~50K params) because the training
set (scripts/generate_cnn_dataset.py) is a few hundred synthetic crops per
class, not a large real-world corpus - a bigger network would just
memorize it. Input is a 64x64x3 RGB crop, normalized to [0, 1].
"""

import torch
import torch.nn as nn

CROP_SIZE = 64


class StampCNN(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv2d(3, 16, kernel_size=3, padding=1),
            nn.BatchNorm2d(16),
            nn.ReLU(inplace=False),  # inplace=True breaks Grad-CAM's hook on this layer's output
            nn.MaxPool2d(2),  # 64 -> 32
            nn.Conv2d(16, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=False),  # inplace=True breaks Grad-CAM's hook on this layer's output
            nn.MaxPool2d(2),  # 32 -> 16
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(inplace=False),  # inplace=True breaks Grad-CAM's hook on this layer's output
            nn.AdaptiveAvgPool2d(1),  # -> 64x1x1
        )
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(64, 2),  # logits: [genuine, forged]
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.classifier(self.features(x))
