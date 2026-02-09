from django.urls import path
from . import views

urlpatterns = [
    path('', views.explore, name='explore'),
    path('api/spots/', views.nearby_spots, name='nearby_spots'),
]
