import numpy as np

from models.analysis import BehavioralFeatures


def to_vector(features: BehavioralFeatures) -> list[float]:
    return [features.amount, features.gas_used, features.gas_price]


def to_matrix(features_list: list[BehavioralFeatures]) -> np.ndarray:
    return np.array([to_vector(f) for f in features_list], dtype="float64")
