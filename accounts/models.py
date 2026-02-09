from django.conf import settings
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


class SavedLocation(models.Model):
    """A bookmarked city for quick-switching."""
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='saved_locations',
    )
    name = models.CharField(max_length=200)
    latitude = models.FloatField()
    longitude = models.FloatField()
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'saved_locations'
        ordering = ['sort_order', 'created_at']
        unique_together = [('user', 'name')]

    def __str__(self):
        return f'{self.name} ({self.user})'
