from django.contrib import admin
from django.urls import include, path
from django.views.generic import TemplateView


urlpatterns = [
    path('admin/', admin.site.urls),

    # Main tabs
    path('', include('weather.urls')),
    path('explore/', TemplateView.as_view(
        template_name='placeholder.html',
        extra_context={'active_tab': 'explore', 'page_title': 'Explore',
                       'page_lucide': 'compass', 'page_desc': 'Discover outdoor spots near you.'},
    ), name='explore'),
    path('log/', TemplateView.as_view(
        template_name='placeholder.html',
        extra_context={'active_tab': 'log', 'page_title': 'Activity Log',
                       'page_lucide': 'notebook-pen', 'page_desc': 'Track your outdoor activities.'},
    ), name='log'),
    path('alerts/', TemplateView.as_view(
        template_name='placeholder.html',
        extra_context={'active_tab': 'alerts', 'page_title': 'Alerts',
                       'page_lucide': 'bell', 'page_desc': 'Get notified when conditions are perfect.'},
    ), name='alerts'),
    path('profile/', include('accounts.urls')),

    # Auth (allauth)
    path('accounts/', include('allauth.urls')),

    # Service worker (must be at root scope)
    path('sw.js', TemplateView.as_view(
        template_name='sw.js', content_type='application/javascript',
    ), name='sw'),
]
