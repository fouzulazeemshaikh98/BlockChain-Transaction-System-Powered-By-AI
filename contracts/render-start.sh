#!/bin/sh
# Render entrypoint for the "aiblock-chain" service: starts a fresh Hardhat
# node on $PORT and deploys the contracts into it. The chain lives in memory,
# so every restart (including waking from free-tier sleep) starts from an
# empty chain and redeploys. Because the deployer account and transaction
# order never change, the contracts always land on the same addresses, which
# render.yaml passes to the backend and AI engine.
set -e
PORT="${PORT:-8545}"
export LOCAL_RPC_URL="http://127.0.0.1:${PORT}"

npx hardhat node --hostname 0.0.0.0 --port "$PORT" &
NODE_PID=$!

until wget -qO- --header='Content-Type: application/json' \
  --post-data='{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' "$LOCAL_RPC_URL" >/dev/null 2>&1; do
  sleep 1
done

npx hardhat run scripts/deploy.ts --network localhost
cat deployments/localhost.json

wait "$NODE_PID"
