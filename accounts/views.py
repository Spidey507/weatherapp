import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_POST

from accounts.models import SavedLocation
from activities.models import ActivityType, UserActivity


def profile(request):
    """User profile and activity preferences."""
    if not request.user.is_authenticated:
        return render(request, 'accounts/profile.html', {'active_tab': 'profile'})

    activities = ActivityType.objects.filter(is_active=True)
    user_activity_slugs = set(
        UserActivity.objects.filter(user=request.user)
        .values_list('activity_type__slug', flat=True)
    )
    primary_slug = (
        UserActivity.objects.filter(user=request.user, is_primary=True)
        .values_list('activity_type__slug', flat=True)
        .first()
    )

    activity_list = []
    for act in activities:
        activity_list.append({
            'id': act.id,
            'name': act.name,
            'slug': act.slug,
            'icon': act.icon_name,
            'selected': act.slug in user_activity_slugs,
            'is_primary': act.slug == primary_slug,
        })

    return render(request, 'accounts/profile.html', {
        'active_tab': 'profile',
        'activities': activity_list,
        'use_metric': request.user.use_metric,
        'home_location_name': request.user.home_location_name,
        'home_latitude': request.user.home_latitude,
        'home_longitude': request.user.home_longitude,
    })


@require_POST
@login_required
def toggle_activity(request):
    """Toggle an activity on/off for the current user."""
    try:
        data = json.loads(request.body)
        slug = data.get('slug')
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({'error': 'Invalid request'}, status=400)

    try:
        activity_type = ActivityType.objects.get(slug=slug, is_active=True)
    except ActivityType.DoesNotExist:
        return JsonResponse({'error': 'Activity not found'}, status=404)

    ua, created = UserActivity.objects.get_or_create(
        user=request.user, activity_type=activity_type,
    )

    if not created:
        # Already existed — remove it
        ua.delete()
        return JsonResponse({'selected': False, 'slug': slug})

    return JsonResponse({'selected': True, 'slug': slug})


@require_POST
@login_required
def set_primary(request):
    """Set an activity as the user's primary activity."""
    try:
        data = json.loads(request.body)
        slug = data.get('slug')
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({'error': 'Invalid request'}, status=400)

    # Clear existing primary
    UserActivity.objects.filter(user=request.user, is_primary=True).update(is_primary=False)

    if slug:
        try:
            ua = UserActivity.objects.get(
                user=request.user, activity_type__slug=slug,
            )
            ua.is_primary = True
            ua.save()
        except UserActivity.DoesNotExist:
            return JsonResponse({'error': 'Select the activity first'}, status=400)

    return JsonResponse({'primary': slug})


@require_POST
@login_required
def update_units(request):
    """Toggle metric / imperial units."""
    try:
        data = json.loads(request.body)
        use_metric = data.get('use_metric', True)
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({'error': 'Invalid request'}, status=400)

    request.user.use_metric = bool(use_metric)
    request.user.save(update_fields=['use_metric'])
    return JsonResponse({'use_metric': request.user.use_metric})


@require_POST
@login_required
def update_home_location(request):
    """Save the user's home location."""
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({'error': 'Invalid request'}, status=400)

    name = data.get('name', '').strip()
    lat = data.get('latitude')
    lon = data.get('longitude')

    if not name or lat is None or lon is None:
        return JsonResponse({'error': 'Name, latitude, and longitude required'}, status=400)

    try:
        lat = float(lat)
        lon = float(lon)
    except (TypeError, ValueError):
        return JsonResponse({'error': 'Invalid coordinates'}, status=400)

    request.user.home_location_name = name
    request.user.home_latitude = lat
    request.user.home_longitude = lon
    request.user.save(update_fields=['home_location_name', 'home_latitude', 'home_longitude'])

    return JsonResponse({
        'name': request.user.home_location_name,
        'latitude': request.user.home_latitude,
        'longitude': request.user.home_longitude,
    })


@require_POST
@login_required
def clear_home_location(request):
    """Remove the user's home location."""
    request.user.home_location_name = ''
    request.user.home_latitude = None
    request.user.home_longitude = None
    request.user.save(update_fields=['home_location_name', 'home_latitude', 'home_longitude'])
    return JsonResponse({'cleared': True})


@require_POST
@login_required
def save_location(request):
    """Bookmark a location for quick-switching (max 5)."""
    try:
        data = json.loads(request.body)
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({'error': 'Invalid request'}, status=400)

    name = data.get('name', '').strip()
    lat = data.get('latitude')
    lon = data.get('longitude')

    if not name or lat is None or lon is None:
        return JsonResponse({'error': 'Missing fields'}, status=400)

    # Cap at 5 saved locations
    count = SavedLocation.objects.filter(user=request.user).count()
    if count >= 5:
        return JsonResponse({'error': 'Maximum 5 saved locations'}, status=400)

    loc, created = SavedLocation.objects.get_or_create(
        user=request.user, name=name,
        defaults={'latitude': float(lat), 'longitude': float(lon)},
    )
    if not created:
        return JsonResponse({'error': 'Already saved'}, status=409)

    return JsonResponse({
        'id': loc.id, 'name': loc.name,
        'latitude': loc.latitude, 'longitude': loc.longitude,
    })


@require_POST
@login_required
def remove_location(request):
    """Remove a saved location."""
    try:
        data = json.loads(request.body)
        name = data.get('name', '').strip()
    except (json.JSONDecodeError, AttributeError):
        return JsonResponse({'error': 'Invalid request'}, status=400)

    SavedLocation.objects.filter(user=request.user, name=name).delete()
    return JsonResponse({'removed': True})
