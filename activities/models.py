from django.conf import settings
from django.db import models


class ActivityType(models.Model):
    """A type of outdoor activity (running, hiking, surfing, etc.).

    Each type carries default scoring weights and ideal condition ranges
    that feed into the activity-scoring engine.
    """

    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=60, unique=True)
    emoji = models.CharField(max_length=10)
    description = models.TextField(blank=True, default='')

    # Scoring weights (0.0-1.0): how much each weather factor matters
    temp_weight = models.FloatField(default=0.20)
    wind_weight = models.FloatField(default=0.15)
    rain_weight = models.FloatField(default=0.20)
    uv_weight = models.FloatField(default=0.10)
    humidity_weight = models.FloatField(default=0.10)
    visibility_weight = models.FloatField(default=0.05)
    air_quality_weight = models.FloatField(default=0.10)
    golden_hour_weight = models.FloatField(default=0.00)
    swell_weight = models.FloatField(default=0.00)

    # Ideal condition ranges
    ideal_temp_min = models.FloatField(default=10)
    ideal_temp_max = models.FloatField(default=25)
    max_wind_speed = models.FloatField(default=30)
    max_rain_probability = models.FloatField(default=20)

    # Display
    icon_name = models.CharField(
        max_length=40, default='activity',
        help_text='Lucide icon name for display',
    )

    is_active = models.BooleanField(default=True)
    sort_order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'name']

    def __str__(self):
        return f'{self.emoji} {self.name}'


class UserActivity(models.Model):
    """Links a user to an activity type they participate in."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='user_activities',
    )
    activity_type = models.ForeignKey(
        ActivityType,
        on_delete=models.CASCADE,
        related_name='users',
    )

    # Personal overrides (null = use the activity type defaults)
    ideal_temp_min = models.FloatField(null=True, blank=True)
    ideal_temp_max = models.FloatField(null=True, blank=True)
    max_wind_speed = models.FloatField(null=True, blank=True)
    max_rain_probability = models.FloatField(null=True, blank=True)

    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('user', 'activity_type')
        verbose_name_plural = 'user activities'

    def __str__(self):
        return f'{self.user} - {self.activity_type}'

    @property
    def effective_temp_min(self):
        return self.ideal_temp_min if self.ideal_temp_min is not None else self.activity_type.ideal_temp_min

    @property
    def effective_temp_max(self):
        return self.ideal_temp_max if self.ideal_temp_max is not None else self.activity_type.ideal_temp_max

    @property
    def effective_max_wind(self):
        return self.max_wind_speed if self.max_wind_speed is not None else self.activity_type.max_wind_speed
