from django.urls import path
from . import views

app_name = 'weather'

urlpatterns = [
    path('', views.index, name='index'),
    path('weather/api/geocode/', views.geocode, name='geocode'),
    path('weather/api/weather/', views.weather_data, name='weather_data'),
    path('weather/api/reverse-geocode/', views.reverse_geocode, name='reverse_geocode'),
    path('weather/api/scores/', views.activity_scores, name='activity_scores'),
]
