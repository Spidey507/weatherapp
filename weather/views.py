import requests
from django.shortcuts import render
from django.http import JsonResponse


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
        f'&hourly=temperature_2m,weather_code,precipitation_probability,is_day'
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
