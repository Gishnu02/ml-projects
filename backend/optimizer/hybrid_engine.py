import uuid
import copy
from typing import List, Dict, Any, Optional
from backend.models.schemas import (
    Depot, Order, Vehicle, EnvironmentCondition,
    TrafficIncident, Location, OptimizationResponse
)
from backend.optimizer.cvrp_solver import CVRPSolver
from backend.models.ml_eta import ETAPredictor


# Default San Francisco delivery network presets
DEFAULT_DEPOT = Depot(
    id="depot_sf_central",
    name="RouteMind Central Depot (SoMa)",
    location=Location(lat=37.7785, lng=-122.4056, name="Main Hub", address="800 Folsom St, San Francisco, CA")
)

DEFAULT_VEHICLES = [
    Vehicle(
        id="truck_1",
        name="Fleet Alpha (Ford E-Transit)",
        capacity=220,
        type="electric_van",
        speed_factor=1.0,
        color="#3b82f6"  # Blue
    ),
    Vehicle(
        id="truck_2",
        name="Fleet Bravo (Mercedes Sprinter)",
        capacity=260,
        type="cargo_van",
        speed_factor=1.0,
        color="#10b981"  # Emerald Green
    ),
    Vehicle(
        id="truck_3",
        name="Fleet Charlie (Rivian Commercial)",
        capacity=200,
        type="electric_van",
        speed_factor=1.05,
        color="#f59e0b"  # Amber Orange
    ),
    Vehicle(
        id="truck_4",
        name="Fleet Delta (Isuzu Heavy Cargo)",
        capacity=350,
        type="heavy_truck",
        speed_factor=0.92,
        color="#ec4899"  # Pink / Magenta
    )
]

DEFAULT_ORDERS = [
    Order(
        id="ORD-101",
        customer_name="St. Mary's Medical Supplies",
        location=Location(lat=37.7760, lng=-122.4510, name="St. Mary's Clinic", address="450 Stanyan St"),
        demand=35,
        time_window_start=30,
        time_window_end=150,
        service_time=12,
        priority=1
    ),
    Order(
        id="ORD-102",
        customer_name="Marina Groceries & Organics",
        location=Location(lat=37.8020, lng=-122.4365, name="Marina Market", address="Chestnut St"),
        demand=45,
        time_window_start=45,
        time_window_end=240,
        service_time=10,
        priority=2
    ),
    Order(
        id="ORD-103",
        customer_name="Financial District Express Hub",
        location=Location(lat=37.7942, lng=-122.3995, name="FiDi Tower", address="Market & Montgomery"),
        demand=60,
        time_window_start=60,
        time_window_end=180,
        service_time=15,
        priority=1
    ),
    Order(
        id="ORD-104",
        customer_name="Mission Culinary Collective",
        location=Location(lat=37.7599, lng=-122.4148, name="Mission Kitchen", address="Valencia St"),
        demand=30,
        time_window_start=90,
        time_window_end=280,
        service_time=8,
        priority=2
    ),
    Order(
        id="ORD-105",
        customer_name="Presidio Tech Campus",
        location=Location(lat=37.7989, lng=-122.4662, name="Presidio Innovation Hub", address="Letterman Dr"),
        demand=40,
        time_window_start=120,
        time_window_end=320,
        service_time=10,
        priority=2
    ),
    Order(
        id="ORD-106",
        customer_name="Sunset District Residential Hub",
        location=Location(lat=37.7540, lng=-122.4820, name="Sunset Lockers", address="19th Ave"),
        demand=25,
        time_window_start=60,
        time_window_end=300,
        service_time=7,
        priority=3
    ),
    Order(
        id="ORD-107",
        customer_name="Dogpatch Hardware Co.",
        location=Location(lat=37.7605, lng=-122.3890, name="Dogpatch Hardware", address="3rd St"),
        demand=55,
        time_window_start=90,
        time_window_end=210,
        service_time=14,
        priority=2
    ),
    Order(
        id="ORD-108",
        customer_name="North Beach Espresso Distribution",
        location=Location(lat=37.8005, lng=-122.4100, name="North Beach Roastery", address="Columbus Ave"),
        demand=20,
        time_window_start=15,
        time_window_end=140,
        service_time=8,
        priority=1
    ),
    Order(
        id="ORD-109",
        customer_name="Potrero Hill Bio Labs",
        location=Location(lat=37.7550, lng=-122.4020, name="Potrero BioLabs", address="Connecticut St"),
        demand=40,
        time_window_start=60,
        time_window_end=240,
        service_time=12,
        priority=1
    ),
    Order(
        id="ORD-110",
        customer_name="Nob Hill Grand Residence",
        location=Location(lat=37.7925, lng=-122.4150, name="Nob Hill Manor", address="California St"),
        demand=15,
        time_window_start=120,
        time_window_end=360,
        service_time=6,
        priority=3
    )
]

DEFAULT_INCIDENTS = [
    TrafficIncident(
        id="INC-01",
        lat=37.7850,
        lng=-122.4190,
        radius_km=1.2,
        severity=2.4,
        description="Major utility construction on Van Ness Ave"
    )
]


class HybridEngine:
    """Stateful orchestrator for the RouteMind system."""

    def __init__(self):
        self.predictor = ETAPredictor.get_instance()
        self.solver = CVRPSolver(predictor=self.predictor)
        self.depot: Depot = copy.deepcopy(DEFAULT_DEPOT)
        self.vehicles: List[Vehicle] = copy.deepcopy(DEFAULT_VEHICLES)
        self.orders: List[Order] = copy.deepcopy(DEFAULT_ORDERS)
        self.environment: EnvironmentCondition = EnvironmentCondition(
            weather="rain",
            traffic_level=1.5,
            time_of_day="morning_rush",
            temperature_c=16.0,
            precipitation_mm=5.2,
            incidents=copy.deepcopy(DEFAULT_INCIDENTS)
        )
        self.latest_solution: Optional[OptimizationResponse] = None

    def get_state(self) -> Dict[str, Any]:
        """Return entire current system state for UI synchronization."""
        return {
            "depot": self.depot.model_dump(),
            "vehicles": [v.model_dump() for v in self.vehicles],
            "orders": [o.model_dump() for o in self.orders],
            "environment": self.environment.model_dump(),
            "latest_solution": self.latest_solution.model_dump() if self.latest_solution else None,
            "ml_metadata": self.predictor.metadata,
            "feature_importances": self.predictor.get_feature_importances()
        }

    def add_order(self, order_data: Dict[str, Any], auto_optimize: bool = True) -> Order:
        """Add new delivery order (e.g. from user clicking on the live map)."""
        order_id = order_data.get("id") or f"ORD-{len(self.orders) + 101}"
        loc = order_data["location"]
        if isinstance(loc, dict):
            location_obj = Location(**loc)
        else:
            location_obj = loc

        new_order = Order(
            id=order_id,
            customer_name=order_data.get("customer_name", f"Delivery #{order_id}"),
            location=location_obj,
            demand=int(order_data.get("demand", 20)),
            time_window_start=int(order_data.get("time_window_start", 0)),
            time_window_end=int(order_data.get("time_window_end", 360)),
            service_time=int(order_data.get("service_time", 10)),
            priority=int(order_data.get("priority", 2)),
            status="pending"
        )
        self.orders.append(new_order)

        if auto_optimize:
            self.optimize(use_ml_matrix=True)

        return new_order

    def delete_order(self, order_id: str, auto_optimize: bool = True) -> bool:
        """Remove an order from the active queue."""
        initial_len = len(self.orders)
        self.orders = [o for o in self.orders if o.id != order_id]
        if len(self.orders) < initial_len:
            if auto_optimize:
                self.optimize(use_ml_matrix=True)
            return True
        return False

    def update_environment(self, env_data: Dict[str, Any], auto_optimize: bool = True):
        """Update weather, traffic congestion factor, or time of day."""
        for key, val in env_data.items():
            if hasattr(self.environment, key):
                if key == "incidents" and isinstance(val, list):
                    self.environment.incidents = [
                        TrafficIncident(**item) if isinstance(item, dict) else item for item in val
                    ]
                else:
                    setattr(self.environment, key, val)

        if auto_optimize:
            self.optimize(use_ml_matrix=True)

    def add_incident(self, incident_data: Dict[str, Any], auto_optimize: bool = True) -> TrafficIncident:
        """Add a dynamic traffic accident / bottleneck roadblock to the map."""
        inc_id = incident_data.get("id") or f"INC-{uuid.uuid4().hex[:4].upper()}"
        inc = TrafficIncident(
            id=inc_id,
            lat=float(incident_data["lat"]),
            lng=float(incident_data["lng"]),
            radius_km=float(incident_data.get("radius_km", 1.2)),
            severity=float(incident_data.get("severity", 2.2)),
            description=incident_data.get("description", "Road incident / Congestion bottleneck")
        )
        self.environment.incidents.append(inc)
        if auto_optimize:
            self.optimize(use_ml_matrix=True)
        return inc

    def remove_incident(self, incident_id: str, auto_optimize: bool = True) -> bool:
        """Clear traffic incident from map."""
        initial_len = len(self.environment.incidents)
        self.environment.incidents = [i for i in self.environment.incidents if i.id != incident_id]
        if len(self.environment.incidents) < initial_len:
            if auto_optimize:
                self.optimize(use_ml_matrix=True)
            return True
        return False

    def optimize(self, use_ml_matrix: bool = True, time_limit_seconds: int = 2) -> OptimizationResponse:
        """Execute CVRP solver with OR-Tools."""
        res = self.solver.solve(
            depot=self.depot,
            orders=self.orders,
            vehicles=self.vehicles,
            env=self.environment,
            use_ml_matrix=use_ml_matrix,
            time_limit_seconds=time_limit_seconds
        )
        self.latest_solution = res
        return res

    def compare_classical_vs_hybrid(self) -> Dict[str, Any]:
        """
        Run both classical distance-only optimization and RouteMind Hybrid ML optimization
        on the exact same dataset to illustrate the critical value of combining Classical OR with ML.
        """
        # Classical OR-Tools (optimizing pure distance ignoring traffic/weather compound delay)
        classical_res = self.solver.solve(
            depot=self.depot,
            orders=self.orders,
            vehicles=self.vehicles,
            env=self.environment,
            use_ml_matrix=False,
            time_limit_seconds=2
        )

        # RouteMind Hybrid (OR-Tools informed by ML travel duration matrix)
        hybrid_res = self.solver.solve(
            depot=self.depot,
            orders=self.orders,
            vehicles=self.vehicles,
            env=self.environment,
            use_ml_matrix=True,
            time_limit_seconds=2
        )

        # Compute differences
        diff_distance = round(
            hybrid_res.metrics.get("total_distance_km", 0) - classical_res.metrics.get("total_distance_km", 0), 2
        )
        diff_delay = round(
            hybrid_res.metrics.get("avg_delay_min", 0) - classical_res.metrics.get("avg_delay_min", 0), 2
        )
        diff_sla = round(
            hybrid_res.metrics.get("sla_success_rate_pct", 0) - classical_res.metrics.get("sla_success_rate_pct", 0), 1
        )

        return {
            "classical": classical_res.model_dump(),
            "hybrid": hybrid_res.model_dump(),
            "comparison": {
                "distance_delta_km": diff_distance,
                "avg_delay_reduction_min": abs(diff_delay) if diff_delay < 0 else -diff_delay,
                "sla_improvement_pct": diff_sla,
                "delayed_stops_classical": classical_res.metrics.get("delayed_stops_count", 0),
                "delayed_stops_hybrid": hybrid_res.metrics.get("delayed_stops_count", 0),
                "summary": (
                    f"Hybrid AI reduced delivery delay by {abs(diff_delay)} min per stop and "
                    f"improved SLA on-time rate by {diff_sla:+.1f}% by anticipating traffic congestion & rain delays."
                )
            }
        }

    def reset_scenario(self, scenario_name: str = "san_francisco"):
        """Reset or load designated city scenario."""
        self.depot = copy.deepcopy(DEFAULT_DEPOT)
        self.vehicles = copy.deepcopy(DEFAULT_VEHICLES)
        self.orders = copy.deepcopy(DEFAULT_ORDERS)
        self.environment = EnvironmentCondition(
            weather="rain",
            traffic_level=1.5,
            time_of_day="morning_rush",
            temperature_c=16.0,
            precipitation_mm=5.2,
            incidents=copy.deepcopy(DEFAULT_INCIDENTS)
        )
        self.optimize(use_ml_matrix=True)
