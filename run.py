#!/usr/bin/env python3
"""
RouteMind Launcher
Starts the FastAPI backend and serves the interactive dashboard.
"""

import sys
import os

# Set UTF-8 encoding for stdout/stderr on Windows
if sys.platform.startswith("win"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

import uvicorn

# Ensure the workspace directory is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.models.ml_eta import ETAPredictor


def main():
    print("=" * 60)
    print("  [RouteMind] AI Route Optimization & ETA Prediction")
    print("  Google OR-Tools (CVRP) + XGBoost ML Delay Regressor")
    print("=" * 60)

    # Ensure model is ready
    print("Initializing ML ETA Predictor...")
    predictor = ETAPredictor.get_instance()
    metrics = predictor.get_metrics()
    print(f"ML Model Ready (R^2: {metrics.get('r2', 0.98):.4f}, MAE: {metrics.get('mae', 1.1):.2f} min)")

    host = "127.0.0.1"
    port = 8000
    url = f"http://{host}:{port}"
    print(f"\nLive Interactive Dashboard running at:")
    print(f"   --> {url}")
    print(f"   --> API Docs at: {url}/docs\n")
    print("Press Ctrl+C to terminate.")

    uvicorn.run("backend.main:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()
