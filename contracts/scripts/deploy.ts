import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

// Funds the gateway with 1,000,000 mUSDC (6 decimals) so demo transfers have
// somewhere to draw from.
const GATEWAY_FUNDING = 1_000_000n * 10n ** 6n;

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

  const network = await ethers.provider.getNetwork();

  const artifact = {
    network: network.name,
    chainId: network.chainId.toString(),
    mockUSDC: tokenAddress,
    transactionGateway: gatewayAddress,
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
