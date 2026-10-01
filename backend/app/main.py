from __future__ import annotations
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging
import os

from app.database import Base, engine, SessionLocal
from app.models_db import ForecastRow
from app.routers import regions, forecast, verification, replay
from app.api_v1 import router as api_v1_router

Base.metadata.create_all(bind=engine)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start the automatic live-refresh scheduler for the life of the process.

    In real mode this is what keeps the deployment fed with fresh GFS/IFS/AIFS
    cycles for weeks or months without any manual step. It is disabled by
    SYNOPTIQ_AUTO_REFRESH=0 (tests and demo mode set that).
    """
    from app.config import RUNTIME_MODE
    started = False
    if RUNTIME_MODE == "real":
        from app import live_scheduler
        started = live_scheduler.start()
    yield
    if started:
        from app import live_scheduler
        live_scheduler.stop()


app = FastAPI(
    title="Synoptiq API",
    description=(
        "Adaptive AI-NWP multi-model forecast blending. Learns which forecast source "
        "to trust by region, lead time, season and weather regime, then "
        "blends, bias-corrects, calibrates and explains the result."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "SYNOPTIQ_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(regions.router)
app.include_router(forecast.router)
app.include_router(verification.router)
app.include_router(replay.router)
app.include_router(api_v1_router)


@app.get("/health")
def health():
    db = SessionLocal()
    try:
        n = db.query(ForecastRow).count()
    finally:
        db.close()
    return {
        "status": "ok",
        "forecast_rows_cached": n,
        "note": "Use /api/v1/system/status for LIVE readiness, model provenance, and ingestion status.",
    }


@app.get("/")
def root():
    return {
        "name": "Synoptiq API",
        "docs": "/docs",
        "quickstart": [
            "GET /api/v1/regions",
            "GET /api/v1/replay/events",
            "GET /api/v1/forecast/blend?region=KWG&variable=precipitation&lead_hours=72",
            "GET /api/v1/skill/verification",
        ],
    }
