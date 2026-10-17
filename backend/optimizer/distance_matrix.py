import numpy as np
import pandas as pd
from typing import List, Tuple, Dict, Any, Optional
from backend.models.schemas import Location, Order, Depot, EnvironmentCondition, TrafficIncident
from backend.utils.geo import road_network_distance_km, point_to_segment_distance_km
from backend.models.ml_eta import ETAPredictor, WEATHER_MAP, TIME_OF_DAY_MAP


def compute_incident_penalty_for_edge(
    loc1: Location,
    loc2: Location,
    incidents: List[TrafficIncident]
) -> float:
    """
    Calculate incident delay impact in minutes if the travel edge passes near an incident.
    """
    total_penalty = 0.0
    for incident in incidents:
        dist_to_segment = point_to_segment_distance_km(
            incident.lng, incident.lat,
            loc1.lng, loc1.lat,
            loc2.lng, loc2.lat
        )
        if dist_to_segment <= incident.radius_km:
            # Proximity decay
            factor = 1.0 - (dist_to_segment / (incident.radius_km + 1e-5))
            total_penalty += incident.severity * 8.0 * max(0.2, factor)
    return total_penalty


def build_matrices(
    depot: Depot,
    orders: List[Order],
    env: EnvironmentCondition,
    predictor: Optional[ETAPredictor] = None,
    use_ml_for_matrix: bool = True
) -> Dict[str, Any]:
    """
    Construct Distance and Duration matrices for OR-Tools routing engine.
    Node 0: Depot
    Nodes 1..N: Orders in sequence
    """
    if predictor is None:
        predictor = ETAPredictor.get_instance()

    locations = [depot.location] + [order.location for order in orders]
    demands = [0] + [order.demand for order in orders]
    service_times = [0] + [order.service_time for order in orders]
    time_windows = [(0, 480)] + [(order.time_window_start, order.time_window_end) for order in orders]

    n = len(locations)
    distance_matrix_km = np.zeros((n, n), dtype=float)
    base_duration_matrix_min = np.zeros((n, n), dtype=float)
    ml_duration_matrix_min = np.zeros((n, n), dtype=float)
    incident_penalties = np.zeros((n, n), dtype=float)

    # Base average city arterial driving speed in km/h
    base_speed_kmh = 38.0

    batch_rows = []
    index_pairs = []

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            dist_km = road_network_distance_km(
                locations[i].lat, locations[i].lng,
                locations[j].lat, locations[j].lng
            )
            distance_matrix_km[i, j] = dist_km
            
            # Base free-flow travel time (minutes)
            base_min = (dist_km / base_speed_kmh) * 60.0
            base_duration_matrix_min[i, j] = base_min

            # Incident proximity
            inc_pen = compute_incident_penalty_for_edge(locations[i], locations[j], env.incidents)
            incident_penalties[i, j] = inc_pen

            if use_ml_for_matrix:
                w_info = WEATHER_MAP.get(env.weather.lower(), WEATHER_MAP["clear"])
                weather_code = w_info[0]
                precip = env.precipitation_mm if env.precipitation_mm > 0 else w_info[1]
                temp = env.temperature_c if env.temperature_c != 20.0 else w_info[2]
                tod_code = TIME_OF_DAY_MAP.get(env.time_of_day.lower(), 2)

                batch_rows.append({
                    "distance_km": dist_km,
                    "base_time_min": base_min,
                    "traffic_level": env.traffic_level,
                    "weather_code": weather_code,
                    "precipitation_mm": precip,
                    "temperature_c": temp,
                    "time_of_day_code": tod_code,
                    "demand_kg": demands[j],
                    "stop_index": 3,  # average intermediate stop
                    "vehicle_type_code": 0,
                    "incident_impact": inc_pen
                })
                index_pairs.append((i, j))

    if use_ml_for_matrix and batch_rows:
        df_batch = pd.DataFrame(batch_rows)
        delays = predictor.predict_batch_delays(df_batch)
        for (i, j), delay, row in zip(index_pairs, delays, batch_rows):
            ml_duration_matrix_min[i, j] = row["base_time_min"] + delay
    else:
        # In classical mode, naive traffic scaling without ML non-linear weather/incident synergies
        ml_duration_matrix_min = base_duration_matrix_min * env.traffic_level + incident_penalties

    # OR-Tools requires integer costs. Convert minutes to integer seconds or integer tenths of minutes.
    # We use integer seconds for precise time modeling: 1 min = 60 sec
    cost_matrix_int = np.round(
        (ml_duration_matrix_min if use_ml_for_matrix else base_duration_matrix_min) * 60
    ).astype(int)

    # Convert distances to meters (integer)
    distance_matrix_int = np.round(distance_matrix_km * 1000).astype(int)

    return {
        "locations": locations,
        "demands": demands,
        "service_times": service_times,
        "time_windows": time_windows,
        "distance_matrix_km": distance_matrix_km,
        "distance_matrix_int": distance_matrix_int,
        "base_duration_matrix_min": base_duration_matrix_min,
        "ml_duration_matrix_min": ml_duration_matrix_min,
        "cost_matrix_int": cost_matrix_int,
        "incident_penalties": incident_penalties,
        "num_nodes": n
    }
