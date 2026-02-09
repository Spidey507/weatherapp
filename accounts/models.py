from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom user model for the outdoor activity hub."""

    home_latitude = models.FloatField(null=True, blank=True)
    home_longitude = models.FloatField(null=True, blank=True)
    home_location_name = models.CharField(max_length=200, blank=True, default='')

    use_metric = models.BooleanField(default=True)
    timezone = models.CharField(max_length=63, default='UTC')

    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    bio = models.CharField(max_length=300, blank=True, default='')

    class Meta:
        db_table = 'users'

    def __str__(self):
        return self.email or self.username
