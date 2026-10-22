import json
import re
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, SessionLocal, engine, get_db
from app.models import (
    AuditEvent,
    Branch,
    Category,
    Coupon,
    CustomerAddress,
    DeliveryZone,
    FavoriteProduct,
    LoyaltyTransaction,
    NewsletterSubscriber,
    NotificationRecord,
    Order,
    OrderItem,
    OrderStatusHistory,
    Payment,
    Product,
    ProductPriceHistory,
    RefundRecord,
    RiderLocation,
    SupportMessage,
    SupportTicket,
    User,
)
from app.schemas import (
    AdminBranchCreateUpdate,
    AdminCategoryCreateUpdate,
    AdminCouponCreateUpdate,
    AdminOrderStatusUpdate,
    AdminProductCreateUpdate,
    AIChatRequest,
    AIChatResponse,
    AuthTokenResponse,
    CartCalculationRequest,
    CartCalculationResponse,
    CheckoutCreateOrderRequest,
    CoverageCheckRequest,
    CustomerAddressCreate,
    CustomerAddressOut,
    NewsletterSubscribeRequest,
    PasswordResetConfirmRequest,
    PasswordResetRequest,
    ProfileUpdateRequest,
    RiderLocationUpdateRequest,
    SupportMessageCreateRequest,
    SupportTicketCreateRequest,
    UserLoginRequest,
    UserOut,
    UserRegisterRequest,
)
from app.security import (
    check_rate_limit,
    create_access_token,
    get_current_user,
    get_optional_user,
    get_rate_limit_events,
    hash_password,
    record_audit_event,
    require_admin,
    require_staff_or_admin,
    verify_password,
)
from app.seed import attach_pizza_customizations, seed_database
from app.services.ai_agent import AI_METRICS, process_ai_chat
from app.services.maps import (
    evaluate_delivery_coverage,
    reverse_geocode,
    search_addresses,
    serialize_branch,
)
from app.services.notifications import dispatch_notification
from app.services.payments import (
    get_payment_methods_status,
    initialize_order_payment,
    process_verified_payment_webhook,
)
from app.services.pricing import (
    calculate_cart_summary,
    serialize_product,
    validate_coupon_code,
)


# WebSocket connections per order_reference
_order_ws_connections: Dict[str, List[WebSocket]] = {}


async def broadcast_order_update(order_reference: str, payload: Dict[str, Any]) -> None:
    conns = _order_ws_connections.get(order_reference, [])
    dead = []
    for ws in conns:
        try:
            await ws.send_json(payload)
        except Exception:
            dead.append(ws)
    for ws in dead:
        conns.remove(ws)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description=(
        "Production-oriented Full-Stack API for CRAVORA — Pizza & More. "
        "Includes server-side customization pricing, delivery zone polygon/radius validation, "
        "transactional order creation, RBAC admin operations, and Cravora AI tool-calling concierge."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def slugify(text: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9\s-]", "", text).strip().lower()
    return re.sub(r"[\s-]+", "-", s)


def serialize_order(order: Order, include_verification_token: bool = False) -> Dict[str, Any]:
    try:
        addr = json.loads(order.delivery_address_snapshot or "{}")
    except Exception:
        addr = {"formatted_address": order.delivery_address_snapshot or ""}

    # Only expose latest rider location if order is actively out_for_delivery
    latest_rider_loc = None
    if order.status == "out_for_delivery" and order.rider_locations:
        active_loc = next((r for r in order.rider_locations if r.is_active), None)
        if active_loc:
            latest_rider_loc = {
                "rider_id": active_loc.rider_id,
                "rider_name": active_loc.rider_name,
                "latitude": active_loc.latitude,
                "longitude": active_loc.longitude,
                "heading": active_loc.heading,
                "speed_kmh": active_loc.speed_kmh,
                "recorded_at": active_loc.recorded_at.isoformat() if active_loc.recorded_at else None,
            }

    data = {
        "id": order.id,
        "order_reference": order.order_reference,
        "user_id": order.user_id,
        "customer_name": order.customer_name,
        "customer_phone": order.customer_phone,
        "customer_email": order.customer_email,
        "fulfillment_type": order.fulfillment_type,
        "branch_id": order.branch_id,
        "branch_name": order.branch.name if order.branch else "Cravora Branch",
        "branch_address": order.branch.address if order.branch else "",
        "branch_phone": order.branch.phone if order.branch else "",
        "delivery_address": addr,
        "delivery_lat": order.delivery_lat,
        "delivery_lng": order.delivery_lng,
        "delivery_distance_km": order.delivery_distance_km,
        "subtotal": order.subtotal,
        "discount_amount": order.discount_amount,
        "coupon_code": order.coupon_code,
        "delivery_fee": order.delivery_fee,
        "tax_amount": order.tax_amount,
        "total_amount": order.total_amount,
        "loyalty_points_earned": order.loyalty_points_earned,
        "loyalty_points_redeemed": order.loyalty_points_redeemed,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "status": order.status,
        "order_notes": order.order_notes,
        "cancellation_reason": order.cancellation_reason,
        "estimated_ready_at": order.estimated_ready_at.isoformat() if order.estimated_ready_at else None,
        "assigned_rider_name": order.assigned_rider_name,
        "assigned_rider_phone": order.assigned_rider_phone,
        "latest_rider_location": latest_rider_loc,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "items": [
            {
                "id": item.id,
                "product_id": item.product_id,
                "product_name": item.product_name_snapshot,
                "product_image": item.product_image_snapshot,
                "variant_name": item.variant_name_snapshot,
                "base_price": item.base_price_snapshot,
                "customizations": json.loads(item.customizations_snapshot or "[]"),
                "quantity": item.quantity,
                "unit_price": item.unit_price,
                "total_price": item.total_price,
                "special_instructions": item.special_instructions,
            }
            for item in order.items
        ],
        "status_history": [
            {
                "id": h.id,
                "status": h.status,
                "note": h.note,
                "created_at": h.created_at.isoformat() if h.created_at else None,
            }
            for h in order.status_history
        ],
        "payments": [
            {
                "transaction_reference": p.transaction_reference,
                "provider": p.provider,
                "amount": p.amount,
                "status": p.status,
                "signature_verified": p.signature_verified,
            }
            for p in order.payments
        ],
    }
    if include_verification_token:
        data["guest_verification_token"] = order.guest_verification_token
    return data


# =============================================================================
# 1. HEALTH & SYSTEM INFO
# =============================================================================

@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    cat_count = db.query(Category).count()
    prod_count = db.query(Product).count()
    branch_count = db.query(Branch).count()
    return {
        "status": "ok",
        "brand": "CRAVORA — Pizza & More",
        "tagline": "Big Flavour. Bold Cravings.",
        "version": settings.APP_VERSION,
        "database_connected": True,
        "counts": {
            "categories": cat_count,
            "products": prod_count,
            "branches": branch_count,
        },
        "sample_data_notice": (
            "Initial menu items, prices, branches, promotions, and testimonials are clearly labeled "
            "development sample data and can be updated anytime via the Admin Operations Dashboard."
        ),
    }


# =============================================================================
# 2. AUTHENTICATION, PROFILE, ADDRESSES, FAVORITES & LOYALTY
# =============================================================================

@app.post("/api/auth/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
def register_user(req: UserRegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    user = User(
        email=req.email.lower().strip(),
        phone=req.phone.strip(),
        full_name=req.full_name.strip(),
        password_hash=hash_password(req.password),
        role="customer",
        loyalty_points=100,  # Welcome loyalty bonus
    )
    db.add(user)
    db.flush()

    db.add(
        LoyaltyTransaction(
            user_id=user.id,
            points_delta=100,
            transaction_type="bonus",
            description="Welcome to Cravora Rewards! 100 bonus points credited.",
        )
    )
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.email, user.role)
    return AuthTokenResponse(access_token=token, user=UserOut.model_validate(user))


@app.post("/api/auth/login", response_model=AuthTokenResponse)
def login_user(req: UserLoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been deactivated.",
        )

    token = create_access_token(user.id, user.email, user.role)
    return AuthTokenResponse(access_token=token, user=UserOut.model_validate(user))


@app.post("/api/auth/password-reset/request")
def request_password_reset(req: PasswordResetRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if user:
        reset_token = f"rst_{secrets.token_urlsafe(16)}"
        user.reset_token = reset_token
        user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        db.commit()
        notif = dispatch_notification(
            db=db,
            channel="email",
            recipient=user.email,
            subject="Cravora Password Reset Token",
            body=f"Your password reset token is: {reset_token} (Valid for 30 minutes).",
            user_id=user.id,
        )
        return {
            "message": "Password reset instructions generated.",
            "delivery_status": notif.provider_status,
            "dev_reset_token": reset_token if settings.APP_ENV == "development" else None,
        }
    return {
        "message": "If an account matches that email, a password reset token has been generated.",
        "delivery_status": "logged_dev_mode",
    }


@app.post("/api/auth/password-reset/confirm")
def confirm_password_reset(req: PasswordResetConfirmRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower().strip()).first()
    if not user or not user.reset_token or user.reset_token != req.reset_token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token.",
        )
    user.password_hash = hash_password(req.new_password)
    user.reset_token = None
    user.reset_token_expires_at = None
    db.commit()
    return {"message": "Your password has been updated successfully. You may now sign in."}


@app.get("/api/auth/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return UserOut.model_validate(current_user)


@app.put("/api/auth/profile", response_model=UserOut)
def update_profile(
    req: ProfileUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.full_name is not None:
        current_user.full_name = req.full_name.strip()
    if req.phone is not None:
        current_user.phone = req.phone.strip()
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)


@app.get("/api/auth/addresses", response_model=List[CustomerAddressOut])
def list_addresses(current_user: User = Depends(get_current_user)):
    return [CustomerAddressOut.model_validate(a) for a in current_user.addresses]


@app.post("/api/auth/addresses", response_model=CustomerAddressOut, status_code=status.HTTP_201_CREATED)
def add_address(
    req: CustomerAddressCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if req.is_default:
        for addr in current_user.addresses:
            addr.is_default = False
    new_addr = CustomerAddress(
        user_id=current_user.id,
        **req.model_dump(),
    )
    db.add(new_addr)
    db.commit()
    db.refresh(new_addr)
    return CustomerAddressOut.model_validate(new_addr)


@app.delete("/api/auth/addresses/{address_id}")
def delete_address(
    address_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    addr = (
        db.query(CustomerAddress)
        .filter(CustomerAddress.id == address_id, CustomerAddress.user_id == current_user.id)
        .first()
    )
    if not addr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Address not found.")
    db.delete(addr)
    db.commit()
    return {"deleted": True, "id": address_id}


@app.get("/api/auth/favorites")
def list_favorites(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    favs = db.query(FavoriteProduct).filter(FavoriteProduct.user_id == current_user.id).all()
    return [serialize_product(f.product) for f in favs if f.product]


@app.post("/api/auth/favorites/{product_id}")
def toggle_favorite(
    product_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    existing = (
        db.query(FavoriteProduct)
        .filter(FavoriteProduct.user_id == current_user.id, FavoriteProduct.product_id == product_id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        return {"favorited": False, "product_id": product_id}
    fav = FavoriteProduct(user_id=current_user.id, product_id=product_id)
    db.add(fav)
    db.commit()
    return {"favorited": True, "product_id": product_id}


@app.get("/api/auth/loyalty")
def get_loyalty_history(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    txs = (
        db.query(LoyaltyTransaction)
        .filter(LoyaltyTransaction.user_id == current_user.id)
        .order_by(LoyaltyTransaction.created_at.desc())
        .all()
    )
    return {
        "loyalty_points": current_user.loyalty_points,
        "pkr_value": current_user.loyalty_points * settings.LOYALTY_PKR_PER_POINT,
        "earning_rule": f"Earn {settings.LOYALTY_POINTS_PER_100_PKR} points per Rs. 100 spent",
        "redemption_rule": f"1 Point = Rs. {settings.LOYALTY_PKR_PER_POINT} instant checkout discount",
        "transactions": [
            {
                "id": t.id,
                "points_delta": t.points_delta,
                "transaction_type": t.transaction_type,
                "description": t.description,
                "order_id": t.order_id,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
            for t in txs
        ],
    }


@app.get("/api/auth/notifications")
def list_user_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    records = (
        db.query(NotificationRecord)
        .filter(NotificationRecord.user_id == current_user.id)
        .order_by(NotificationRecord.created_at.desc())
        .limit(30)
        .all()
    )
    return [
        {
            "id": r.id,
            "channel": r.channel,
            "subject": r.subject,
            "body": r.body,
            "provider_status": r.provider_status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in records
    ]


# =============================================================================
# 3. MENU, CATEGORIES & PRODUCT CUSTOMIZATION DETAILS
# =============================================================================

@app.get("/api/menu/categories")
def list_categories(db: Session = Depends(get_db)):
    cats = (
        db.query(Category)
        .filter(Category.is_active == True)
        .order_by(Category.display_order.asc())
        .all()
    )
    return [
        {
            "id": c.id,
            "name": c.name,
            "slug": c.slug,
            "description": c.description,
            "image_url": c.image_url,
            "icon_name": c.icon_name,
            "display_order": c.display_order,
            "is_active": c.is_active,
            "product_count": len([p for p in c.products if p.is_available]),
        }
        for c in cats
    ]


@app.get("/api/menu/products")
def list_products(
    category_slug: Optional[str] = None,
    search: Optional[str] = None,
    min_price: Optional[int] = None,
    max_price: Optional[int] = None,
    bestseller_only: bool = False,
    featured_only: bool = False,
    vegetarian_only: bool = False,
    spicy_only: bool = False,
    sort_by: str = "popular",  # 'popular', 'price_asc', 'price_desc', 'newest'
    include_unavailable: bool = True,
    db: Session = Depends(get_db),
):
    q = db.query(Product)
    if not include_unavailable:
        q = q.filter(Product.is_available == True, Product.stock_qty > 0)
    if category_slug and category_slug != "all":
        cat = db.query(Category).filter(Category.slug == category_slug).first()
        if cat:
            q = q.filter(Product.category_id == cat.id)
        else:
            return []
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            (Product.name.ilike(term))
            | (Product.short_description.ilike(term))
            | (Product.full_description.ilike(term))
        )
    if min_price is not None:
        q = q.filter(Product.base_price >= min_price)
    if max_price is not None:
        q = q.filter(Product.base_price <= max_price)
    if bestseller_only:
        q = q.filter(Product.is_bestseller == True)
    if featured_only:
        q = q.filter(Product.is_featured == True)
    if vegetarian_only:
        q = q.filter(Product.is_vegetarian == True)
    if spicy_only:
        q = q.filter(Product.is_spicy == True)

    if sort_by == "price_asc":
        q = q.order_by(Product.base_price.asc())
    elif sort_by == "price_desc":
        q = q.order_by(Product.base_price.desc())
    elif sort_by == "newest":
        q = q.order_by(Product.created_at.desc())
    else:
        q = q.order_by(Product.popularity_score.desc(), Product.id.asc())

    products = q.all()
    return [serialize_product(p) for p in products]


@app.get("/api/menu/products/{slug_or_id}")
def get_product_detail(slug_or_id: str, db: Session = Depends(get_db)):
    product = None
    if slug_or_id.isdigit():
        product = db.query(Product).filter(Product.id == int(slug_or_id)).first()
    if not product:
        product = db.query(Product).filter(Product.slug == slug_or_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    related = (
        db.query(Product)
        .filter(
            Product.category_id == product.category_id,
            Product.id != product.id,
            Product.is_available == True,
        )
        .limit(4)
        .all()
    )
    sides = (
        db.query(Product)
        .join(Category)
        .filter(
            Category.slug.in_(["fries-and-sides", "dips-and-sauces", "beverages", "desserts"]),
            Product.id != product.id,
            Product.is_available == True,
        )
        .order_by(Product.popularity_score.desc())
        .limit(4)
        .all()
    )

    data = serialize_product(product)
    data["related_products"] = [serialize_product(r) for r in related]
    data["recommended_sides"] = [serialize_product(s) for s in sides]
    return data


# =============================================================================
# 4. SERVER-SIDE CART PRICING & PROMOTIONS
# =============================================================================

@app.post("/api/cart/calculate", response_model=CartCalculationResponse)
def calculate_cart(
    req: CartCalculationRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    return calculate_cart_summary(db, req, user=current_user)


@app.get("/api/promotions")
def list_promotions(db: Session = Depends(get_db)):
    coupons = db.query(Coupon).filter(Coupon.is_active == True).order_by(Coupon.id.asc()).all()
    deal_products = (
        db.query(Product)
        .join(Category)
        .filter(
            Category.slug.in_(["family-meals", "value-deals", "limited-time-promotions", "platters"]),
            Product.is_available == True,
        )
        .order_by(Product.popularity_score.desc())
        .all()
    )
    return {
        "coupons": [
            {
                "id": c.id,
                "code": c.code,
                "title": c.title,
                "description": c.description,
                "discount_type": c.discount_type,
                "discount_value": c.discount_value,
                "min_order_amount": c.min_order_amount,
                "max_discount_amount": c.max_discount_amount,
                "start_date": c.start_date.isoformat() if c.start_date else None,
                "end_date": c.end_date.isoformat() if c.end_date else None,
                "usage_limit": c.usage_limit,
                "used_count": c.used_count,
                "per_user_limit": c.per_user_limit,
                "fulfillment_restriction": c.fulfillment_restriction,
                "is_active": c.is_active,
                "is_flash_deal": c.is_flash_deal,
                "banner_image_url": c.banner_image_url,
                "is_sample_data": c.is_sample_data,
            }
            for c in coupons
        ],
        "bundles": [serialize_product(p) for p in deal_products],
    }


@app.post("/api/promotions/validate")
def validate_promotion_endpoint(
    code: str = Query(...),
    subtotal: int = Query(default=0),
    fulfillment_type: str = Query(default="delivery"),
    branch_id: Optional[int] = Query(default=None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    valid, discount, msg, coupon = validate_coupon_code(
        db=db,
        code=code,
        subtotal=subtotal,
        category_ids=[],
        fulfillment_type=fulfillment_type,
        branch_id=branch_id,
        user=current_user,
    )
    return {
        "valid": valid,
        "code": code.strip().upper(),
        "discount_amount": discount,
        "message": msg,
    }


# =============================================================================
# 5. INTERACTIVE MAPS, COVERAGE VALIDATION & BRANCH LOCATOR
# =============================================================================

@app.get("/api/branches")
def list_branches(
    city: Optional[str] = None,
    search: Optional[str] = None,
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Branch)
    if city and city.lower() != "all":
        q = q.filter(Branch.city.ilike(f"%{city}%"))
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(
            (Branch.name.ilike(term))
            | (Branch.area.ilike(term))
            | (Branch.city.ilike(term))
            | (Branch.address.ilike(term))
        )
    branches = q.all()
    result = [serialize_branch(b, lat, lng) for b in branches]
    if lat is not None and lng is not None:
        result.sort(key=lambda b: b["distance_km"] if b["distance_km"] is not None else 9999.0)
    return result


@app.post("/api/maps/check-coverage")
def check_delivery_coverage_endpoint(
    req: CoverageCheckRequest,
    db: Session = Depends(get_db),
):
    return evaluate_delivery_coverage(
        db=db,
        latitude=req.latitude,
        longitude=req.longitude,
        subtotal=req.subtotal,
        preferred_branch_id=req.preferred_branch_id,
    )


@app.get("/api/maps/geocode/search")
def geocode_search_endpoint(q: str = Query(default="")):
    return search_addresses(q)


@app.get("/api/maps/geocode/reverse")
def geocode_reverse_endpoint(lat: float = Query(...), lng: float = Query(...)):
    return reverse_geocode(lat, lng)


# =============================================================================
# 6. TRANSACTIONAL CHECKOUT, ORDERS & LIVE ORDER TRACKING
# =============================================================================

@app.get("/api/payments/methods")
def list_payment_methods():
    return get_payment_methods_status()


@app.post("/api/orders", status_code=status.HTTP_201_CREATED)
def create_order_transactionally(
    req: CheckoutCreateOrderRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    # 1. Validate fulfillment method & delivery coverage
    selected_branch: Optional[Branch] = None
    delivery_lat = None
    delivery_lng = None
    delivery_dist = None
    delivery_addr_snapshot = None

    if req.fulfillment_type == "delivery":
        if not req.delivery_address:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Delivery address and coordinates are required for delivery orders.",
            )
        delivery_lat = req.delivery_address.latitude
        delivery_lng = req.delivery_address.longitude

        # Validate coverage first
        cov = evaluate_delivery_coverage(
            db=db,
            latitude=delivery_lat,
            longitude=delivery_lng,
            subtotal=0,
            preferred_branch_id=req.branch_id,
        )
        if not cov["deliverable"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=cov["message"],
            )
        selected_branch = (
            db.query(Branch).filter(Branch.id == cov["matched_branch"]["id"]).first()
        )
        delivery_dist = cov["distance_km"]
        delivery_addr_snapshot = json.dumps(req.delivery_address.model_dump())
    else:
        # Pickup order
        if req.branch_id:
            selected_branch = (
                db.query(Branch)
                .filter(Branch.id == req.branch_id, Branch.is_open == True, Branch.supports_pickup == True)
                .first()
            )
        if not selected_branch:
            selected_branch = (
                db.query(Branch)
                .filter(Branch.is_open == True, Branch.supports_pickup == True)
                .first()
            )
        if not selected_branch:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected branch is not available for pickup.",
            )

    # 2. Server-side cart calculation & validation
    calc_req = CartCalculationRequest(
        items=req.items,
        fulfillment_type=req.fulfillment_type,
        branch_id=selected_branch.id,
        delivery_lat=delivery_lat,
        delivery_lng=delivery_lng,
        coupon_code=req.coupon_code,
        redeem_loyalty_points=req.redeem_loyalty_points,
    )
    summary = calculate_cart_summary(db, calc_req, user=current_user)

    if req.fulfillment_type == "delivery" and not summary.meets_min_order:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order subtotal (Rs. {summary.subtotal:,}) is below the minimum delivery order amount of Rs. {summary.min_order_amount:,} for this delivery zone.",
        )

    # 3. Begin transactional order persistence
    order_ref = f"CRV-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{secrets.randbelow(8999) + 1000}"
    guest_token = f"gtok_{secrets.token_urlsafe(16)}"
    now = datetime.now(timezone.utc)
    est_mins = (
        selected_branch.delivery_time_mins
        if req.fulfillment_type == "delivery"
        else selected_branch.prep_time_mins
    )

    order = Order(
        order_reference=order_ref,
        user_id=current_user.id if current_user else None,
        guest_verification_token=guest_token,
        customer_name=req.customer_name.strip(),
        customer_phone=req.customer_phone.strip(),
        customer_email=req.customer_email.lower().strip() if req.customer_email else (current_user.email if current_user else None),
        fulfillment_type=req.fulfillment_type,
        branch_id=selected_branch.id,
        delivery_address_snapshot=delivery_addr_snapshot,
        delivery_lat=delivery_lat,
        delivery_lng=delivery_lng,
        delivery_distance_km=delivery_dist,
        subtotal=summary.subtotal,
        discount_amount=summary.discount_amount,
        coupon_code=summary.coupon_code,
        delivery_fee=summary.delivery_fee,
        tax_amount=summary.tax_amount,
        total_amount=summary.total_amount,
        loyalty_points_earned=summary.estimated_loyalty_points_earned if current_user else 0,
        loyalty_points_redeemed=summary.loyalty_points_redeemed if current_user else 0,
        payment_method=req.payment_method,
        payment_status="pending",
        status="order_placed",
        order_notes=req.order_notes,
        estimated_ready_at=now + timedelta(minutes=est_mins),
    )
    db.add(order)
    db.flush()

    # 4. Create OrderItem snapshots & decrement stock
    for v_item in summary.items:
        prod_row = db.query(Product).filter(Product.id == v_item.product_id).first()
        if prod_row:
            prod_row.stock_qty = max(0, prod_row.stock_qty - v_item.quantity)

        db.add(
            OrderItem(
                order_id=order.id,
                product_id=v_item.product_id,
                product_name_snapshot=v_item.product_name,
                product_image_snapshot=v_item.product_image,
                variant_name_snapshot=v_item.variant_name,
                base_price_snapshot=v_item.base_unit_price,
                customizations_snapshot=json.dumps([o.model_dump() for o in v_item.options]),
                quantity=v_item.quantity,
                unit_price=v_item.unit_price,
                total_price=v_item.line_total,
                special_instructions=v_item.special_instructions,
            )
        )

    # 5. Increment coupon used_count if applied
    if summary.coupon_valid and summary.coupon_code:
        coupon_row = db.query(Coupon).filter(Coupon.code == summary.coupon_code).first()
        if coupon_row:
            coupon_row.used_count += 1

    # 6. Process loyalty points for authenticated user
    if current_user:
        if summary.loyalty_points_redeemed > 0:
            current_user.loyalty_points = max(0, current_user.loyalty_points - summary.loyalty_points_redeemed)
            db.add(
                LoyaltyTransaction(
                    user_id=current_user.id,
                    order_id=order.id,
                    points_delta=-summary.loyalty_points_redeemed,
                    transaction_type="redeemed",
                    description=f"Redeemed {summary.loyalty_points_redeemed} pts on Order {order.order_reference}",
                )
            )
        if summary.estimated_loyalty_points_earned > 0:
            current_user.loyalty_points += summary.estimated_loyalty_points_earned
            db.add(
                LoyaltyTransaction(
                    user_id=current_user.id,
                    order_id=order.id,
                    points_delta=summary.estimated_loyalty_points_earned,
                    transaction_type="earned",
                    description=f"Earned {summary.estimated_loyalty_points_earned} pts from Order {order.order_reference}",
                )
            )

    # 7. Record status history & payment session
    db.add(
        OrderStatusHistory(
            order_id=order.id,
            status="order_placed",
            note=f"Order placed via {req.fulfillment_type.title()} at {selected_branch.name}.",
            updated_by_user_id=current_user.id if current_user else None,
        )
    )
    initialize_order_payment(db, order)

    db.commit()
    db.refresh(order)

    # 8. Record order confirmation notification honestly
    dispatch_notification(
        db=db,
        channel="sms",
        recipient=order.customer_phone,
        subject=f"Cravora Order {order.order_reference} Placed",
        body=f"Thank you {order.customer_name}! Your Cravora order {order.order_reference} (Rs. {order.total_amount:,}) has been received by {selected_branch.name}.",
        user_id=current_user.id if current_user else None,
        order_id=order.id,
    )

    return serialize_order(order, include_verification_token=True)


@app.get("/api/orders/my")
def list_my_orders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(Order)
        .filter(Order.user_id == current_user.id)
        .order_by(Order.created_at.desc())
        .all()
    )
    return [serialize_order(o) for o in orders]


@app.get("/api/orders/{order_reference}")
def get_order_by_reference(
    order_reference: str,
    phone: Optional[str] = Query(default=None),
    token: Optional[str] = Query(default=None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    """Secure order lookup: Requires authenticated owner/admin OR matching guest phone/token.
    Prevents exposing another customer's order based on a guessable order reference alone.
    """
    clean_ref = order_reference.strip().upper()
    order = db.query(Order).filter(Order.order_reference == clean_ref).first()
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Order '{clean_ref}' not found.",
        )

    is_owner = current_user is not None and order.user_id == current_user.id
    is_staff_or_admin = current_user is not None and current_user.role in ("admin", "staff")
    token_matches = bool(token and token.strip() == order.guest_verification_token)
    phone_matches = False
    if phone:
        norm_in = re.sub(r"\D", "", phone)[-9:]
        norm_ord = re.sub(r"\D", "", order.customer_phone)[-9:]
        phone_matches = bool(norm_in and len(norm_in) >= 7 and norm_in == norm_ord)

    if not (is_owner or is_staff_or_admin or token_matches or phone_matches):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Verification required to view this order. Please sign in to the ordering account "
                "or provide the registered customer phone number / verification token."
            ),
        )

    return serialize_order(order)


@app.post("/api/orders/{order_reference}/cancel")
def request_order_cancellation(
    order_reference: str,
    reason: str = Query(default="Customer requested cancellation"),
    phone: Optional[str] = Query(default=None),
    token: Optional[str] = Query(default=None),
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    clean_ref = order_reference.strip().upper()
    order = db.query(Order).filter(Order.order_reference == clean_ref).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    is_owner = current_user is not None and order.user_id == current_user.id
    is_admin = current_user is not None and current_user.role in ("admin", "staff")
    token_matches = bool(token and token.strip() == order.guest_verification_token)
    phone_matches = False
    if phone:
        norm_in = re.sub(r"\D", "", phone)[-9:]
        norm_ord = re.sub(r"\D", "", order.customer_phone)[-9:]
        phone_matches = bool(norm_in and len(norm_in) >= 7 and norm_in == norm_ord)

    if not (is_owner or is_admin or token_matches or phone_matches):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to cancel this order.",
        )

    if order.status not in ("order_placed", "order_confirmed") and not is_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order cannot be self-cancelled once it is in '{order.status}' stage. Please contact Customer Support.",
        )

    order.status = "cancelled"
    order.cancellation_reason = reason
    db.add(
        OrderStatusHistory(
            order_id=order.id,
            status="cancelled",
            note=f"Order cancelled: {reason}",
            updated_by_user_id=current_user.id if current_user else None,
        )
    )
    db.commit()
    db.refresh(order)
    return serialize_order(order)


@app.post("/api/orders/{order_reference}/rider-location")
def update_rider_location(
    order_reference: str,
    req: RiderLocationUpdateRequest,
    staff_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.order_reference == order_reference.strip().upper()).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")
    if order.status in ("delivered", "collected", "cancelled"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rider GPS tracking is disabled for completed or cancelled orders.",
        )

    order.assigned_rider_name = req.rider_name
    loc = RiderLocation(
        order_id=order.id,
        rider_id=req.rider_id,
        rider_name=req.rider_name,
        latitude=req.latitude,
        longitude=req.longitude,
        heading=req.heading,
        speed_kmh=req.speed_kmh,
        is_active=True,
    )
    db.add(loc)
    db.commit()
    db.refresh(order)
    return serialize_order(order)


@app.websocket("/ws/orders/{order_reference}")
async def order_tracking_websocket(websocket: WebSocket, order_reference: str):
    await websocket.accept()
    clean_ref = order_reference.strip().upper()
    _order_ws_connections.setdefault(clean_ref, []).append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        if clean_ref in _order_ws_connections and websocket in _order_ws_connections[clean_ref]:
            _order_ws_connections[clean_ref].remove(websocket)


# =============================================================================
# 7. PAYMENT GATEWAY WEBHOOK
# =============================================================================

@app.post("/api/payments/webhook")
async def payment_webhook_endpoint(
    request: Request,
    x_cravora_signature: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    body_bytes = await request.body()
    return process_verified_payment_webhook(
        db=db,
        payload_bytes=body_bytes,
        signature_header=x_cravora_signature or "",
    )


# =============================================================================
# 8. HUMAN SUPPORT TICKETS & NEWSLETTER
# =============================================================================

def serialize_ticket(ticket: SupportTicket) -> Dict[str, Any]:
    return {
        "id": ticket.id,
        "ticket_reference": ticket.ticket_reference,
        "user_id": ticket.user_id,
        "order_id": ticket.order_id,
        "customer_name": ticket.customer_name,
        "customer_email": ticket.customer_email,
        "customer_phone": ticket.customer_phone,
        "category": ticket.category,
        "priority": ticket.priority,
        "subject": ticket.subject,
        "status": ticket.status,
        "escalated_from_ai": ticket.escalated_from_ai,
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
        "messages": [
            {
                "id": m.id,
                "sender_role": m.sender_role,
                "sender_name": m.sender_name,
                "message": m.message,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in ticket.messages
        ],
    }


@app.post("/api/support/tickets", status_code=status.HTTP_201_CREATED)
def create_support_ticket_endpoint(
    req: SupportTicketCreateRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    order_id = None
    if req.order_reference:
        ord_obj = db.query(Order).filter(Order.order_reference == req.order_reference.strip().upper()).first()
        if ord_obj:
            order_id = ord_obj.id

    ticket_ref = f"TKT-{secrets.randbelow(89999) + 10000}"
    ticket = SupportTicket(
        ticket_reference=ticket_ref,
        user_id=current_user.id if current_user else None,
        order_id=order_id,
        customer_name=req.customer_name.strip(),
        customer_email=req.customer_email,
        customer_phone=req.customer_phone.strip(),
        category=req.category,
        priority=req.priority,
        subject=req.subject.strip(),
        status="open",
        escalated_from_ai=req.escalated_from_ai,
    )
    db.add(ticket)
    db.flush()

    db.add(
        SupportMessage(
            ticket_id=ticket.id,
            sender_role="customer",
            sender_name=req.customer_name.strip(),
            message=req.message.strip(),
        )
    )
    db.commit()
    db.refresh(ticket)

    dispatch_notification(
        db=db,
        channel="email",
        recipient=req.customer_email or req.customer_phone,
        subject=f"Cravora Support Ticket {ticket.ticket_reference} Received",
        body=f"We have logged your support request '{ticket.subject}' under reference {ticket.ticket_reference}.",
        user_id=current_user.id if current_user else None,
        ticket_id=ticket.id,
    )

    return serialize_ticket(ticket)


@app.get("/api/support/tickets/my")
def list_my_support_tickets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tickets = (
        db.query(SupportTicket)
        .filter(SupportTicket.user_id == current_user.id)
        .order_by(SupportTicket.created_at.desc())
        .all()
    )
    return [serialize_ticket(t) for t in tickets]


@app.get("/api/support/tickets/{ticket_reference}")
def get_support_ticket_detail(
    ticket_reference: str,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    ticket = (
        db.query(SupportTicket)
        .filter(SupportTicket.ticket_reference == ticket_reference.strip().upper())
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support ticket not found.")
    return serialize_ticket(ticket)


@app.post("/api/support/tickets/{ticket_reference}/messages")
def add_customer_support_message(
    ticket_reference: str,
    req: SupportMessageCreateRequest,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    ticket = (
        db.query(SupportTicket)
        .filter(SupportTicket.ticket_reference == ticket_reference.strip().upper())
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support ticket not found.")

    sender_name = current_user.full_name if current_user else ticket.customer_name
    db.add(
        SupportMessage(
            ticket_id=ticket.id,
            sender_role="customer",
            sender_name=sender_name,
            message=req.message.strip(),
        )
    )
    db.commit()
    db.refresh(ticket)
    return serialize_ticket(ticket)


@app.post("/api/newsletter/subscribe")
def subscribe_newsletter(req: NewsletterSubscribeRequest, db: Session = Depends(get_db)):
    if not req.consent_given:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit marketing consent is required to subscribe to the Cravora newsletter.",
        )
    clean_email = req.email.lower().strip()
    existing = db.query(NewsletterSubscriber).filter(NewsletterSubscriber.email == clean_email).first()
    if existing:
        existing.is_active = True
        db.commit()
        return {"subscribed": True, "email": clean_email, "message": "You are already subscribed to Cravora Craving Alerts!"}

    sub = NewsletterSubscriber(email=clean_email, consent_given=True, is_active=True)
    db.add(sub)
    db.commit()
    return {
        "subscribed": True,
        "email": clean_email,
        "message": "Welcome to the Cravora Inner Circle! Exclusive pizza drops & secret coupon codes coming your way.",
    }


# =============================================================================
# 9. CRAVORA AI — YOUR PERSONAL FOOD ASSISTANT
# =============================================================================

@app.post("/api/ai/chat", response_model=AIChatResponse)
def ai_chat_endpoint(
    req: AIChatRequest,
    request: Request,
    current_user: Optional[User] = Depends(get_optional_user),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "local"
    check_rate_limit(f"ai_chat:{client_ip}", max_requests=25, window_seconds=60)
    return process_ai_chat(db=db, req=req, current_user=current_user)


@app.get("/api/ai/status")
def ai_status_endpoint():
    return {
        "assistant_name": "Cravora AI — Your Personal Food Assistant",
        "live_llm_configured": settings.ai_live_key_configured,
        "configured_provider": settings.LLM_PROVIDER,
        "configured_model": settings.LLM_MODEL,
        "mode": "live_llm" if settings.ai_live_key_configured else "local_tool_concierge",
        "available_tools": [
            "search_products",
            "get_product_details",
            "get_current_offers",
            "check_availability",
            "calculate_cart_total",
            "validate_coupon",
            "check_delivery_coverage",
            "get_delivery_fee",
            "find_nearby_branches",
            "get_verified_order_status",
            "prepare_cart",
            "create_support_ticket",
        ],
    }


# =============================================================================
# 10. ADMIN & OPERATIONS DASHBOARD (Backend-Enforced RBAC)
# =============================================================================

@app.get("/api/admin/overview")
def admin_dashboard_overview(
    admin_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db),
):
    orders = db.query(Order).all()
    non_cancelled = [o for o in orders if o.status != "cancelled"]
    total_orders = len(orders)
    total_revenue = sum(o.total_amount for o in non_cancelled)
    avg_order_value = int(round(total_revenue / len(non_cancelled))) if non_cancelled else 0

    status_dist: Dict[str, int] = {}
    for o in orders:
        status_dist[o.status] = status_dist.get(o.status, 0) + 1

    popular_products = (
        db.query(Product)
        .order_by(Product.popularity_score.desc())
        .limit(6)
        .all()
    )
    coupons = db.query(Coupon).all()
    audit_logs = db.query(AuditEvent).order_by(AuditEvent.created_at.desc()).limit(15).all()

    return {
        "total_orders": total_orders,
        "total_revenue_pkr": total_revenue,
        "average_order_value_pkr": avg_order_value,
        "active_products_count": db.query(Product).filter(Product.is_available == True).count(),
        "open_support_tickets": db.query(SupportTicket).filter(SupportTicket.status == "open").count(),
        "status_distribution": status_dist,
        "popular_products": [serialize_product(p) for p in popular_products],
        "promotion_performance": [
            {
                "code": c.code,
                "title": c.title,
                "used_count": c.used_count,
                "usage_limit": c.usage_limit,
                "is_active": c.is_active,
            }
            for c in coupons
        ],
        "recent_audit_events": [
            {
                "id": a.id,
                "actor_role": a.actor_role,
                "action": a.action,
                "entity_type": a.entity_type,
                "entity_id": a.entity_id,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in audit_logs
        ],
    }


@app.post("/api/admin/products", status_code=status.HTTP_201_CREATED)
def admin_create_product(
    req: AdminProductCreateUpdate,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    slug = req.slug.strip() if req.slug else slugify(req.name)
    if db.query(Product).filter(Product.slug == slug).first():
        slug = f"{slug}-{secrets.randbelow(999)}"

    product = Product(
        category_id=req.category_id,
        name=req.name.strip(),
        slug=slug,
        short_description=req.short_description.strip(),
        full_description=req.full_description,
        image_url=req.image_url.strip(),
        base_price=req.base_price,
        compare_at_price=req.compare_at_price,
        is_available=req.is_available,
        is_bestseller=req.is_bestseller,
        is_featured=req.is_featured,
        is_new=req.is_new,
        is_vegetarian=req.is_vegetarian,
        is_spicy=req.is_spicy,
        calories=req.calories,
        prep_time_mins=req.prep_time_mins,
        stock_qty=req.stock_qty,
        dietary_tags=json.dumps(req.dietary_tags),
        allergens=json.dumps(req.allergens),
        is_sample_data=False,
    )
    db.add(product)
    db.flush()

    cat = db.query(Category).filter(Category.id == req.category_id).first()
    if cat and "pizza" in cat.slug:
        attach_pizza_customizations(db, product, product.base_price)

    db.commit()
    db.refresh(product)

    record_audit_event(
        db=db,
        actor_user_id=admin_user.id,
        actor_role=admin_user.role,
        action="create_product",
        entity_type="product",
        entity_id=str(product.id),
        details={"name": product.name, "base_price": product.base_price},
    )
    return serialize_product(product)


@app.put("/api/admin/products/{product_id}")
def admin_update_product(
    product_id: int,
    req: AdminProductCreateUpdate,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")

    if product.base_price != req.base_price:
        db.add(
            ProductPriceHistory(
                product_id=product.id,
                old_price=product.base_price,
                new_price=req.base_price,
                changed_by_user_id=admin_user.id,
                reason="Updated via Admin Dashboard",
            )
        )

    product.category_id = req.category_id
    product.name = req.name.strip()
    product.short_description = req.short_description.strip()
    product.full_description = req.full_description
    product.image_url = req.image_url.strip()
    product.base_price = req.base_price
    product.compare_at_price = req.compare_at_price
    product.is_available = req.is_available
    product.is_bestseller = req.is_bestseller
    product.is_featured = req.is_featured
    product.is_new = req.is_new
    product.is_vegetarian = req.is_vegetarian
    product.is_spicy = req.is_spicy
    product.calories = req.calories
    product.prep_time_mins = req.prep_time_mins
    product.stock_qty = req.stock_qty
    product.dietary_tags = json.dumps(req.dietary_tags)
    product.allergens = json.dumps(req.allergens)

    db.commit()
    db.refresh(product)

    record_audit_event(
        db=db,
        actor_user_id=admin_user.id,
        actor_role=admin_user.role,
        action="update_product",
        entity_type="product",
        entity_id=str(product.id),
        details={"name": product.name, "base_price": product.base_price},
    )
    return serialize_product(product)


@app.delete("/api/admin/products/{product_id}")
def admin_delete_product(
    product_id: int,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Product not found.")
    db.delete(product)
    db.commit()
    record_audit_event(
        db=db,
        actor_user_id=admin_user.id,
        actor_role=admin_user.role,
        action="delete_product",
        entity_type="product",
        entity_id=str(product_id),
    )
    return {"deleted": True, "id": product_id}


@app.post("/api/admin/categories", status_code=status.HTTP_201_CREATED)
def admin_create_category(
    req: AdminCategoryCreateUpdate,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    slug = req.slug.strip() if req.slug else slugify(req.name)
    cat = Category(
        name=req.name.strip(),
        slug=slug,
        description=req.description,
        image_url=req.image_url,
        icon_name=req.icon_name,
        display_order=req.display_order,
        is_active=req.is_active,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {
        "id": cat.id,
        "name": cat.name,
        "slug": cat.slug,
        "description": cat.description,
        "image_url": cat.image_url,
        "display_order": cat.display_order,
        "is_active": cat.is_active,
    }


@app.get("/api/admin/orders")
def admin_list_orders(
    status_filter: Optional[str] = Query(default=None),
    branch_id: Optional[int] = Query(default=None),
    staff_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Order)
    if status_filter and status_filter != "all":
        q = q.filter(Order.status == status_filter)
    if branch_id:
        q = q.filter(Order.branch_id == branch_id)
    orders = q.order_by(Order.created_at.desc()).all()
    return [serialize_order(o) for o in orders]


@app.patch("/api/admin/orders/{order_reference}/status")
async def admin_update_order_status(
    order_reference: str,
    req: AdminOrderStatusUpdate,
    staff_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.order_reference == order_reference.strip().upper()).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    order.status = req.status
    if req.assigned_rider_name:
        order.assigned_rider_name = req.assigned_rider_name
    if req.assigned_rider_phone:
        order.assigned_rider_phone = req.assigned_rider_phone
    if req.status in ("delivered", "collected") and order.payment_method == "cod":
        order.payment_status = "paid"
        # Stop exposing rider GPS after delivery completion
        for rloc in order.rider_locations:
            rloc.is_active = False

    note = req.note or f"Status updated to '{req.status.replace('_', ' ').title()}' by {staff_user.full_name}."
    db.add(
        OrderStatusHistory(
            order_id=order.id,
            status=req.status,
            note=note,
            updated_by_user_id=staff_user.id,
        )
    )
    db.commit()
    db.refresh(order)

    record_audit_event(
        db=db,
        actor_user_id=staff_user.id,
        actor_role=staff_user.role,
        action="update_order_status",
        entity_type="order",
        entity_id=order.order_reference,
        details={"new_status": req.status, "note": note},
    )

    serialized = serialize_order(order)
    await broadcast_order_update(order.order_reference, serialized)
    return serialized


@app.post("/api/admin/orders/{order_reference}/refund")
def admin_record_refund(
    order_reference: str,
    amount: int = Query(..., ge=1),
    reason: str = Query(default="Authorized customer refund"),
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    order = db.query(Order).filter(Order.order_reference == order_reference.strip().upper()).first()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found.")

    refund = RefundRecord(
        order_id=order.id,
        payment_id=order.payments[0].id if order.payments else None,
        amount=min(amount, order.total_amount),
        reason=reason,
        status="processed",
        processed_by_user_id=admin_user.id,
    )
    order.payment_status = "refunded"
    db.add(refund)
    db.commit()
    return {"order_reference": order.order_reference, "refund_status": "processed", "amount": refund.amount}


@app.post("/api/admin/coupons", status_code=status.HTTP_201_CREATED)
def admin_create_coupon(
    req: AdminCouponCreateUpdate,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    clean_code = req.code.strip().upper()
    existing = db.query(Coupon).filter(Coupon.code == clean_code).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Coupon code already exists.")

    coupon = Coupon(
        code=clean_code,
        title=req.title.strip(),
        description=req.description.strip(),
        discount_type=req.discount_type,
        discount_value=req.discount_value,
        min_order_amount=req.min_order_amount,
        max_discount_amount=req.max_discount_amount,
        start_date=datetime.now(timezone.utc),
        end_date=req.end_date,
        usage_limit=req.usage_limit,
        per_user_limit=req.per_user_limit,
        fulfillment_restriction=req.fulfillment_restriction,
        is_active=req.is_active,
        is_flash_deal=req.is_flash_deal,
        is_sample_data=False,
    )
    db.add(coupon)
    db.commit()
    db.refresh(coupon)

    record_audit_event(
        db=db,
        actor_user_id=admin_user.id,
        actor_role=admin_user.role,
        action="create_coupon",
        entity_type="coupon",
        entity_id=coupon.code,
    )
    return {
        "id": coupon.id,
        "code": coupon.code,
        "title": coupon.title,
        "discount_type": coupon.discount_type,
        "discount_value": coupon.discount_value,
        "min_order_amount": coupon.min_order_amount,
        "is_active": coupon.is_active,
    }


@app.patch("/api/admin/coupons/{coupon_id}/toggle")
def admin_toggle_coupon(
    coupon_id: int,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    coupon = db.query(Coupon).filter(Coupon.id == coupon_id).first()
    if not coupon:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Coupon not found.")
    coupon.is_active = not coupon.is_active
    db.commit()
    return {"id": coupon.id, "code": coupon.code, "is_active": coupon.is_active}


@app.post("/api/admin/branches", status_code=status.HTTP_201_CREATED)
def admin_create_branch(
    req: AdminBranchCreateUpdate,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    branch = Branch(
        code=req.code.strip().upper(),
        name=req.name.strip(),
        city=req.city.strip(),
        area=req.area.strip(),
        address=req.address.strip(),
        phone=req.phone.strip(),
        email=req.email,
        latitude=req.latitude,
        longitude=req.longitude,
        opening_time=req.opening_time,
        closing_time=req.closing_time,
        is_open=req.is_open,
        supports_delivery=req.supports_delivery,
        supports_pickup=req.supports_pickup,
        supports_dine_in=req.supports_dine_in,
        prep_time_mins=req.prep_time_mins,
        delivery_time_mins=req.delivery_time_mins,
        is_sample_data=False,
    )
    db.add(branch)
    db.flush()

    zone = DeliveryZone(
        branch_id=branch.id,
        name=f"{branch.area} Standard Delivery Zone",
        zone_type="radius",
        radius_km=req.radius_km,
        polygon_coords="[]",
        base_delivery_fee=req.base_delivery_fee,
        per_km_fee=req.per_km_fee,
        min_order_amount=req.min_order_amount,
        free_delivery_threshold=3000,
        estimated_mins=req.delivery_time_mins,
        is_active=True,
    )
    db.add(zone)
    db.commit()
    db.refresh(branch)
    return serialize_branch(branch)


@app.get("/api/admin/support/tickets")
def admin_list_support_tickets(
    staff_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db),
):
    tickets = db.query(SupportTicket).order_by(SupportTicket.created_at.desc()).all()
    return [serialize_ticket(t) for t in tickets]


@app.post("/api/admin/support/tickets/{ticket_reference}/reply")
def admin_reply_support_ticket(
    ticket_reference: str,
    req: SupportMessageCreateRequest,
    staff_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db),
):
    ticket = (
        db.query(SupportTicket)
        .filter(SupportTicket.ticket_reference == ticket_reference.strip().upper())
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support ticket not found.")

    db.add(
        SupportMessage(
            ticket_id=ticket.id,
            sender_role="admin",
            sender_name=f"{staff_user.full_name} (Cravora Support)",
            message=req.message.strip(),
        )
    )
    if ticket.status == "open":
        ticket.status = "in_progress"
    db.commit()
    db.refresh(ticket)
    return serialize_ticket(ticket)


@app.patch("/api/admin/support/tickets/{ticket_reference}/status")
def admin_update_support_ticket_status(
    ticket_reference: str,
    status_val: str = Query(..., alias="status"),
    staff_user: User = Depends(require_staff_or_admin),
    db: Session = Depends(get_db),
):
    ticket = (
        db.query(SupportTicket)
        .filter(SupportTicket.ticket_reference == ticket_reference.strip().upper())
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Support ticket not found.")
    ticket.status = status_val
    db.commit()
    db.refresh(ticket)
    return serialize_ticket(ticket)


@app.get("/api/admin/ai-settings")
def admin_get_ai_settings(admin_user: User = Depends(require_admin)):
    return {
        "provider": settings.LLM_PROVIDER,
        "model": settings.LLM_MODEL,
        "live_api_key_configured": settings.ai_live_key_configured,
        "timeout_seconds": settings.AI_TIMEOUT_SECONDS,
        "max_retries": settings.AI_MAX_RETRIES,
        "support_escalation_phone": settings.SUPPORT_PHONE,
        "support_escalation_email": settings.SUPPORT_EMAIL,
        "support_escalation_whatsapp": settings.SUPPORT_WHATSAPP,
        "metrics": AI_METRICS,
        "rate_limit_events": get_rate_limit_events(),
    }
