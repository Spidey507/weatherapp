from django.urls import path
from . import views

app_name = 'accounts'

urlpatterns = [
    path('', views.profile, name='profile'),
    path('api/toggle-activity/', views.toggle_activity, name='toggle_activity'),
    path('api/set-primary/', views.set_primary, name='set_primary'),
    path('api/units/', views.update_units, name='update_units'),
    path('api/home-location/', views.update_home_location, name='update_home_location'),
    path('api/clear-home-location/', views.clear_home_location, name='clear_home_location'),
    path('api/save-location/', views.save_location, name='save_location'),
    path('api/remove-location/', views.remove_location, name='remove_location'),
]
