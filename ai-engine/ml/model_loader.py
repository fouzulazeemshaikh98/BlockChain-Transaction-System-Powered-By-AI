import os
import pickle
from typing import Optional

_MODEL_PATH = os.path.join(os.path.dirname(__file__), "artifacts", "isolation_forest.pkl")


def load_pretrained_model() -> Optional[object]:
    """Returns a persisted, pre-trained IsolationForest if one has been
    placed at ml/artifacts/isolation_forest.pkl, else None. Nothing in this
    service requires a pretrained model to exist - anomaly_model.py fits a
    fresh one on-the-fly per request when enough historical samples are
    available, and falls back to a deterministic heuristic otherwise. This
    hook exists so a properly trained model can be dropped in later without
    changing any calling code."""
    if not os.path.exists(_MODEL_PATH):
        return None
    try:
        with open(_MODEL_PATH, "rb") as f:
            return pickle.load(f)
    except Exception:
        return None
