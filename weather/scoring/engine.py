"""
Activity Scoring Engine
=======================
Pure functions that rate weather conditions for outdoor activities.
Each factor scorer returns 0.0–1.0, then we weight-sum them into a
final 0–100 score.
"""

import math

# ── Individual factor scorers ────────────────────────────────────

def score_temperature(temp: float, ideal_min: float, ideal_max: float) -> float:
    """Gaussian-like decay outside the ideal range."""
    if ideal_min <= temp <= ideal_max:
        return 1.0
    if temp < ideal_min:
        diff = ideal_min - temp
    else:
        diff = temp - ideal_max
    # Smooth exponential decay: 5°C off = ~0.72, 10°C off = ~0.37, 20°C off = ~0.02
    return math.exp(-0.065 * diff * diff)


def score_wind(speed: float, max_speed: float) -> float:
    """Comfortable below 40% of max, linear fall-off to max, steep penalty past it."""
    if max_speed <= 0:
        return 1.0
    ratio = speed / max_speed
    if ratio <= 0.4:
        return 1.0
    if ratio <= 1.0:
        return 1.0 - 0.5 * ((ratio - 0.4) / 0.6)
    # Past max: harsh penalty
    return max(0.0, 0.5 - 0.5 * (ratio - 1.0))


def score_rain(probability: float, max_prob: float) -> float:
    """0% rain = perfect, max_prob = 0.5, past max = steep drop."""
    if probability <= 0:
        return 1.0
    if max_prob <= 0:
        return 0.0
    ratio = probability / max_prob
    if ratio <= 1.0:
        return 1.0 - 0.5 * ratio
    return max(0.0, 0.5 - 0.5 * (ratio - 1.0))


def score_humidity(humidity: float) -> float:
    """Bell curve centered on 45%. Too dry (<15%) or too humid (>85%) penalized."""
    ideal = 45.0
    sigma = 30.0
    diff = humidity - ideal
    return math.exp(-0.5 * (diff / sigma) ** 2)


def score_uv(uv_index: float) -> float:
    """Low-moderate UV is fine, extreme is bad for most outdoor activities."""
    if uv_index is None:
        return 0.7  # neutral fallback
    if uv_index <= 5:
        return 1.0
    if uv_index <= 8:
        return 1.0 - 0.15 * (uv_index - 5)
    # 8+ = steep penalty
    return max(0.0, 0.55 - 0.12 * (uv_index - 8))


def score_visibility(visibility_m: float) -> float:
    """Full score above 10km, degrades below that."""
    if visibility_m is None:
        return 0.7
    km = visibility_m / 1000.0
    if km >= 10:
        return 1.0
    if km >= 1:
        return 0.4 + 0.6 * (km / 10.0)
    return max(0.0, 0.4 * km)


def score_aqi(aqi: float) -> float:
    """European AQI: 0-20 good, 20-40 fair, 40-60 moderate, 60-80 poor, 80+ very poor."""
    if aqi is None:
        return 0.7
    if aqi <= 20:
        return 1.0
    if aqi <= 40:
        return 0.85 + 0.15 * (1 - (aqi - 20) / 20)
    if aqi <= 60:
        return 0.55 + 0.30 * (1 - (aqi - 40) / 20)
    if aqi <= 80:
        return 0.25 + 0.30 * (1 - (aqi - 60) / 20)
    return max(0.0, 0.25 * (1 - (aqi - 80) / 40))


def score_golden_hour(minutes_to_golden: float) -> float:
    """1.0 during golden hour, fades over 60 minutes."""
    if minutes_to_golden is None:
        return 0.5  # neutral when we can't compute
    if minutes_to_golden <= 0:
        return 1.0
    if minutes_to_golden <= 60:
        return 1.0 - (minutes_to_golden / 60.0) * 0.7
    return 0.3


def score_swell(height_m: float) -> float:
    """Ideal 1-2.5m, too flat or too big is bad."""
    if height_m is None:
        return 0.5
    if 1.0 <= height_m <= 2.5:
        return 1.0
    if height_m < 1.0:
        return max(0.1, height_m / 1.0)
    if height_m <= 4.0:
        return max(0.2, 1.0 - (height_m - 2.5) / 3.0)
    return 0.1


# ── Score label ──────────────────────────────────────────────────

def score_label(score: float) -> str:
    if score >= 80:
        return 'Excellent'
    if score >= 65:
        return 'Good'
    if score >= 50:
        return 'Fair'
    if score >= 35:
        return 'Poor'
    return 'Bad'


# ── Main scorer ──────────────────────────────────────────────────

def compute_score(weather: dict, activity) -> dict:
    """
    Compute an activity score from weather conditions.

    Parameters
    ----------
    weather : dict
        Keys: temp, wind_speed, rain_prob, humidity, uv_index,
              visibility, aqi, minutes_to_golden, swell_height
    activity : ActivityType instance (or any object with weight/range attrs)

    Returns
    -------
    dict with 'score' (0-100), 'label', and 'factors' breakdown.
    """
    factors = [
        ('temp',         score_temperature(weather.get('temp', 20),
                                           activity.ideal_temp_min,
                                           activity.ideal_temp_max),
                         activity.temp_weight),
        ('wind',         score_wind(weather.get('wind_speed', 0),
                                    activity.max_wind_speed),
                         activity.wind_weight),
        ('rain',         score_rain(weather.get('rain_prob', 0),
                                    activity.max_rain_probability),
                         activity.rain_weight),
        ('humidity',     score_humidity(weather.get('humidity', 50)),
                         activity.humidity_weight),
        ('uv',           score_uv(weather.get('uv_index')),
                         activity.uv_weight),
        ('visibility',   score_visibility(weather.get('visibility')),
                         activity.visibility_weight),
        ('air_quality',  score_aqi(weather.get('aqi')),
                         activity.air_quality_weight),
        ('golden_hour',  score_golden_hour(weather.get('minutes_to_golden')),
                         activity.golden_hour_weight),
        ('swell',        score_swell(weather.get('swell_height')),
                         activity.swell_weight),
    ]

    total_weight = sum(w for _, _, w in factors)
    if total_weight == 0:
        return {'score': 50.0, 'label': 'Fair', 'factors': {}}

    weighted_sum = sum(s * w for _, s, w in factors)
    final = round(weighted_sum / total_weight * 100, 1)

    breakdown = {}
    for name, s, w in factors:
        if w > 0:
            breakdown[name] = round(s * 100, 1)

    return {
        'score': final,
        'label': score_label(final),
        'factors': breakdown,
    }
