# ── Microservice Vision IA (FastAPI + YOLO11 + PaddleOCR) ─────────────────────
# Image basée sur Python 3.11 (versions des roues numpy/paddlepaddle du projet
# ne couvrent pas Python 3.13). Fonctionne en CPU.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dépendances système natives requises par OpenCV (libGL, glib) et par le
# runtime OpenMP de PaddlePaddle (libgomp). Sans elles : "ImportError: libGL.so"
# ou "libgomp.so.1 not found" au chargement des modèles.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libgl1 \
      libglib2.0-0 \
      libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Installer les dépendances Python (roues manylinux : aucune compilation C++
# sur Linux, contrairement à Windows).
COPY requirements.txt ./
# torch/torchvision sont installés EN PREMIER depuis l'index CPU officiel de
# PyTorch. Sans cela, pip tire la variante CUDA par défaut (~3,5 Go de paquets
# nvidia + triton) alors que le service tourne uniquement en CPU. En les
# installant avant, pip les voit déjà satisfaits lors du `-r requirements.txt`.
RUN pip install --index-url https://download.pytorch.org/whl/cpu \
        torch==2.13.0 torchvision==0.28.0 \
    && pip install -r requirements.txt

# Copier uniquement le code applicatif. Les poids YOLO (models/*.pt) NE SONT PAS
# intégrés à l'image (exclus de Git) : ils sont fournis au runtime via un volume
# monté sur /app/models (voir docker-compose.yml).
COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
