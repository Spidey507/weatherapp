import requests
from django.shortcuts import render

api_key = 'a0f1f431acc64ad8a4d201219231007'

def weather_view(request):
    location = ''

    api_url = f"http://api.weatherapi.com/v1/current.json?key={api_key}&q={location}"

    response = requests.get(api_url)
    if response.status_code == 200:
        data = response.json()
        # Process the data as needed
        context = {
            'location': data['location']['name'],
            'temperature': data['current']['temp_c'],
            'condition': data['current']['condition']['text']
        }
        return render(request, 'weather/weather.html', context)
    else:
        # Handle any errors
        return render(request, 'weather/error.html')

#ESTA VAINA ACA ABAJO NO FUNCIONA POR AHORA, ME ABURRI A MITAD DE CAMINO, LUEGO LO ARREGLO.
def forecast_view(request):
    location = '' 
    days = 2
    api_url = f"http://api.weatherapi.com/v1/current.json?key={api_key}&q={location}&days={days}"
    
    response = requests.get(api_url)
    if response.status_code == 200: 
        data = response.json()
        context = {
            'location': data['location']['name'],
            'temperature': data['current']['temp_c'],
            'condition': data['current']['condition']['text']
        }
        return render(request, 'weather/weather.html', context)
    else:
        return render(request, 'weather/error.html')
    
