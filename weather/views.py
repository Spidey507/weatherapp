import requests
from django.shortcuts import render
from django.http import JsonResponse

from activities.models import ActivityType
from weather.scoring.engine import compute_score
from weather.scoring.windows import find_best_windows


def index(request):
    """Serve the main weather dashboard (Home tab)."""
    return render(request, 'weather/weather.html', {'active_tab': 'home'})


def geocode(request):
    """Search cities by name using Open-Meteo Geocoding API."""
    query = request.GET.get('q', '').strip()
    if len(query) < 2:
        return JsonResponse({'results': []})

    url = (
        f'https://geocoding-api.open-meteo.com/v1/search'
        f'?name={query}&count=6&language=en&format=json'
    )
    response = requests.get(url, timeout=10)

    if response.status_code == 200:
        data = response.json()
        results = []
        for item in data.get('results', []):
            results.append({
                'name': item['name'],
                'country': item.get('country', ''),
                'admin1': item.get('admin1', ''),
                'latitude': item['latitude'],
                'longitude': item['longitude'],
                'timezone': item.get('timezone', 'UTC'),
            })
        return JsonResponse({'results': results})

    return JsonResponse({'results': []})


def weather_data(request):
    """Get current weather, hourly (next 24h), and 7-day forecast."""
    lat = request.GET.get('lat')
    lon = request.GET.get('lon')

    if not lat or not lon:
        return JsonResponse(
            {'error': 'Latitude and longitude are required'}, status=400
        )

    url = (
        f'https://api.open-meteo.com/v1/forecast?'
        f'latitude={lat}&longitude={lon}'
        f'&current=temperature_2m,relative_humidity_2m,apparent_temperature,'
        f'weather_code,wind_speed_10m,wind_direction_10m,is_day,'
        f'surface_pressure'
        f'&hourly=temperature_2m,weather_code,precipitation_probability,is_day,'
        f'relative_humidity_2m,visibility,wind_speed_10m'
        f'&daily=weather_code,temperature_2m_max,temperature_2m_min,'
        f'precipitation_probability_max,sunrise,sunset,'
        f'uv_index_max,wind_speed_10m_max'
        f'&timezone=auto'
        f'&forecast_days=7'
        f'&forecast_hours=24'
    )
    response = requests.get(url, timeout=10)

    if response.status_code == 200:
        return JsonResponse(response.json())

    return JsonResponse(
        {'error': 'Failed to fetch weather data'}, status=502
    )


def reverse_geocode(request):
    """Reverse geocode coordinates to a city name via Nominatim."""
    lat = request.GET.get('lat')
    lon = request.GET.get('lon')

    if not lat or not lon:
        return JsonResponse(
            {'error': 'Latitude and longitude are required'}, status=400
        )

    url = (
        f'https://nominatim.openstreetmap.org/reverse'
        f'?lat={lat}&lon={lon}&format=json&zoom=10&accept-language=en'
    )
    headers = {'User-Agent': 'DjangoWeatherApp/1.0'}
    response = requests.get(url, headers=headers, timeout=10)

    if response.status_code == 200:
        data = response.json()
        address = data.get('address', {})
        city = (
            address.get('city')
            or address.get('town')
            or address.get('village')
            or address.get('municipality')
            or address.get('state')
            or 'Unknown'
        )
        country = address.get('country', '')
        return JsonResponse({'city': city, 'country': country})

    return JsonResponse({'city': 'Unknown', 'country': ''})


# ── Activity Scores API ──────────────────────────────────────────

def _fetch_weather_for_scoring(lat, lon):
    """Fetch weather + air quality data needed by the scoring engine."""
    weather_url = (
        f'https://api.open-meteo.com/v1/forecast?'
        f'latitude={lat}&longitude={lon}'
        f'&current=temperature_2m,relative_humidity_2m,'
        f'wind_speed_10m,weather_code,is_day'
        f'&hourly=temperature_2m,relative_humidity_2m,'
        f'precipitation_probability,wind_speed_10m,visibility'
        f'&daily=uv_index_max,sunrise,sunset'
        f'&timezone=auto&forecast_hours=24'
    )
    aqi_url = (
        f'https://air-quality-api.open-meteo.com/v1/air-quality?'
        f'latitude={lat}&longitude={lon}'
        f'&current=european_aqi'
        f'&hourly=european_aqi'
        f'&forecast_hours=24'
    )

    weather_resp = requests.get(weather_url, timeout=10)
    weather = weather_resp.json() if weather_resp.status_code == 200 else {}

    aqi_resp = requests.get(aqi_url, timeout=10)
    aqi_data = aqi_resp.json() if aqi_resp.status_code == 200 else {}

    return weather, aqi_data


def _build_current_weather(weather, aqi_data):
    """Build the dict the scoring engine expects from current data."""
    cur = weather.get('current', {})
    daily = weather.get('daily', {})

    return {
        'temp': cur.get('temperature_2m', 20),
        'wind_speed': cur.get('wind_speed_10m', 0),
        'rain_prob': (weather.get('hourly', {})
                      .get('precipitation_probability', [0])[0]),
        'humidity': cur.get('relative_humidity_2m', 50),
        'uv_index': daily.get('uv_index_max', [None])[0],
        'visibility': (weather.get('hourly', {})
                       .get('visibility', [None])[0]),
        'aqi': (aqi_data.get('current', {})
                .get('european_aqi')),
        'minutes_to_golden': None,  # Phase 3: compute from sunrise/sunset
        'swell_height': None,       # Phase 3: marine API
    }


def _build_hourly_weather(weather, aqi_data):
    """Build a list of 24 hourly weather dicts for window analysis."""
    hourly = weather.get('hourly', {})
    aqi_hourly = aqi_data.get('hourly', {})
    daily = weather.get('daily', {})

    times = hourly.get('time', [])
    count = min(len(times), 24)
    result = []

    for i in range(count):
        time_str = times[i]
        hour_str = time_str.split('T')[1][:5] if 'T' in time_str else f'{i:02d}:00'

        aqi_vals = aqi_hourly.get('european_aqi', [])

        result.append({
            'hour': hour_str,
            'temp': hourly.get('temperature_2m', [20])[i] if i < len(hourly.get('temperature_2m', [])) else 20,
            'wind_speed': hourly.get('wind_speed_10m', [0])[i] if i < len(hourly.get('wind_speed_10m', [])) else 0,
            'rain_prob': hourly.get('precipitation_probability', [0])[i] if i < len(hourly.get('precipitation_probability', [])) else 0,
            'humidity': hourly.get('relative_humidity_2m', [50])[i] if i < len(hourly.get('relative_humidity_2m', [])) else 50,
            'visibility': hourly.get('visibility', [None])[i] if i < len(hourly.get('visibility', [])) else None,
            'uv_index': daily.get('uv_index_max', [None])[0],
            'aqi': aqi_vals[i] if i < len(aqi_vals) else None,
            'minutes_to_golden': None,
            'swell_height': None,
        })

    return result


def activity_scores(request):
    """Return activity scores for a given location."""
    lat = request.GET.get('lat')
    lon = request.GET.get('lon')

    if not lat or not lon:
        return JsonResponse(
            {'error': 'Latitude and longitude are required'}, status=400
        )

    try:
        weather, aqi_data = _fetch_weather_for_scoring(lat, lon)
    except Exception:
        return JsonResponse(
            {'error': 'Failed to fetch weather data for scoring'}, status=502
        )

    current_wx = _build_current_weather(weather, aqi_data)
    hourly_wx = _build_hourly_weather(weather, aqi_data)

    activities = ActivityType.objects.filter(is_active=True)
    results = []

    for act in activities:
        result = compute_score(current_wx, act)
        windows = find_best_windows(hourly_wx, act, threshold=60)
        best = windows[0] if windows else None

        results.append({
            'name': act.name,
            'slug': act.slug,
            'icon': act.icon_name,
            'score': result['score'],
            'label': result['label'],
            'factors': result['factors'],
            'best_window': {
                'start': best['start'],
                'end': best['end'],
                'peak': best['peak'],
            } if best else None,
        })

    # Sort by score descending
    results.sort(key=lambda r: r['score'], reverse=True)

    return JsonResponse({'scores': results})
