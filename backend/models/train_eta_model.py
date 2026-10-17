import os
import math
import joblib
import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score

FEATURE_NAMES = [
    "distance_km",
    "base_time_min",
    "traffic_level",
    "weather_code",
    "precipitation_mm",
    "temperature_c",
    "time_of_day_code",
    "demand_kg",
    "stop_index",
    "vehicle_type_code",
    "incident_impact"
]

WEATHER_MAP = {
    "clear": (0, 0.0, 22.0),
    "fog": (1, 0.1, 14.0),
    "rain": (2, 4.5, 16.0),
    "heavy_rain": (3, 18.0, 15.0),
    "snow": (4, 8.0, -2.0)
}

TIME_OF_DAY_MAP = {
    "night": 0,
    "midday": 1,
    "morning_rush": 2,
    "evening_rush": 3
}

VEHICLE_TYPE_MAP = {
    "electric_van": 0,
    "cargo_van": 1,
    "heavy_truck": 2
}


def generate_synthetic_logistics_data(n_samples: int = 15000, random_state: int = 42) -> pd.DataFrame:
    """
    Synthesize realistic logistics telemetry records based on empirical transport physics
    and urban delivery delay phenomena.
    """
    np.random.seed(random_state)

    # 1. Segment distance (urban stop-to-stop ranges from 0.8 km to 25 km)
    distance_km = np.random.exponential(scale=4.5, size=n_samples) + 0.5
    distance_km = np.clip(distance_km, 0.5, 30.0)

    # Base travel time at 42 km/h free-flow speed
    base_time_min = (distance_km / 42.0) * 60.0

    # 2. Traffic congestion level (1.0 to 2.8)
    # Mixture of normal off-peak and peak congestion
    traffic_level = np.random.choice([1.0, 1.25, 1.6, 2.1, 2.7], size=n_samples, p=[0.35, 0.25, 0.20, 0.12, 0.08])
    traffic_level += np.random.normal(0, 0.05, size=n_samples)
    traffic_level = np.clip(traffic_level, 0.95, 3.0)

    # 3. Weather
    weathers = list(WEATHER_MAP.keys())
    weather_choices = np.random.choice(weathers, size=n_samples, p=[0.60, 0.10, 0.18, 0.08, 0.04])
    weather_code = np.array([WEATHER_MAP[w][0] for w in weather_choices])
    precipitation_mm = np.array([WEATHER_MAP[w][1] * np.random.uniform(0.7, 1.3) for w in weather_choices])
    temperature_c = np.array([WEATHER_MAP[w][2] + np.random.normal(0, 3) for w in weather_choices])

    # 4. Time of day
    tods = list(TIME_OF_DAY_MAP.keys())
    tod_choices = np.random.choice(tods, size=n_samples, p=[0.10, 0.40, 0.25, 0.25])
    time_of_day_code = np.array([TIME_OF_DAY_MAP[t] for t in tod_choices])

    # 5. Demand weight (kg)
    demand_kg = np.random.gamma(shape=3.0, scale=8.0, size=n_samples) + 5.0

    # 6. Stop index along route (1 to 20)
    stop_index = np.random.randint(1, 16, size=n_samples)

    # 7. Vehicle type
    vtypes = list(VEHICLE_TYPE_MAP.keys())
    vtype_choices = np.random.choice(vtypes, size=n_samples, p=[0.40, 0.45, 0.15])
    vehicle_type_code = np.array([VEHICLE_TYPE_MAP[v] for v in vtype_choices])

    # 8. Incident proximity impact (0 = none, up to 15-25 min delay)
    has_incident = np.random.binomial(1, 0.12, size=n_samples)
    incident_impact = has_incident * np.random.uniform(8.0, 24.0, size=n_samples)

    # Target: Delay in minutes over base free-flow time
    # Non-linear combinations:
    # - Traffic multiplier causes (traffic_level - 1.0) * base_time_min
    # - Weather penalties: rain +15%, heavy rain +40%, snow +60% + handling delays
    weather_multiplier = 1.0 + (weather_code == 1) * 0.12 + (weather_code == 2) * 0.28 + \
                         (weather_code == 3) * 0.65 + (weather_code == 4) * 0.85
    
    # Rush hour interaction with traffic
    rush_synergy = 1.0 + (time_of_day_code >= 2) * 0.25 * (traffic_level > 1.4)

    # Stop fatigue & parking search time in dense areas
    stop_delay = 0.45 * stop_index + (demand_kg > 40) * 4.0

    # Heavy trucks are slower in congestion
    vehicle_delay_factor = 1.0 + (vehicle_type_code == 2) * 0.22

    # Actual travel duration
    traffic_delay = base_time_min * ((traffic_level * weather_multiplier * rush_synergy) - 1.0)
    traffic_delay = np.maximum(traffic_delay, 0.0)

    # Compound delay with realistic stochastic noise
    noise = np.random.normal(0, 1.2, size=n_samples)
    total_delay_min = traffic_delay * vehicle_delay_factor + stop_delay + incident_impact + noise
    total_delay_min = np.maximum(total_delay_min, 0.0)

    df = pd.DataFrame({
        "distance_km": distance_km,
        "base_time_min": base_time_min,
        "traffic_level": traffic_level,
        "weather_code": weather_code,
        "precipitation_mm": precipitation_mm,
        "temperature_c": temperature_c,
        "time_of_day_code": time_of_day_code,
        "demand_kg": demand_kg,
        "stop_index": stop_index,
        "vehicle_type_code": vehicle_type_code,
        "incident_impact": incident_impact,
        "delay_min": total_delay_min
    })

    return df


def train_and_save_model(output_path: str = "backend/data/eta_xgboost_model.joblib"):
    """Train XGBoost Regressor on delivery data and save model artifact with metadata."""
    print("Generating synthetic logistics data...")
    df = generate_synthetic_logistics_data(n_samples=25000, random_state=42)

    X = df[FEATURE_NAMES]
    y = df["delay_min"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    print(f"Training XGBoost Regressor on {len(X_train)} samples...")
    model = xgb.XGBRegressor(
        n_estimators=220,
        max_depth=6,
        learning_rate=0.08,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_alpha=0.1,
        reg_lambda=1.0,
        random_state=42,
        n_jobs=-1
    )

    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_pred = np.maximum(y_pred, 0.0)

    rmse = math.sqrt(mean_squared_error(y_test, y_pred))
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)

    print("--- Model Evaluation Metrics ---")
    print(f"R² Score: {r2:.4f}")
    print(f"MAE:      {mae:.2f} minutes")
    print(f"RMSE:     {rmse:.2f} minutes")

    # Calculate feature importances
    importances = model.feature_importances_
    feat_imp = sorted(zip(FEATURE_NAMES, importances), key=lambda x: x[1], reverse=True)
    print("\nFeature Importances:")
    for feat, imp in feat_imp:
        print(f"  {feat:<20}: {imp * 100:.2f}%")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    payload = {
        "model": model,
        "feature_names": FEATURE_NAMES,
        "metrics": {
            "r2": float(r2),
            "mae": float(mae),
            "rmse": float(rmse)
        },
        "feature_importances": {feat: float(imp) for feat, imp in feat_imp},
        "weather_map": WEATHER_MAP,
        "time_of_day_map": TIME_OF_DAY_MAP,
        "vehicle_type_map": VEHICLE_TYPE_MAP
    }

    joblib.dump(payload, output_path)
    print(f"\nModel artifact successfully saved to: {output_path}")
    return payload


if __name__ == "__main__":
    train_and_save_model()
