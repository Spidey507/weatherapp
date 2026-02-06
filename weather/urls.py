from django.urls import path
from . import views

app_name = 'weather'

urlpatterns = [
    path('', views.index, name='index'),
    path('api/geocode/', views.geocode, name='geocode'),
    path('api/weather/', views.weather_data, name='weather_data'),
    path('api/reverse-geocode/', views.reverse_geocode, name='reverse_geocode'),
]
