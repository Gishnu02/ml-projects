from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


class Location(BaseModel):
    lat: float
    lng: float
    name: Optional[str] = "Stop"
    address: Optional[str] = None


class Order(BaseModel):
    id: str
    customer_name: str
    location: Location
    demand: int = 15  # payload weight or box units
    time_window_start: int = 0  # minutes from shift start (e.g. 0 min = 08:00)
    time_window_end: int = 480  # minutes from shift start (e.g. 480 min = 16:00)
    service_time: int = 10  # minutes spent unloading
    priority: int = 2  # 1 = High/Urgent, 2 = Standard, 3 = Flexible
    status: str = "pending"  # pending, assigned, in_transit, delivered
    created_at: Optional[str] = None


class Vehicle(BaseModel):
    id: str
    name: str
    capacity: int = 200
    type: str = "electric_van"  # electric_van, cargo_van, heavy_truck
    speed_factor: float = 1.0  # 1.0 = standard road speed
    max_travel_time: int = 480  # 8 hour maximum shift
    color: str = "#3b82f6"


class TrafficIncident(BaseModel):
    id: str
    lat: float
    lng: float
    radius_km: float = 1.2
    severity: float = 2.0  # delay multiplier
    description: str = "Road work / congestion"


class EnvironmentCondition(BaseModel):
    weather: str = "clear"  # clear, rain, heavy_rain, fog, snow
    traffic_level: float = 1.0  # 1.0 = light, 1.4 = moderate, 1.8 = heavy rush, 2.5 = gridlock
    time_of_day: str = "morning_rush"  # morning_rush, midday, evening_rush, night
    temperature_c: float = 20.0
    precipitation_mm: float = 0.0
    incidents: List[TrafficIncident] = Field(default_factory=list)


class RouteStop(BaseModel):
    stop_order: int
    order_id: Optional[str] = None  # None for depot
    customer_name: Optional[str] = "Hub Depot"
    location: Location
    demand: int = 0
    time_window_start: int = 0
    time_window_end: int = 480
    service_time: int = 0
    
    # Classical OR-Tools ETA calculation
    classical_arrival_min: float = 0.0
    classical_departure_min: float = 0.0
    
    # ML Adjusted ETA prediction
    ml_arrival_min: float = 0.0
    ml_departure_min: float = 0.0
    ml_delay_min: float = 0.0
    delay_risk: str = "low"  # low, medium, high
    sla_status: str = "on_time"  # on_time, at_risk, delayed
    
    distance_from_prev_km: float = 0.0
    cumulative_distance_km: float = 0.0
    load_after_stop: int = 0


class VehicleRoute(BaseModel):
    vehicle_id: str
    vehicle_name: str
    vehicle_type: str
    color: str
    stops: List[RouteStop] = Field(default_factory=list)
    total_distance_km: float = 0.0
    classical_total_time_min: float = 0.0
    ml_total_time_min: float = 0.0
    total_delay_min: float = 0.0
    capacity_used: int = 0
    capacity_total: int = 200
    utilization_pct: float = 0.0
    on_time_rate: float = 100.0


class Depot(BaseModel):
    id: str = "depot_main"
    name: str = "Central Distribution Hub"
    location: Location


class OptimizationRequest(BaseModel):
    use_ml_matrix: bool = True
    time_limit_seconds: int = 2
    balance_fleet: bool = True


class OptimizationResponse(BaseModel):
    success: bool
    solver_status: str
    mode: str  # "Hybrid AI (OR-Tools + XGBoost)" or "Classical OR-Tools"
    routes: List[VehicleRoute]
    unassigned_orders: List[Order]
    metrics: Dict[str, Any]
