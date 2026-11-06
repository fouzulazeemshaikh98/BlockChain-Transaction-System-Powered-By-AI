"""Runtime configuration for the risk-oracle endpoint.

Every value can be set through an environment variable. For local
development the defaults are read from files that already exist in this repo,
so nothing has to be copied by hand:
  * chain id + RiskGatedSettlement address <- contracts/deployments/localhost.json
  * JWT key / issuer / audience            <- backend/AiBlockSystem.Api/appsettings.json
  * RISK_ORACLE_KEY                        <- Hardhat's public test account #6

The Hardhat key is public knowledge and only valid on a local test chain. On
any public network you must set RISK_ORACLE_KEY to your own key; the
signing key never leaves this service.
"""

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from eth_account import Account
from eth_utils import to_checksum_address

_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEPLOYMENTS = _REPO_ROOT / "contracts" / "deployments" / "localhost.json"
_BACKEND_SETTINGS = _REPO_ROOT / "backend" / "AiBlockSystem.Api" / "appsettings.json"

# Hardhat default account #6 (mnemonic "test test ... junk"). TEST-ONLY.
_HARDHAT_ORACLE_KEY = "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e"
_ARBITRUM_SEPOLIA_CHAIN_ID = 421614

WEIGHTS = {"behavioural": 0.45, "template": 0.25, "micro": 0.30}
THRESHOLD = 40
# A single module at or above this (0-1) blocks on its own - see risk_v1.score().
CRITICAL_MODULE_SCORE = 0.9
ATTESTATION_TTL_SECONDS = 120


@dataclass(frozen=True)
class OracleConfig:
    account: object
    chain_id: int
    settlement_contract: str | None
    jwt_key: str
    jwt_issuer: str | None
    jwt_audience: str | None
    using_test_key: bool


def _read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return {}


@lru_cache(maxsize=1)
def get_config() -> OracleConfig:
    deployment = _read_json(_DEPLOYMENTS)
    backend = _read_json(_BACKEND_SETTINGS).get("Jwt", {})

    key = os.environ.get("RISK_ORACLE_KEY") or _HARDHAT_ORACLE_KEY
    chain_id = int(
        os.environ.get("CHAIN_ID") or deployment.get("chainId") or _ARBITRUM_SEPOLIA_CHAIN_ID
    )
    settlement = os.environ.get("SETTLEMENT_CONTRACT") or deployment.get("riskGatedSettlement")

    return OracleConfig(
        account=Account.from_key(key),
        chain_id=chain_id,
        settlement_contract=to_checksum_address(settlement) if settlement else None,
        jwt_key=os.environ.get("JWT_KEY") or backend.get("Key", ""),
        jwt_issuer=os.environ.get("JWT_ISSUER") or backend.get("Issuer"),
        jwt_audience=os.environ.get("JWT_AUDIENCE") or backend.get("Audience"),
        using_test_key=key == _HARDHAT_ORACLE_KEY,
    )


def reload_config() -> OracleConfig:
    """Re-reads the deployment file, e.g. after contracts are redeployed."""
    get_config.cache_clear()
    return get_config()
