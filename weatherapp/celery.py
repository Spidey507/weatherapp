"""Celery configuration for the Outdoor Activity Hub.

Start the worker (after Redis is installed):
    celery -A weatherapp worker -l info
    celery -A weatherapp beat -l info
"""
import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'weatherapp.settings')

app = Celery('weatherapp')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()
