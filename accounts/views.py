from django.shortcuts import render


def profile(request):
    """User profile and activity preferences."""
    return render(request, 'accounts/profile.html', {'active_tab': 'profile'})
