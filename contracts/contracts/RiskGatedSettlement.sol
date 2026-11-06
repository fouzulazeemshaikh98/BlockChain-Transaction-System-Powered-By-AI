// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title RiskGatedSettlement - releases funds only with a valid AI risk attestation
/// @notice The FastAPI risk engine (the "risk oracle") signs an attestation
/// that binds its risk score to one specific transfer: chain id, this
/// contract, sender, token, receiver, amount, transfer id, score and an
/// expiry two minutes ahead. settle() recovers the signer, rejects anything
/// not signed by the oracle, expired, or already used, and only moves funds
/// when the score is at or below maxRiskScore.
contract RiskGatedSettlement is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    address public riskOracle;              // signing key held by the AI risk engine
    uint8 public maxRiskScore = 40;         // fused scores above this are blocked (0-100)
    mapping(bytes32 => bool) public executed; // replay protection per transfer id

    event Settled(bytes32 indexed transferId, address from, address to, uint256 amount, uint8 score);
    event Blocked(bytes32 indexed transferId, address from, uint8 score);
    event RiskOracleUpdated(address indexed oldOracle, address indexed newOracle);
    event MaxRiskScoreUpdated(uint8 oldScore, uint8 newScore);

    constructor(address oracle) Ownable(msg.sender) {
        riskOracle = oracle;
    }

    function settle(
        IERC20 token,
        address to,
        uint256 amount,
        bytes32 transferId,
        uint8 riskScore,
        uint256 expiry,
        bytes calldata oracleSig
    ) external nonReentrant {
        require(block.timestamp <= expiry, "Attestation expired");
        require(!executed[transferId], "Transfer already processed");

        // The attestation is bound to chain, contract, parties, amount, id, score and expiry
        bytes32 digest = keccak256(
            abi.encode(
                block.chainid, address(this), msg.sender, address(token),
                to, amount, transferId, riskScore, expiry
            )
        );
        address signer = ECDSA.recover(MessageHashUtils.toEthSignedMessageHash(digest), oracleSig);
        require(signer == riskOracle, "Invalid risk attestation");

        executed[transferId] = true;

        if (riskScore > maxRiskScore) {
            // compliance decision enforced on-chain
            emit Blocked(transferId, msg.sender, riskScore);
            return;
        }

        token.safeTransferFrom(msg.sender, to, amount);
        emit Settled(transferId, msg.sender, to, amount, riskScore);
    }

    function setRiskOracle(address oracle) external onlyOwner {
        emit RiskOracleUpdated(riskOracle, oracle);
        riskOracle = oracle;
    }

    function setMaxRiskScore(uint8 score) external onlyOwner {
        require(score <= 100, "Score out of range");
        emit MaxRiskScoreUpdated(maxRiskScore, score);
        maxRiskScore = score;
    }
}
