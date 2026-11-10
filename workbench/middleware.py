import ipaddress

from django.http import JsonResponse


class LocalOnlyMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.get_host()  # Enforce Django ALLOWED_HOSTS even for read-only endpoints.
        try:
            local = ipaddress.ip_address(request.META.get("REMOTE_ADDR", "")).is_loopback
        except ValueError:
            local = False
        if not local:
            return JsonResponse({"error": "loopback_only"}, status=403)
        response = self.get_response(request)
        response["Cache-Control"] = "no-store"
        response["X-Content-Type-Options"] = "nosniff"
        response.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        return response
