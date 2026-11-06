# Render service "aiblock-ai-engine" (FastAPI risk oracle + NOC forensics).
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements-render.txt .
RUN pip install --no-cache-dir -r requirements-render.txt
COPY . .
# Train the behavioural models in the image so they always match the
# installed xgboost/scikit-learn versions (synthetic data, ~10 s).
RUN python scripts/train_risk_models.py
ENV PORT=8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
