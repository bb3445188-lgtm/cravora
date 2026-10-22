import json
import os
import sys
import uuid
import pytest
from fastapi.testclient import TestClient

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.main import app
from app.services.payments import compute_webhook_signature


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


def get_auth_headers(client: TestClient, email: str, password: str):
    resp = client.post("/api/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_1_health_and_seeded_menu(client: TestClient):
    """Verify health check, 16 menu categories, and seeded products."""
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["counts"]["categories"] >= 16
    assert data["counts"]["products"] >= 20
    assert data["counts"]["branches"] >= 6

    cats = client.get("/api/menu/categories").json()
    assert len(cats) >= 16

    prods = client.get("/api/menu/products?bestseller_only=true").json()
    assert len(prods) >= 5


def test_2_customer_complete_ordering_journey(client: TestClient):
    """Customer Journey:
    Select delivery -> validate location -> browse menu -> customize food ->
    calculate cart with coupon -> checkout -> create order -> track order.
    """
    # 1. Validate delivery location (F-7 Islamabad)
    cov_resp = client.post(
        "/api/maps/check-coverage",
        json={"latitude": 33.7215, "longitude": 73.0571, "subtotal": 2000},
    )
    assert cov_resp.status_code == 200
    cov = cov_resp.json()
    assert cov["deliverable"] is True
    assert cov["matched_branch"]["code"] == "ISB-F7"

    # 2. Browse & get customizable pizza details
    pizza_resp = client.get("/api/menu/products/royal-crown-crust-pizza")
    assert pizza_resp.status_code == 200
    pizza = pizza_resp.json()
    large_variant = next(v for v in pizza["variants"] if "Large" in v["name"])
    crust_group = next(g for g in pizza["customization_groups"] if "Crust" in g["name"])
    deep_pan_opt = next(o for o in crust_group["options"] if "Deep Pan" in o["name"])

    # 3. Server-side cart calculation with customization & coupon CRAVORA20
    calc_resp = client.post(
        "/api/cart/calculate",
        json={
            "items": [
                {
                    "product_id": pizza["id"],
                    "variant_id": large_variant["id"],
                    "selected_option_ids": [deep_pan_opt["id"]],
                    "quantity": 1,
                }
            ],
            "fulfillment_type": "delivery",
            "branch_id": cov["matched_branch"]["id"],
            "delivery_lat": 33.7215,
            "delivery_lng": 73.0571,
            "coupon_code": "CRAVORA20",
        },
    )
    assert calc_resp.status_code == 200
    calc = calc_resp.json()
    expected_unit = large_variant["absolute_price"] + deep_pan_opt["price"]
    assert calc["subtotal"] == expected_unit
    assert calc["coupon_valid"] is True
    assert calc["discount_amount"] > 0
    assert calc["total_amount"] > 0

    # 4. Checkout & create order transactionally
    order_resp = client.post(
        "/api/orders",
        json={
            "customer_name": "Ayesha Siddiqui",
            "customer_phone": "+92 301 8887766",
            "customer_email": "ayesha@example.com",
            "fulfillment_type": "delivery",
            "branch_id": cov["matched_branch"]["id"],
            "delivery_address": {
                "house_number": "House 9",
                "street": "Street 19",
                "area": "F-7/2",
                "city": "Islamabad",
                "landmark": "Near Rana Market",
                "delivery_instructions": "Call on arrival",
                "latitude": 33.7215,
                "longitude": 73.0571,
                "formatted_address": "House 9, Street 19, F-7/2, Islamabad",
            },
            "items": [
                {
                    "product_id": pizza["id"],
                    "variant_id": large_variant["id"],
                    "selected_option_ids": [deep_pan_opt["id"]],
                    "quantity": 1,
                }
            ],
            "coupon_code": "CRAVORA20",
            "payment_method": "cod",
            "order_notes": "Make it extra hot!",
        },
    )
    assert order_resp.status_code == 201, order_resp.text
    order_data = order_resp.json()
    assert order_data["order_reference"].startswith("CRV-")
    assert order_data["total_amount"] == calc["total_amount"]

    # 5. Track order using verified phone number
    track_resp = client.get(
        f"/api/orders/{order_data['order_reference']}",
        params={"phone": "+92 301 8887766"},
    )
    assert track_resp.status_code == 200
    assert track_resp.json()["status"] == "order_placed"


def test_3_ai_concierge_budget_recommendation_and_cart_prep(client: TestClient):
    """AI Journey:
    Ask for budget-based recommendation -> retrieve real products -> show real prices ->
    prepare proposed cart -> verify total & confirmation requirement.
    """
    resp = client.post(
        "/api/ai/chat",
        json={
            "message": "Suggest the best meal under Rs. 1,500",
            "fulfillment_type": "delivery",
            "delivery_lat": 33.7215,
            "delivery_lng": 73.0571,
        },
    )
    assert resp.status_code == 200
    ai_data = resp.json()
    assert "search_products" in ai_data["tools_invoked"]
    assert "prepare_cart" in ai_data["tools_invoked"]
    assert len(ai_data["recommended_products"]) > 0
    for prod in ai_data["recommended_products"]:
        assert prod["base_price"] <= 1500
    assert ai_data["proposed_cart"] is not None
    assert ai_data["proposed_cart"]["requires_customer_confirmation"] is True
    assert ai_data["proposed_cart"]["total_amount"] > 0


def test_4_order_support_and_ticket_escalation_journey(client: TestClient):
    """Order Support Journey:
    Authenticate customer -> retrieve authorized order status -> create support ticket -> verify reference.
    """
    headers = get_auth_headers(client, "hamza@example.com", "Customer!2026")

    # Retrieve authenticated customer's order via AI & REST
    ai_status = client.post(
        "/api/ai/chat",
        headers=headers,
        json={"message": "Where is my order CRV-20261020-1001?"},
    )
    assert ai_status.status_code == 200
    card = ai_status.json()["order_status_card"]
    assert card is not None
    assert card["authorized"] is True
    assert card["order_reference"] == "CRV-20261020-1001"

    # Create a support ticket
    ticket_resp = client.post(
        "/api/support/tickets",
        headers=headers,
        json={
            "customer_name": "Hamza Khan",
            "customer_email": "hamza@example.com",
            "customer_phone": "+92 333 5129081",
            "order_reference": "CRV-20261020-1001",
            "category": "order_issue",
            "priority": "high",
            "subject": "Missing garlic dip in order",
            "message": "Please send the extra garlic herb dip tub with my order.",
        },
    )
    assert ticket_resp.status_code == 201
    t_data = ticket_resp.json()
    assert t_data["ticket_reference"].startswith("TKT-")


def test_5_admin_end_to_end_journey(client: TestClient):
    """Admin Journey:
    Log in -> create product -> publish promotion -> update order status -> verify customer sees updated status.
    """
    admin_headers = get_auth_headers(client, "admin@cravora.pk", "CravoraAdmin!2026")
    customer_headers = get_auth_headers(client, "hamza@example.com", "Customer!2026")

    # 1. Create a new product
    cats = client.get("/api/menu/categories").json()
    prod_resp = client.post(
        "/api/admin/products",
        headers=admin_headers,
        json={
            "category_id": cats[0]["id"],
            "name": "Peshawari Chapli Kabab Artisan Pizza",
            "short_description": "Spiced chapli kabab crumbles, pomegranate reduction, and green chili mozzarella.",
            "image_url": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80",
            "base_price": 1790,
            "is_available": True,
            "is_bestseller": True,
            "is_spicy": True,
            "dietary_tags": ["Halal Certified", "Admin Created"],
        },
    )
    assert prod_resp.status_code == 201
    created_prod = prod_resp.json()
    assert created_prod["base_price"] == 1790

    # 2. Publish a promotion coupon
    promo_resp = client.post(
        "/api/admin/coupons",
        headers=admin_headers,
        json={
            "code": f"CHAPLI{uuid.uuid4().hex[:6].upper()}",
            "title": "Rs. 400 OFF Chapli Special",
            "description": "Flat Rs. 400 off orders above Rs. 1,700",
            "discount_type": "fixed",
            "discount_value": 400,
            "min_order_amount": 1700,
            "is_active": True,
        },
    )
    assert promo_resp.status_code == 201

    # 3. Update order status from preparing -> out_for_delivery
    upd_resp = client.patch(
        "/api/admin/orders/CRV-20261020-1001/status",
        headers=admin_headers,
        json={
            "status": "out_for_delivery",
            "note": "Dispatched with Rider Kamran on Cravora Bike #14",
            "assigned_rider_name": "Kamran Ali",
            "assigned_rider_phone": "+92 312 9001122",
        },
    )
    assert upd_resp.status_code == 200
    assert upd_resp.json()["status"] == "out_for_delivery"

    # 4. Verify customer sees the updated status
    cust_order = client.get("/api/orders/CRV-20261020-1001", headers=customer_headers)
    assert cust_order.status_code == 200
    assert cust_order.json()["status"] == "out_for_delivery"
    assert cust_order.json()["assigned_rider_name"] == "Kamran Ali"


def test_6_maps_delivery_zone_and_unsupported_address_rejection(client: TestClient):
    """Maps Journey:
    Search for an address -> validate supported pin -> verify unsupported address (Taxila) is rejected.
    """
    search_resp = client.get("/api/maps/geocode/search?q=F-7")
    assert search_resp.status_code == 200
    results = search_resp.json()
    assert len(results) >= 1

    # Unsupported coordinate in Taxila (33.7463, 72.8397) > 20km from Islamabad branches
    unsupported_cov = client.post(
        "/api/maps/check-coverage",
        json={"latitude": 33.7463, "longitude": 72.8397, "subtotal": 2000},
    ).json()
    assert unsupported_cov["deliverable"] is False
    assert unsupported_cov["nearest_pickup_branch"] is not None

    # Verify checkout rejects deliverable order at unsupported address
    prods = client.get("/api/menu/products").json()
    reject_order = client.post(
        "/api/orders",
        json={
            "customer_name": "Test User",
            "customer_phone": "+92 300 0000000",
            "fulfillment_type": "delivery",
            "delivery_address": {
                "house_number": "1",
                "street": "Museum Rd",
                "area": "Taxila",
                "city": "Taxila",
                "latitude": 33.7463,
                "longitude": 72.8397,
                "formatted_address": "Museum Rd, Taxila",
            },
            "items": [{"product_id": prods[0]["id"], "quantity": 1}],
            "payment_method": "cod",
        },
    )
    assert reject_order.status_code == 400
    assert "outside our configured delivery zone" in reject_order.json()["detail"]


def test_7_security_boundaries_and_webhook_verification(client: TestClient):
    """Security Journey:
    1. Customers cannot access other customers' orders without verification (403).
    2. Customers cannot impersonate administrators (403).
    3. Invalid payment callbacks are rejected (401), while validly signed callbacks succeed.
    """
    # 1. Unverified guest trying to look up Hamza's order by guessable order_reference alone
    unauth_lookup = client.get("/api/orders/CRV-20261020-1001")
    assert unauth_lookup.status_code == 403

    # 2. Regular customer trying to call admin endpoint
    customer_headers = get_auth_headers(client, "hamza@example.com", "Customer!2026")
    forbid_admin = client.get("/api/admin/overview", headers=customer_headers)
    assert forbid_admin.status_code == 403

    # 3. Payment webhook with invalid signature is rejected with 401
    bad_payload = json.dumps({
        "transaction_reference": "PAY-CRV-20261020-1001-COD",
        "status": "paid",
    }).encode("utf-8")
    bad_webhook = client.post(
        "/api/payments/webhook",
        content=bad_payload,
        headers={"X-Cravora-Signature": "invalid_forged_signature_12345"},
    )
    assert bad_webhook.status_code == 401

    # Validly signed HMAC webhook succeeds
    valid_sig = compute_webhook_signature(bad_payload)
    good_webhook = client.post(
        "/api/payments/webhook",
        content=bad_payload,
        headers={"X-Cravora-Signature": valid_sig},
    )
    assert good_webhook.status_code == 200
    assert good_webhook.json()["payment_status"] == "paid"
