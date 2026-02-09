from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('email', 'username', 'home_location_name', 'use_metric', 'is_staff')
    list_filter = BaseUserAdmin.list_filter + ('use_metric',)
    fieldsets = BaseUserAdmin.fieldsets + (
        ('Outdoor Hub', {
            'fields': (
                'home_latitude', 'home_longitude', 'home_location_name',
                'use_metric', 'timezone', 'avatar', 'bio',
            ),
        }),
    )
