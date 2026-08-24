from fastapi import APIRouter

from models.transaction import NormalizedTransaction, RawTransaction
from services.preprocessing_service import preprocess

router = APIRouter()


@router.post("/preprocess", response_model=NormalizedTransaction)
def preprocess_transaction(raw: RawTransaction) -> NormalizedTransaction:
    return preprocess(raw)
