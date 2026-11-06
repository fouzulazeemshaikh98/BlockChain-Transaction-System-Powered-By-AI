import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// Optimism Sepolia is left preconfigured but unfunded — deploying there requires
// dropping a *testnet-only* wallet private key into contracts/.env yourself.
// Never commit a real private key here.
const OPTIMISM_SEPOLIA_RPC_URL =
  process.env.OPTIMISM_SEPOLIA_RPC_URL || "https://sepolia.optimism.io";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // OpenZeppelin 5.x's ECDSA/Bytes helpers use the MCOPY opcode (Cancun).
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      // LOCAL_RPC_URL lets the Render chain container deploy to the node it
      // started on $PORT (see render-start.sh).
      url: process.env.LOCAL_RPC_URL || "http://127.0.0.1:8545",
      chainId: 31337,
    },
    optimismSepolia: {
      url: OPTIMISM_SEPOLIA_RPC_URL,
      chainId: 11155420,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
};

export default config;
