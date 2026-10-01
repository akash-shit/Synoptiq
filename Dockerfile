FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt ./backend/requirements.txt
COPY training/requirements-realdata.txt ./training/requirements-realdata.txt
# the API process hosts the live-refresh scheduler and the worker itself lives
# in training/, so the training-side dependencies are needed in the image too
RUN pip install --no-cache-dir -r backend/requirements.txt -r training/requirements-realdata.txt
COPY backend ./backend
# the live-refresh worker and the routine workflow live outside backend/:
# without these the automatic refresh cannot run inside the container
COPY training ./training
COPY scripts ./scripts
COPY ops ./ops
COPY data/real/training.sqlite3 ./data/real/training.sqlite3
COPY data/fake/demo/synoptiq.db ./data/fake/demo/synoptiq.db
COPY models ./models
COPY artifacts ./artifacts
ENV SYNOPTIQ_MODE=real
# keep pulling real provider cycles for the life of the container, with no
# manual step — the API process runs the scheduler
ENV SYNOPTIQ_AUTO_REFRESH=1
ENV SYNOPTIQ_LIVE_REFRESH_MINUTES=15
CMD ["uvicorn", "app.main:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8000"]
