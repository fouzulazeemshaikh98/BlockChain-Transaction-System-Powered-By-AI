"""POST /v1/risk/score - the risk-oracle endpoint from report Appendix C.2.

Pipeline: behavioural (XGBoost + Isolation Forest) -> protocol template ->
micro-level checks -> weighted fusion (0.45 / 0.25 / 0.30) -> APPROVE if the
0-100 score is <= 40, else BLOCK -> sign an attestation the
RiskGatedSettlement contract can verify (valid for 2 minutes).
"""

import time
from pathlib import Path

import joblib
import jwt
from eth_abi import encode
from eth_account.messages import encode_defunct
from eth_utils import keccak, to_checksum_address
from fastapi import APIRouter, Depends, Header, HTTPException

from ml.risk_features import extract_features
from models.risk_v1 import ModuleBreakdown, RiskResponse, TransferRequest
from services.oracle_config import ATTESTATION_TTL_SECONDS, CRITICAL_MODULE_SCORE, THRESHOLD, WEIGHTS, get_config, reload_config
from services.transfer_checks import match_protocol_template, micro_level_checks, record_attested

router = APIRouter()

_MODELS_DIR = Path(__file__).resolve().parents[2] / "models"
_models: dict = {}


def _load_models():
    if "clf" not in _models:
        try:
            _models["clf"] = joblib.load(_MODELS_DIR / "xgb_risk.joblib")   # supervised fraud classifier
            _models["iso"] = joblib.load(_MODELS_DIR / "iso_forest.joblib")  # unsupervised anomaly model
        except FileNotFoundError:
            raise HTTPException(
                503, "Risk models are not trained yet. Run: python scripts/train_risk_models.py"
            )
    return _models["clf"], _models["iso"]


def verify_jwt(authorization: str | None = Header(default=None)) -> dict:
    """Accepts the same HS256 bearer token the ASP.NET Core backend issues."""
    cfg = get_config()
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    try:
        return jwt.decode(
            authorization[7:],
            cfg.jwt_key,
            algorithms=["HS256"],
            issuer=cfg.jwt_issuer,
            audience=cfg.jwt_audience,
        )
    except jwt.PyJWTError as exc:
        raise HTTPException(401, f"Invalid token: {exc}") from exc


@router.post("/risk/score", response_model=RiskResponse)
def score(req: TransferRequest, user: dict = Depends(verify_jwt)) -> RiskResponse:
    cfg = get_config()
    if cfg.settlement_contract is None:
        cfg = reload_config()  # contracts may have been deployed after startup
    if cfg.settlement_contract is None:
        raise HTTPException(503, "SETTLEMENT_CONTRACT is not configured and no local deployment was found.")
    clf, iso = _load_models()

    # A. Behavioural analysis
    x = extract_features(req)
    p_fraud = float(clf.predict_proba([x])[0, 1])
    anomaly = float(-iso.score_samples([x])[0])  # higher = more anomalous
    behavioural = min(1.0, 0.7 * p_fraud + 0.3 * anomaly)
    behaviour_notes = []
    if p_fraud >= 0.5:
        behaviour_notes.append(f"Behavioural model: transfer resembles known fraud patterns (p={p_fraud:.2f}).")

    # B. Protocol template verification, C. micro-level checks
    template_dev, template_notes, template_name = match_protocol_template(req)
    micro, micro_notes = micro_level_checks(req, cfg.chain_id)

    fused = WEIGHTS["behavioural"] * behavioural + WEIGHTS["template"] * template_dev + WEIGHTS["micro"] * micro
    # Critical-finding override: a weighted average caps a single module's
    # influence at its weight (micro-level = 30 points max), so a certain
    # replay or chain-id mismatch would otherwise still be APPROVED. Any
    # module at >= CRITICAL_MODULE_SCORE raises the score to at least that
    # module's level, so both the decision and the on-chain
    # `riskScore > maxRiskScore` check block it.
    critical = [s for s in (behavioural, template_dev, micro) if s >= CRITICAL_MODULE_SCORE]
    if critical:
        fused = max(fused, max(critical))
    risk = max(0, min(100, int(round(100 * fused))))
    expiry = int(time.time()) + ATTESTATION_TTL_SECONDS  # attestation valid for 2 minutes

    digest = keccak(
        encode(
            ["uint256", "address", "address", "address", "address", "uint256", "bytes32", "uint8", "uint256"],
            [
                cfg.chain_id,
                cfg.settlement_contract,
                to_checksum_address(req.sender),
                to_checksum_address(req.token),
                to_checksum_address(req.receiver),
                req.amount,
                bytes.fromhex(req.transfer_id[2:]),
                risk,
                expiry,
            ],
        )
    )
    signature = "0x" + bytes(cfg.account.sign_message(encode_defunct(primitive=digest)).signature).hex()
    record_attested(req)

    return RiskResponse(
        risk_score=risk,
        decision="BLOCK" if risk > THRESHOLD else "APPROVE",
        findings=behaviour_notes + template_notes + micro_notes,
        expiry=expiry,
        signature=signature,
        modules=ModuleBreakdown(
            behavioural=round(behavioural, 4),
            template=round(template_dev, 4),
            micro=round(micro, 4),
            xgb_fraud_probability=round(p_fraud, 4),
            isolation_anomaly=round(anomaly, 4),
            template_name=template_name,
        ),
        chain_id=cfg.chain_id,
        settlement_contract=cfg.settlement_contract,
        oracle_address=cfg.account.address,
    )


@router.get("/risk/oracle")
def oracle_info() -> dict:
    cfg = reload_config()
    return {
        "oracle_address": cfg.account.address,
        "chain_id": cfg.chain_id,
        "settlement_contract": cfg.settlement_contract,
        "weights": WEIGHTS,
        "threshold": THRESHOLD,
        "critical_module_score": CRITICAL_MODULE_SCORE,
        "using_public_test_key": cfg.using_test_key,
    }
