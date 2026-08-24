// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Gates fund transfers behind an off-chain AI verification step.
/// The ASP.NET Core backend is the only account allowed to call
/// executeTransfer, and only does so after the FastAPI AI engine has
/// returned a "genuine" verdict for the NOC document authorizing the
/// transfer. The contract holds its own mUSDC balance (funded by the
/// owner) and pays recipients directly, so no separate treasury approval
/// step is needed for the demo.
contract TransactionGateway is Ownable {
    IERC20 public immutable token;
    address public verifier;

    struct TransferRecord {
        address recipient;
        uint256 amount;
        string originCity;
        string destCity;
        bytes32 nocDocHash;
        uint256 timestamp;
    }

    uint256 public transferCount;
    mapping(uint256 => TransferRecord) public transfers;

    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);
    event TransferExecuted(
        uint256 indexed transferId,
        address indexed recipient,
        uint256 amount,
        string originCity,
        string destCity,
        bytes32 nocDocHash
    );

    error NotVerifier();
    error InvalidRecipient();
    error InvalidAmount();

    modifier onlyVerifier() {
        if (msg.sender != verifier) revert NotVerifier();
        _;
    }

    constructor(
        address tokenAddress,
        address initialVerifier,
        address initialOwner
    ) Ownable(initialOwner) {
        token = IERC20(tokenAddress);
        verifier = initialVerifier;
    }

    function setVerifier(address newVerifier) external onlyOwner {
        emit VerifierUpdated(verifier, newVerifier);
        verifier = newVerifier;
    }

    /// @dev nocDocHash cryptographically ties this on-chain record to the
    /// specific NOC document the AI engine verified as genuine.
    function executeTransfer(
        address recipient,
        uint256 amount,
        string calldata originCity,
        string calldata destCity,
        bytes32 nocDocHash
    ) external onlyVerifier returns (uint256 transferId) {
        if (recipient == address(0)) revert InvalidRecipient();
        if (amount == 0) revert InvalidAmount();

        transferId = transferCount++;
        transfers[transferId] = TransferRecord({
            recipient: recipient,
            amount: amount,
            originCity: originCity,
            destCity: destCity,
            nocDocHash: nocDocHash,
            timestamp: block.timestamp
        });

        require(token.transfer(recipient, amount), "Transfer failed");

        emit TransferExecuted(transferId, recipient, amount, originCity, destCity, nocDocHash);
    }
}
