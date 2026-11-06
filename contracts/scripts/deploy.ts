import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Funds the gateway with 1,000,000 mUSDC (6 decimals) so demo transfers have
// somewhere to draw from.
const GATEWAY_FUNDING = 1_000_000n * 10n ** 6n;
// The backend's wallet (the "verifier" signer) is the payer for risk-gated
// settlements: RiskGatedSettlement pulls funds from msg.sender via
// transferFrom, so that wallet holds mUSDC and pre-approves the contract.
const PAYER_FUNDING = 1_000_000n * 10n ** 6n;
// Hardhat's well-known local account #6 - test-only key, used by the FastAPI
// risk engine to sign attestations on the local network. On a public testnet
// set RISK_ORACLE_ADDRESS to the address of your own oracle key instead.
const LOCAL_RISK_ORACLE = "0x976EA74026E726554dB657fA54763abd0C3a0aa9";

async function main() {
  const [deployer, verifier] = await ethers.getSigners();

  console.log("Deployer:", deployer.address);
  console.log("Verifier (backend signer):", verifier.address);

  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const token = await MockUSDC.deploy(deployer.address);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("MockUSDC deployed:", tokenAddress);

  const TransactionGateway = await ethers.getContractFactory("TransactionGateway");
  const gateway = await TransactionGateway.deploy(
    tokenAddress,
    verifier.address,
    deployer.address
  );
  await gateway.waitForDeployment();
  const gatewayAddress = await gateway.getAddress();
  console.log("TransactionGateway deployed:", gatewayAddress);

  const mintTx = await token.mint(gatewayAddress, GATEWAY_FUNDING);
  await mintTx.wait();
  console.log(`Minted ${GATEWAY_FUNDING.toString()} mUSDC units to gateway`);

  const riskOracle = process.env.RISK_ORACLE_ADDRESS || LOCAL_RISK_ORACLE;
  const RiskGatedSettlement = await ethers.getContractFactory("RiskGatedSettlement");
  const settlement = await RiskGatedSettlement.deploy(riskOracle);
  await settlement.waitForDeployment();
  const settlementAddress = await settlement.getAddress();
  console.log("RiskGatedSettlement deployed:", settlementAddress, "(risk oracle:", riskOracle + ")");

  await (await token.mint(verifier.address, PAYER_FUNDING)).wait();
  await (await token.connect(verifier).approve(settlementAddress, ethers.MaxUint256)).wait();
  console.log(`Minted ${PAYER_FUNDING.toString()} mUSDC units to the backend wallet and approved the settlement contract`);

  const network = await ethers.provider.getNetwork();

  const artifact = {
    network: network.name,
    chainId: network.chainId.toString(),
    mockUSDC: tokenAddress,
    transactionGateway: gatewayAddress,
    riskGatedSettlement: settlementAddress,
    riskOracleAddress: riskOracle,
    verifierAddress: verifier.address,
    deployerAddress: deployer.address,
  };

  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${network.name || network.chainId}.json`);
  fs.writeFileSync(outFile, JSON.stringify(artifact, null, 2));
  console.log("Wrote deployment info to", outFile);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
