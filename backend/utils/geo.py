import math
from typing import Tuple, List, Dict, Any


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance between two points in km."""
    R = 6371.0  # Earth's radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2.0) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c


def road_network_distance_km(lat1: float, lon1: float, lat2: float, lon2: float, tortuosity: float = 1.32) -> float:
    """
    Empirical road network distance approximation.
    In urban/suburban street grids, road distance averages 1.28 - 1.38x Haversine distance.
    """
    direct = haversine_distance_km(lat1, lon1, lat2, lon2)
    return direct * tortuosity


def point_to_segment_distance_km(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
    """
    Calculate minimum distance in km from point (px, py) to line segment (x1, y1)-(x2, y2).
    Coordinates in degrees (lat/lon).
    """
    # For small areas, project to local coordinates using average latitude
    avg_lat = math.radians((y1 + y2 + py) / 3.0)
    kx = 111.320 * math.cos(avg_lat)  # km per degree longitude
    ky = 110.574                     # km per degree latitude

    p_km = (px * kx, py * ky)
    a_km = (x1 * kx, y1 * ky)
    b_km = (x2 * kx, y2 * ky)

    dx = b_km[0] - a_km[0]
    dy = b_km[1] - a_km[1]
    l2 = dx * dx + dy * dy

    if l2 == 0:
        return math.hypot(p_km[0] - a_km[0], p_km[1] - a_km[1])

    t = max(0.0, min(1.0, ((p_km[0] - a_km[0]) * dx + (p_km[1] - a_km[1]) * dy) / l2))
    proj_x = a_km[0] + t * dx
    proj_y = a_km[1] + t * dy

    return math.hypot(p_km[0] - proj_x, p_km[1] - proj_y)


def interpolate_points(points: List[Tuple[float, float]], steps_between: int = 10) -> List[Tuple[float, float]]:
    """Interpolate smooth steps between lat/lng waypoints for vehicle animation."""
    if len(points) < 2:
        return points

    smooth_path: List[Tuple[float, float]] = []
    for i in range(len(points) - 1):
        p1 = points[i]
        p2 = points[i + 1]
        for s in range(steps_between):
            ratio = s / float(steps_between)
            lat = p1[0] + (p2[0] - p1[0]) * ratio
            lng = p1[1] + (p2[1] - p1[1]) * ratio
            smooth_path.append((lat, lng))
    smooth_path.append(points[-1])
    return smooth_path
