from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import forensics, noc, preprocess, risk, risk_v1, semantic, template

app = FastAPI(
    title="AI Block System - AI Risk Engine",
    description=(
        "Multi-module transaction risk analysis (preprocessing, semantic "
        "intent-vs-behavior analysis, institutional protocol-template "
        "matching, micro-level forensics, weighted risk scoring) plus NOC "
        "document verification (OCR + stamp forgery forensics) for the "
        "NOC-gated transfer flow."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(preprocess.router, prefix="/api/analyze", tags=["preprocess"])
app.include_router(semantic.router, prefix="/api/analyze", tags=["semantic"])
app.include_router(template.router, prefix="/api/analyze", tags=["template"])
app.include_router(forensics.router, prefix="/api/analyze", tags=["forensics"])
app.include_router(risk.router, prefix="/api/analyze", tags=["risk"])
app.include_router(noc.router, prefix="/api/noc", tags=["noc"])
# Risk oracle used by the risk-gated settlement flow (POST /api/transfers).
app.include_router(risk_v1.router, prefix="/v1", tags=["risk-oracle"])


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
