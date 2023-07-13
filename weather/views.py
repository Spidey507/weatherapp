import requests
from django.shortcuts import render

api_key = 'a0f1f431acc64ad8a4d201219231007'

def weather_forecast_view(request):
    location = 'Tokyo'
    days = 3

    weather_api_url = f"http://api.weatherapi.com/v1/current.json?key={api_key}&q={location}"
    forecast_api_url = f"http://api.weatherapi.com/v1/forecast.json?key={api_key}&q={location}&days={days}"
    
    weather_response = requests.get(weather_api_url)
    forecast_response = requests.get(forecast_api_url)
    
    if weather_response.status_code == 200 and forecast_response.status_code == 200:
        weather_data = weather_response.json()
        forecast_data = forecast_response.json()
        
        weather_context = {
            'location': weather_data['location']['name'],
            'temperature': weather_data['current']['temp_c'],
            'condition': weather_data['current']['condition']['text']
        }
        
        forecast_context = {
            'location': location,
            'forecast': [
                {
                    'date': forecast_day['date'],
                    'temperature': forecast_day['day']['avgtemp_c'],
                    'condition': forecast_day['day']['condition']['text']
                }
                for forecast_day in forecast_data['forecast']['forecastday']
            ]
        }

        return render(request, 'weather/weather.html', {'weather': weather_context, 'forecast': forecast_context})
    else:
        # error.html doesnt exists yet, nothing fails at the moment but will eventually. Ill create it later.
        return render(request, 'weather/error.html')