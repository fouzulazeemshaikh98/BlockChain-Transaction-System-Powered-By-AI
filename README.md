# AI Block System

**AI-Driven Decentralized Transaction System with Layer-2 Blockchain Scaling**

An institutional-grade blockchain transaction risk and forensics platform,
plus a NOC-gated cross-border transfer flow.

- **Analyze Transaction**: submit any transaction (hash, JSON, or manual
  fields) and run it through four AI modules — semantic intent-vs-behavior
  analysis, institutional protocol-template matching, micro-level forensics
  (replay/nonce-reuse/gas-anomaly/HEX-entropy), and ML-assisted behavioral
  scoring — producing a weighted 0–100 risk score, a
  VERIFIED/LOW/MEDIUM/HIGH/CRITICAL verdict, and a full forensic report.
- **Send Transfer**: upload a NOC (No Objection Certificate) → AI verifies
  the document's stamp is genuine (OCR + forgery forensics) → only then does
  the resulting transfer run through the same risk-analysis pipeline → only
  a VERIFIED/LOW/MEDIUM result unlocks a real on-chain settlement (Solidity,
  local Hardhat testnet) to one of four demo branch wallets.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for what's built vs. deferred.

## Stack

| Layer | Tech |
|---|---|
| Orchestration API | ASP.NET Core (.NET 9) + EF Core + SQL Server LocalDB + JWT auth |
| AI risk engine | FastAPI (Python) + pandas/numpy/scikit-learn (risk) + OpenCV/Tesseract (NOC forensics) |
| Frontend | React + Vite + TypeScript + Tailwind + Recharts |
| Blockchain layer | Solidity + Hardhat (local devnet) + Nethereum |

## Prerequisites

- .NET SDK 9, Python 3.12, Node.js 18+
- SQL Server LocalDB
- Tesseract OCR (`winget install --id UB-Mannheim.TesseractOCR -e`)
- `dotnet tool install --global dotnet-ef` (for migrations)

## First-time setup

```bash
# Contracts (only needed once, already deployed if contracts/deployments/localhost.json exists)
cd contracts
npm install
npx hardhat compile

# AI engine
cd ../ai-engine
python -m venv .venv
./.venv/Scripts/pip install -r requirements.txt
./.venv/Scripts/python scripts/generate_noc_samples.py   # creates samples/*.jpg for testing

# CNN stamp-forgery model (optional — NOC verification works without it,
# just skips the cnn_forgery_signal check). Trains in well under a minute.
./.venv/Scripts/python scripts/generate_cnn_dataset.py   # synthetic dataset -> ml/data/
./.venv/Scripts/python ml/train_stamp_cnn.py              # trains -> ml/artifacts/stamp_cnn.pt

# Backend
cd ../backend/AiBlockSystem.Api
dotnet build
dotnet ef database update

# Frontend
cd ../../frontend
npm install
```

## Running (4 terminals)

```bash
# Terminal 1 — local blockchain
cd contracts && npx hardhat node

# Terminal 2 — deploy contracts to it (first time only)
cd contracts && npm run deploy:local

# Terminal 3 — AI engine
cd ai-engine && ./.venv/Scripts/uvicorn main:app --reload --port 8000

# Terminal 4 — backend API
cd backend/AiBlockSystem.Api && dotnet run

# Terminal 5 — frontend
cd frontend && npm run dev
```

Frontend: http://localhost:5173. Backend: http://localhost:5199 (Swagger at
`/swagger`). AI engine: http://localhost:8000 (`/docs`). The backend
auto-detects the deployed contract address from
`contracts/deployments/localhost.json` — no manual config needed.

On first run the backend seeds two demo accounts and four built-in protocol
templates:

| Email | Password | Transfer PIN | Role |
|---|---|---|---|
| `admin@aiblocksystem.local` | `admin123` | `1234` | Admin |
| `analyst@aiblocksystem.local` | `analyst123` | `1234` | Analyst |

**Change or remove these before any real deployment.** New self-registered
accounts choose their own PIN and go through email verification (simulated
— see `docs/ARCHITECTURE.md`, no SMTP is configured, the code shows up
directly in the UI instead of being emailed).

## Try the Send Transfer flow

1. Log in, go to **Send Transfer**.
2. Upload `ai-engine/samples/clean_noc.jpg` → verifies as **genuine**, shows
   the remaining monthly transfer limit.
3. Pick a destination branch, enter an amount, click **Run Risk Analysis** —
   confirm with your PIN (`1234` for the demo accounts).
4. If the risk level is MEDIUM, an Admin needs to **Approve** it (PIN again)
   before settlement unlocks; VERIFIED/LOW settle directly, HIGH/CRITICAL
   are blocked outright.
5. Click **Execute Settlement**, confirm with your PIN — get a real
   on-chain tx hash.
6. Try `ai-engine/samples/tampered_noc.jpg` instead → blocked immediately,
   with the specific forensic flags (and a Grad-CAM heatmap, if the CNN
   model is trained) explaining why (never reaches the transfer form).

## Risk-gated settlement (POST /api/transfers)

The AI engine's `/v1/risk/score` endpoint needs trained behavioural models.
Train them once (synthetic data, ~10 s):

```bash
cd ai-engine && ./.venv/Scripts/python scripts/train_risk_models.py
```

Then use the **Risk-Gated Transfer** page in the web app, or the Flutter
client in `mobile/` (see `mobile/README.md`).

## Deploying to Render (free tier)

`render.yaml` is a Render Blueprint for the whole stack:

| Render resource | What it runs |
|---|---|
| `aiblock-db` | PostgreSQL (the backend switches from SQL Server via `Database__Provider=Postgres`) |
| `aiblock-chain` | In-memory Hardhat node; contracts are redeployed on every start at fixed addresses |
| `aiblock-ai-engine` | FastAPI risk oracle + NOC forensics (no PyTorch, so the stamp-CNN check is off) |
| `aiblock-backend` | ASP.NET Core API |
| `aiblock-web` | React dashboard (static site) |

1. Push the branch to GitHub.
2. In Render, go to **New → Blueprint**, pick this repo and branch, then **Apply**.
3. If Render gave a service a different subdomain than its name, update the env
   vars marked `# URL` in `render.yaml` (in the dashboard) and redeploy.

Free-tier caveats: services sleep after ~15 min idle (first request takes
about a minute). The chain resets whenever it restarts. Uploaded NOC files
live on ephemeral disk. The free Postgres database expires after 30 days.
