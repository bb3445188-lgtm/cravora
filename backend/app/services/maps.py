import json
import math
from typing import Any, Dict, List, Optional, Tuple
import httpx
from sqlalchemy.orm import Session
from app.config import settings
from app.models import Branch, DeliveryZone

# Verified directory of Pakistani neighborhoods & landmarks for instant autocomplete & fallback
PAKISTAN_LOCATIONS_DIRECTORY: List[Dict[str, Any]] = [
    {
        "display_name": "Jinnah Super Market, F-7 Markaz, Islamabad",
        "area": "F-7 Markaz",
        "city": "Islamabad",
        "latitude": 33.7215,
        "longitude": 73.0571,
    },
    {
        "display_name": "Super Market, F-6 Markaz, Islamabad",
        "area": "F-6 Markaz",
        "city": "Islamabad",
        "latitude": 33.7297,
        "longitude": 73.0746,
    },
    {
        "display_name": "Blue Area, Jinnah Avenue, G-7/F-7, Islamabad",
        "area": "Blue Area",
        "city": "Islamabad",
        "latitude": 33.7138,
        "longitude": 73.0619,
    },
    {
        "display_name": "F-10 Markaz, Main Double Road, Islamabad",
        "area": "F-10 Markaz",
        "city": "Islamabad",
        "latitude": 33.6911,
        "longitude": 73.0119,
    },
    {
        "display_name": "I-8 Markaz, Habibi Chowk, Islamabad",
        "area": "I-8 Markaz",
        "city": "Islamabad",
        "latitude": 33.6682,
        "longitude": 73.0752,
    },
    {
        "display_name": "G-11 Markaz, Ibn-e-Sina Road, Islamabad",
        "area": "G-11 Markaz",
        "city": "Islamabad",
        "latitude": 33.6694,
        "longitude": 72.9972,
    },
    {
        "display_name": "Saddar Bank Road, Cantonment, Rawalpindi",
        "area": "Saddar",
        "city": "Rawalpindi",
        "latitude": 33.5973,
        "longitude": 73.0479,
    },
    {
        "display_name": "Commercial Market, Satellite Town B-Block, Rawalpindi",
        "area": "Satellite Town",
        "city": "Rawalpindi",
        "latitude": 33.6388,
        "longitude": 73.0695,
    },
    {
        "display_name": "Civic Center Phase 4, Bahria Town, Rawalpindi",
        "area": "Bahria Town Phase 4",
        "city": "Rawalpindi",
        "latitude": 33.5512,
        "longitude": 73.1243,
    },
    {
        "display_name": "MM Alam Road, Gulberg III, Lahore",
        "area": "Gulberg III",
        "city": "Lahore",
        "latitude": 31.5119,
        "longitude": 74.3519,
    },
    {
        "display_name": "Y-Block Commercial, DHA Phase 3, Lahore",
        "area": "DHA Phase 3",
        "city": "Lahore",
        "latitude": 31.4718,
        "longitude": 74.3765,
    },
    {
        "display_name": "Shaukat Khanum Chowk, Johar Town G1 Market, Lahore",
        "area": "Johar Town",
        "city": "Lahore",
        "latitude": 31.4697,
        "longitude": 74.2728,
    },
    {
        "display_name": "Boat Basin, Block 5 Clifton, Karachi",
        "area": "Clifton Block 5",
        "city": "Karachi",
        "latitude": 24.8195,
        "longitude": 67.0281,
    },
    {
        "display_name": "Khayaban-e-Shahbaz, DHA Phase 6, Karachi",
        "area": "DHA Phase 6",
        "city": "Karachi",
        "latitude": 24.8055,
        "longitude": 67.0642,
    },
    {
        "display_name": "Taxila Museum Road, Taxila (Outside Delivery Zone Test Area)",
        "area": "Taxila",
        "city": "Taxila",
        "latitude": 33.7463,
        "longitude": 72.8397,
    },
]


def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great-circle distance in kilometers between two coordinates."""
    r = 6371.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r * c, 2)


def point_in_polygon(lat: float, lng: float, polygon_coords: List[List[float]]) -> bool:
    """Ray-casting point-in-polygon algorithm. polygon_coords is a list of [lat, lng] pairs."""
    if not polygon_coords or len(polygon_coords) < 3:
        return False
    inside = False
    n = len(polygon_coords)
    p1_lat, p1_lng = polygon_coords[0][0], polygon_coords[0][1]
    for i in range(1, n + 1):
        p2_lat, p2_lng = polygon_coords[i % n][0], polygon_coords[i % n][1]
        if lng > min(p1_lng, p2_lng):
            if lng <= max(p1_lng, p2_lng):
                if lat <= max(p1_lat, p2_lat):
                    if p1_lng != p2_lng:
                        xinters = (lng - p1_lng) * (p2_lat - p1_lat) / (p2_lng - p1_lng) + p1_lat
                    if p1_lat == p2_lat or lat <= xinters:
                        inside = not inside
        p1_lat, p1_lng = p2_lat, p2_lng
    return inside


def serialize_zone(zone: DeliveryZone) -> Dict[str, Any]:
    try:
        poly = json.loads(zone.polygon_coords or "[]")
    except Exception:
        poly = []
    return {
        "id": zone.id,
        "branch_id": zone.branch_id,
        "name": zone.name,
        "zone_type": zone.zone_type,
        "radius_km": zone.radius_km,
        "polygon_coords": poly,
        "base_delivery_fee": zone.base_delivery_fee,
        "per_km_fee": zone.per_km_fee,
        "min_order_amount": zone.min_order_amount,
        "free_delivery_threshold": zone.free_delivery_threshold,
        "estimated_mins": zone.estimated_mins,
        "is_active": zone.is_active,
    }


def serialize_branch(
    branch: Branch,
    user_lat: Optional[float] = None,
    user_lng: Optional[float] = None,
) -> Dict[str, Any]:
    dist = None
    if user_lat is not None and user_lng is not None:
        dist = haversine_distance_km(user_lat, user_lng, branch.latitude, branch.longitude)
    return {
        "id": branch.id,
        "code": branch.code,
        "name": branch.name,
        "city": branch.city,
        "area": branch.area,
        "address": branch.address,
        "phone": branch.phone,
        "email": branch.email,
        "latitude": branch.latitude,
        "longitude": branch.longitude,
        "opening_time": branch.opening_time,
        "closing_time": branch.closing_time,
        "is_open": branch.is_open,
        "supports_delivery": branch.supports_delivery,
        "supports_pickup": branch.supports_pickup,
        "supports_dine_in": branch.supports_dine_in,
        "prep_time_mins": branch.prep_time_mins,
        "delivery_time_mins": branch.delivery_time_mins,
        "is_sample_data": branch.is_sample_data,
        "distance_km": dist,
        "delivery_zones": [serialize_zone(z) for z in branch.delivery_zones if z.is_active],
    }


def is_point_covered_by_zone(
    lat: float,
    lng: float,
    branch: Branch,
    zone: DeliveryZone,
) -> Tuple[bool, float]:
    dist_km = haversine_distance_km(lat, lng, branch.latitude, branch.longitude)
    if not zone.is_active:
        return False, dist_km
    if zone.zone_type == "polygon":
        try:
            poly = json.loads(zone.polygon_coords or "[]")
        except Exception:
            poly = []
        if poly and len(poly) >= 3:
            if point_in_polygon(lat, lng, poly):
                return True, dist_km
    # Check radius rule if zone_type is radius OR if polygon is also bounded by radius
    if zone.zone_type == "radius" and dist_km <= zone.radius_km:
        return True, dist_km
    return False, dist_km


def calculate_zone_delivery_fee(
    zone: DeliveryZone,
    distance_km: float,
    subtotal: int = 0,
) -> Tuple[int, str]:
    if (
        zone.free_delivery_threshold is not None
        and subtotal > 0
        and subtotal >= zone.free_delivery_threshold
    ):
        return (
            0,
            f"FREE Delivery unlocked (Order above Rs. {zone.free_delivery_threshold:,})",
        )
    distance_charge = int(round(distance_km * zone.per_km_fee))
    total_fee = zone.base_delivery_fee + distance_charge
    breakdown = (
        f"Base fee Rs. {zone.base_delivery_fee} + Rs. {zone.per_km_fee}/km × {distance_km:.1f} km = Rs. {total_fee}"
    )
    return total_fee, breakdown


def evaluate_delivery_coverage(
    db: Session,
    latitude: float,
    longitude: float,
    subtotal: int = 0,
    preferred_branch_id: Optional[int] = None,
) -> Dict[str, Any]:
    branches = db.query(Branch).filter(Branch.is_open == True).all()
    if not branches:
        return {
            "deliverable": False,
            "message": "No active branches are currently open.",
            "matched_branch": None,
            "matched_zone": None,
            "distance_km": None,
            "delivery_fee": 0,
            "delivery_fee_breakdown": "No active branches",
            "min_order_amount": 0,
            "free_delivery_threshold": None,
            "estimated_delivery_mins": None,
            "nearest_pickup_branch": None,
            "alternative_branches": [],
        }

    # Sort branches by distance to customer
    branches_with_dist: List[Tuple[Branch, float]] = [
        (b, haversine_distance_km(latitude, longitude, b.latitude, b.longitude))
        for b in branches
    ]
    branches_with_dist.sort(key=lambda x: x[1])

    nearest_pickup_branch = next(
        (b for b, _ in branches_with_dist if b.supports_pickup),
        branches_with_dist[0][0],
    )

    # Check preferred branch first if specified
    candidate_matches: List[Tuple[Branch, DeliveryZone, float]] = []
    for branch, dist_km in branches_with_dist:
        if not branch.supports_delivery:
            continue
        for zone in branch.delivery_zones:
            covered, z_dist = is_point_covered_by_zone(latitude, longitude, branch, zone)
            if covered:
                candidate_matches.append((branch, zone, z_dist))

    if preferred_branch_id:
        preferred = [m for m in candidate_matches if m[0].id == preferred_branch_id]
        if preferred:
            candidate_matches = preferred + [m for m in candidate_matches if m[0].id != preferred_branch_id]

    if candidate_matches:
        matched_branch, matched_zone, dist_km = candidate_matches[0]
        fee, breakdown = calculate_zone_delivery_fee(matched_zone, dist_km, subtotal)
        est_mins = matched_zone.estimated_mins + int(round(dist_km * 1.5))
        return {
            "deliverable": True,
            "message": f"Great news! Your location is covered by {matched_branch.name} ({matched_zone.name}, {dist_km:.1f} km away).",
            "matched_branch": serialize_branch(matched_branch, latitude, longitude),
            "matched_zone": serialize_zone(matched_zone),
            "distance_km": dist_km,
            "delivery_fee": fee,
            "delivery_fee_breakdown": breakdown,
            "min_order_amount": matched_zone.min_order_amount,
            "free_delivery_threshold": matched_zone.free_delivery_threshold,
            "estimated_delivery_mins": est_mins,
            "nearest_pickup_branch": serialize_branch(nearest_pickup_branch, latitude, longitude),
            "alternative_branches": [
                serialize_branch(b, latitude, longitude)
                for b, _ in branches_with_dist[:3]
            ],
        }

    nearest_branch, nearest_dist = branches_with_dist[0]
    return {
        "deliverable": False,
        "message": (
            f"Your pin is {nearest_dist:.1f} km from our nearest outlet ({nearest_branch.name}), "
            f"which is outside our configured delivery zone. You can switch to Pickup at {nearest_pickup_branch.name} "
            f"or choose an address inside Islamabad, Rawalpindi, Lahore, or Karachi coverage areas."
        ),
        "matched_branch": None,
        "matched_zone": None,
        "distance_km": nearest_dist,
        "delivery_fee": 0,
        "delivery_fee_breakdown": "Outside delivery coverage zone",
        "min_order_amount": 0,
        "free_delivery_threshold": None,
        "estimated_delivery_mins": None,
        "nearest_pickup_branch": serialize_branch(nearest_pickup_branch, latitude, longitude),
        "alternative_branches": [
            serialize_branch(b, latitude, longitude)
            for b, _ in branches_with_dist[:4]
        ],
    }


def search_addresses(query: str) -> List[Dict[str, Any]]:
    q = (query or "").strip().lower()
    if not q:
        return PAKISTAN_LOCATIONS_DIRECTORY[:8]

    # Match against built-in Pakistani landmarks first for fast, accurate local results
    local_matches = [
        item
        for item in PAKISTAN_LOCATIONS_DIRECTORY
        if q in item["display_name"].lower()
        or q in item["area"].lower()
        or q in item["city"].lower()
    ]

    # Optionally augment with Nominatim OpenStreetMap if network is reachable
    if len(local_matches) < 3 and settings.MAPS_PROVIDER == "osm_nominatim":
        try:
            with httpx.Client(timeout=2.5) as client:
                resp = client.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={
                        "q": f"{query}, Pakistan",
                        "format": "json",
                        "limit": 5,
                        "addressdetails": 1,
                    },
                    headers={"User-Agent": "CravoraFoodPlatform/1.0"},
                )
                if resp.status_code == 200:
                    for row in resp.json():
                        addr = row.get("address", {})
                        city = (
                            addr.get("city")
                            or addr.get("town")
                            or addr.get("state_district")
                            or "Islamabad"
                        )
                        area = (
                            addr.get("suburb")
                            or addr.get("neighbourhood")
                            or addr.get("road")
                            or city
                        )
                        local_matches.append({
                            "display_name": row.get("display_name", query),
                            "area": area,
                            "city": city,
                            "latitude": float(row["lat"]),
                            "longitude": float(row["lon"]),
                        })
        except Exception:
            pass

    return local_matches[:8]


def reverse_geocode(latitude: float, longitude: float) -> Dict[str, Any]:
    # Find closest known Pakistani area in directory
    closest = min(
        PAKISTAN_LOCATIONS_DIRECTORY,
        key=lambda loc: haversine_distance_km(
            latitude, longitude, loc["latitude"], loc["longitude"]
        ),
    )
    dist = haversine_distance_km(
        latitude, longitude, closest["latitude"], closest["longitude"]
    )
    if dist <= 3.5:
        return {
            "formatted_address": f"Near {closest['display_name']} ({latitude:.4f}, {longitude:.4f})",
            "area": closest["area"],
            "city": closest["city"],
            "latitude": latitude,
            "longitude": longitude,
            "provider": "cravora_pk_geocoder",
        }
    return {
        "formatted_address": f"Pinned Location ({latitude:.4f}° N, {longitude:.4f}° E), {closest['city']}",
        "area": f"Sector / Area near {closest['area']}",
        "city": closest["city"],
        "latitude": latitude,
        "longitude": longitude,
        "provider": "coordinate_pin",
    }
