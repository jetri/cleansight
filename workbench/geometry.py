import math

from django.core.exceptions import ValidationError
from shapely.geometry import Point, Polygon


def validate_geometry(value):
    if not isinstance(value, dict) or set(value) != {"zones", "exclusions", "boundary"}:
        raise ValidationError("Geometry requires zones, exclusions and normalized boundary")
    boundary = value["boundary"]
    if (
        isinstance(boundary, bool)
        or not isinstance(boundary, (int, float))
        or not math.isfinite(boundary)
        or not 0 <= boundary <= 0.25
    ):
        raise ValidationError("Invalid normalized boundary")
    for kind in ["zones", "exclusions"]:
        items = value[kind]
        if not isinstance(items, list) or len(items) > 32 or (kind == "zones" and not items):
            raise ValidationError("Use 1-32 zones and at most 32 exclusions")
        polygons = []
        names = set()
        for item in items:
            if (
                not isinstance(item, dict)
                or set(item) != {"name", "points"}
                or not isinstance(item["name"], str)
                or not 1 <= len(item["name"]) <= 80
                or item["name"] in names
            ):
                raise ValidationError("Invalid or duplicate polygon name")
            names.add(item["name"])
            points = item["points"]
            if not isinstance(points, list) or not 3 <= len(points) <= 128:
                raise ValidationError("Polygon requires 3-128 normalized vertices")
            for point in points:
                if (
                    not isinstance(point, list)
                    or len(point) != 2
                    or any(
                        isinstance(x, bool)
                        or not isinstance(x, (int, float))
                        or not math.isfinite(x)
                        or not 0 <= x <= 1
                        for x in point
                    )
                ):
                    raise ValidationError("Vertices must be finite normalized coordinates")
            polygon = Polygon(points)
            if not polygon.is_valid or polygon.area <= 0:
                raise ValidationError("Self-intersecting or degenerate polygon")
            if any(polygon.intersection(other).area > 0 for other in polygons):
                raise ValidationError("Ambiguous same-kind polygon overlap")
            polygons.append(polygon)
    return value


def classify_point(geometry, x, y):
    """Geometry fixture helper, NOT an observation of an actual landing."""
    point = Point(x, y)
    if any(Polygon(p["points"]).covers(point) for p in geometry["exclusions"]):
        return "excluded"
    for zone in geometry["zones"]:
        polygon = Polygon(zone["points"])
        if polygon.covers(point):
            return (
                "boundary" if polygon.boundary.distance(point) <= geometry["boundary"] else "inside"
            )
    return "outside"
