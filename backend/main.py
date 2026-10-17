import os
import uvicorn
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import Dict, Any, Optional

from backend.optimizer.hybrid_engine import HybridEngine
from backend.models.schemas import OptimizationRequest
from backend.models.train_eta_model import train_and_save_model

app = FastAPI(
    title="RouteMind: AI Route Optimization & ETA Prediction",
    description="Combines classical Google OR-Tools CVRP with XGBoost ML ETA delay forecasting",
    version="1.0.0"
)

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize in-memory singleton hybrid engine
engine = HybridEngine()
# Initial warm-up optimization
engine.optimize(use_ml_matrix=True)


@app.get("/api/state")
def get_state():
    """Retrieve full system state including orders, fleet, depot, environment, and latest routes."""
    return engine.get_state()


@app.post("/api/optimize")
def run_optimization(request: OptimizationRequest):
    """Trigger route optimization using OR-Tools and ML matrix."""
    result = engine.optimize(
        use_ml_matrix=request.use_ml_matrix,
        time_limit_seconds=request.time_limit_seconds
    )
    return result


@app.post("/api/orders")
def add_order(payload: Dict[str, Any] = Body(...)):
    """Add a new delivery order (e.g. from user clicking on the live map)."""
    try:
        auto_optimize = payload.get("auto_optimize", True)
        order = engine.add_order(payload, auto_optimize=auto_optimize)
        return {
            "success": True,
            "order": order.model_dump(),
            "latest_solution": engine.latest_solution.model_dump() if engine.latest_solution else None
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/api/orders/{order_id}")
def delete_order(order_id: str, auto_optimize: bool = True):
    """Remove a delivery order from active queue."""
    success = engine.delete_order(order_id, auto_optimize=auto_optimize)
    if not success:
        raise HTTPException(status_code=404, detail=f"Order {order_id} not found")
    return {
        "success": True,
        "latest_solution": engine.latest_solution.model_dump() if engine.latest_solution else None
    }


@app.post("/api/environment")
def update_environment(payload: Dict[str, Any] = Body(...)):
    """Update weather, traffic congestion multiplier, or time of day."""
    auto_optimize = payload.get("auto_optimize", True)
    engine.update_environment(payload, auto_optimize=auto_optimize)
    return {
        "success": True,
        "environment": engine.environment.model_dump(),
        "latest_solution": engine.latest_solution.model_dump() if engine.latest_solution else None
    }


@app.post("/api/incidents")
def add_incident(payload: Dict[str, Any] = Body(...)):
    """Place a traffic accident or road block incident on the map."""
    auto_optimize = payload.get("auto_optimize", True)
    incident = engine.add_incident(payload, auto_optimize=auto_optimize)
    return {
        "success": True,
        "incident": incident.model_dump(),
        "latest_solution": engine.latest_solution.model_dump() if engine.latest_solution else None
    }


@app.delete("/api/incidents/{incident_id}")
def remove_incident(incident_id: str, auto_optimize: bool = True):
    """Remove an incident from the map."""
    success = engine.remove_incident(incident_id, auto_optimize=auto_optimize)
    if not success:
        raise HTTPException(status_code=404, detail="Incident not found")
    return {
        "success": True,
        "latest_solution": engine.latest_solution.model_dump() if engine.latest_solution else None
    }


@app.get("/api/compare")
def compare_routing_modes():
    """Run Classical OR-Tools vs Hybrid AI side-by-side on the current state."""
    return engine.compare_classical_vs_hybrid()


@app.post("/api/reset")
def reset_scenario(scenario_name: str = "san_francisco"):
    """Reset to default demonstration scenario."""
    engine.reset_scenario(scenario_name)
    return engine.get_state()


@app.post("/api/train-model")
def trigger_retraining():
    """Re-train the XGBoost ETA delay model on synthetic/historical logistics data."""
    try:
        data = train_and_save_model()
        engine.predictor.load_or_train()
        engine.optimize(use_ml_matrix=True)
        return {
            "success": True,
            "metrics": data["metrics"],
            "feature_importances": data["feature_importances"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
def healthcheck():
    return {"status": "ok", "app": "RouteMind", "version": "1.0.0"}


# Mount frontend static directory
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")
    css_dir = os.path.join(frontend_dir, "css")
    js_dir = os.path.join(frontend_dir, "js")
    if os.path.exists(css_dir):
        app.mount("/css", StaticFiles(directory=css_dir), name="css")
    if os.path.exists(js_dir):
        app.mount("/js", StaticFiles(directory=js_dir), name="js")

    @app.get("/")
    def serve_frontend_index():
        return FileResponse(os.path.join(frontend_dir, "index.html"))


if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8000, reload=False)
