import numpy as np
from sklearn.ensemble import IsolationForest

from models.analysis import BehavioralFeatures
from .feature_extractor import to_matrix, to_vector
from .model_loader import load_pretrained_model

_MIN_SAMPLES_FOR_FRESH_FIT = 10


def compute_behavioral_score(
    current: BehavioralFeatures, historical: list[BehavioralFeatures]
) -> float:
    """Returns a 0-100 risk-oriented behavioral anomaly score. Prefers a
    persisted pretrained IsolationForest if one exists; otherwise fits one
    on-the-fly when there's enough historical data (>=10 points); otherwise
    falls back to a deterministic z-score heuristic so the endpoint always
    returns a sensible result, per the "must work without a trained model"
    requirement."""
    pretrained = load_pretrained_model()
    if pretrained is not None:
        try:
            x = to_matrix([current])
            raw = float(pretrained.decision_function(x)[0])
            # sklearn's decision_function: higher = more normal, roughly centered near 0.
            return float(np.clip((0.0 - raw) * 100 + 50, 0, 100))
        except Exception:
            pass  # fall through to on-the-fly / heuristic paths below

    if len(historical) >= _MIN_SAMPLES_FOR_FRESH_FIT:
        x_all = to_matrix(historical + [current])
        model = IsolationForest(n_estimators=100, contamination="auto", random_state=42)
        model.fit(x_all)
        raw_scores = model.decision_function(x_all)
        current_raw = raw_scores[-1]
        min_s, max_s = raw_scores.min(), raw_scores.max()
        if max_s - min_s < 1e-9:
            return 10.0
        normalized_normalcy = (current_raw - min_s) / (max_s - min_s)  # 0=most anomalous, 1=most normal
        return float((1 - normalized_normalcy) * 100)

    if len(historical) >= 2:
        x_hist = to_matrix(historical)
        cur = np.array(to_vector(current))
        mean = x_hist.mean(axis=0)
        std = x_hist.std(axis=0)
        std[std == 0] = 1e-9
        z = np.abs((cur - mean) / std)
        return float(np.clip(z.max() * 20, 0, 100))  # z=5 std devs -> risk 100

    return 15.0  # not enough history to judge behavior - low-moderate default, not zero
