from django.contrib import admin
from .models import ActivityType, UserActivity


@admin.register(ActivityType)
class ActivityTypeAdmin(admin.ModelAdmin):
    list_display = ('emoji', 'name', 'slug', 'sort_order', 'is_active')
    list_editable = ('sort_order', 'is_active')
    prepopulated_fields = {'slug': ('name',)}
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(UserActivity)
class UserActivityAdmin(admin.ModelAdmin):
    list_display = ('user', 'activity_type', 'is_primary')
    list_filter = ('activity_type', 'is_primary')
    raw_id_fields = ('user',)
