from datetime import datetime, timezone
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow():
    return datetime.now(timezone.utc)


class RolePermission(Base):
    __tablename__ = "roles_permissions"

    id = Column(Integer, primary_key=True, index=True)
    role_name = Column(String(50), unique=True, nullable=False)
    description = Column(String(255), nullable=False)
    permissions_json = Column(Text, nullable=False, default="[]")
    created_at = Column(DateTime(timezone=True), default=utcnow)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    phone = Column(String(30), index=True, nullable=False)
    full_name = Column(String(150), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(30), index=True, nullable=False, default="customer")
    is_active = Column(Boolean, nullable=False, default=True)
    loyalty_points = Column(Integer, nullable=False, default=0)
    reset_token = Column(String(255), nullable=True)
    reset_token_expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    addresses = relationship("CustomerAddress", back_populates="user", cascade="all, delete-orphan")
    orders = relationship("Order", back_populates="user")
    loyalty_transactions = relationship("LoyaltyTransaction", back_populates="user", cascade="all, delete-orphan")
    favorites = relationship("FavoriteProduct", back_populates="user", cascade="all, delete-orphan")


class CustomerAddress(Base):
    __tablename__ = "customer_addresses"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    label = Column(String(60), nullable=False, default="Home")
    recipient_name = Column(String(150), nullable=True)
    phone = Column(String(30), nullable=True)
    house_number = Column(String(100), nullable=False)
    street = Column(String(150), nullable=False)
    area = Column(String(150), nullable=False)
    city = Column(String(100), nullable=False, default="Islamabad")
    landmark = Column(String(255), nullable=True)
    delivery_instructions = Column(Text, nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    formatted_address = Column(Text, nullable=False)
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="addresses")


class Branch(Base):
    __tablename__ = "branches"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(40), unique=True, nullable=False)
    name = Column(String(150), nullable=False)
    city = Column(String(100), index=True, nullable=False)
    area = Column(String(150), nullable=False)
    address = Column(Text, nullable=False)
    phone = Column(String(40), nullable=False)
    email = Column(String(150), nullable=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    opening_time = Column(String(20), nullable=False, default="11:00")
    closing_time = Column(String(20), nullable=False, default="02:00")
    is_open = Column(Boolean, nullable=False, default=True)
    supports_delivery = Column(Boolean, nullable=False, default=True)
    supports_pickup = Column(Boolean, nullable=False, default=True)
    supports_dine_in = Column(Boolean, nullable=False, default=True)
    prep_time_mins = Column(Integer, nullable=False, default=20)
    delivery_time_mins = Column(Integer, nullable=False, default=35)
    is_sample_data = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    delivery_zones = relationship("DeliveryZone", back_populates="branch", cascade="all, delete-orphan")


class DeliveryZone(Base):
    __tablename__ = "delivery_zones"

    id = Column(Integer, primary_key=True, index=True)
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    zone_type = Column(String(30), nullable=False, default="radius")  # 'radius' or 'polygon'
    radius_km = Column(Float, nullable=False, default=6.0)
    polygon_coords = Column(Text, nullable=False, default="[]")  # JSON list of [lat, lng]
    base_delivery_fee = Column(Integer, nullable=False, default=150)
    per_km_fee = Column(Integer, nullable=False, default=20)
    min_order_amount = Column(Integer, nullable=False, default=600)
    free_delivery_threshold = Column(Integer, nullable=True, default=3000)
    estimated_mins = Column(Integer, nullable=False, default=35)
    is_active = Column(Boolean, nullable=False, default=True)

    branch = relationship("Branch", back_populates="delivery_zones")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    slug = Column(String(120), unique=True, index=True, nullable=False)
    description = Column(Text, nullable=True)
    image_url = Column(Text, nullable=False)
    icon_name = Column(String(60), nullable=True)
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)

    products = relationship("Product", back_populates="category")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id", ondelete="RESTRICT"), nullable=False, index=True)
    name = Column(String(180), nullable=False)
    slug = Column(String(180), unique=True, index=True, nullable=False)
    short_description = Column(String(300), nullable=False)
    full_description = Column(Text, nullable=True)
    image_url = Column(Text, nullable=False)
    base_price = Column(Integer, nullable=False)
    compare_at_price = Column(Integer, nullable=True)
    is_available = Column(Boolean, nullable=False, default=True)
    is_bestseller = Column(Boolean, index=True, nullable=False, default=False)
    is_featured = Column(Boolean, nullable=False, default=False)
    is_new = Column(Boolean, nullable=False, default=False)
    is_vegetarian = Column(Boolean, nullable=False, default=False)
    is_spicy = Column(Boolean, nullable=False, default=False)
    calories = Column(Integer, nullable=True)
    prep_time_mins = Column(Integer, nullable=False, default=18)
    dietary_tags = Column(Text, nullable=False, default="[]")
    allergens = Column(Text, nullable=False, default="[]")
    stock_qty = Column(Integer, nullable=False, default=100)
    popularity_score = Column(Integer, nullable=False, default=50)
    is_sample_data = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    category = relationship("Category", back_populates="products")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")
    customization_groups = relationship(
        "CustomizationGroup",
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="CustomizationGroup.display_order",
    )


class ProductVariant(Base):
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    code = Column(String(50), nullable=False)
    price_modifier = Column(Integer, nullable=False, default=0)
    absolute_price = Column(Integer, nullable=True)
    serves_label = Column(String(80), nullable=True)
    is_default = Column(Boolean, nullable=False, default=False)
    is_available = Column(Boolean, nullable=False, default=True)

    product = relationship("Product", back_populates="variants")


class CustomizationGroup(Base):
    __tablename__ = "customization_groups"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    selection_type = Column(String(30), nullable=False, default="single")  # 'single' or 'multiple'
    is_required = Column(Boolean, nullable=False, default=False)
    min_selections = Column(Integer, nullable=False, default=0)
    max_selections = Column(Integer, nullable=False, default=1)
    display_order = Column(Integer, nullable=False, default=0)

    product = relationship("Product", back_populates="customization_groups")
    options = relationship("CustomizationOption", back_populates="group", cascade="all, delete-orphan")


class CustomizationOption(Base):
    __tablename__ = "customization_options"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("customization_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(String(255), nullable=True)
    price = Column(Integer, nullable=False, default=0)
    is_default = Column(Boolean, nullable=False, default=False)
    is_available = Column(Boolean, nullable=False, default=True)
    calories = Column(Integer, nullable=True)

    group = relationship("CustomizationGroup", back_populates="options")


class ProductPriceHistory(Base):
    __tablename__ = "product_price_history"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    old_price = Column(Integer, nullable=False)
    new_price = Column(Integer, nullable=False)
    changed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason = Column(String(255), nullable=True)
    changed_at = Column(DateTime(timezone=True), default=utcnow)


class Coupon(Base):
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    title = Column(String(180), nullable=False)
    description = Column(Text, nullable=False)
    discount_type = Column(String(30), nullable=False, default="percentage")  # 'percentage' or 'fixed'
    discount_value = Column(Integer, nullable=False)
    min_order_amount = Column(Integer, nullable=False, default=0)
    max_discount_amount = Column(Integer, nullable=True)
    start_date = Column(DateTime(timezone=True), nullable=False, default=utcnow)
    end_date = Column(DateTime(timezone=True), nullable=True)
    usage_limit = Column(Integer, nullable=True)
    used_count = Column(Integer, nullable=False, default=0)
    per_user_limit = Column(Integer, nullable=False, default=3)
    eligible_category_ids = Column(Text, nullable=False, default="[]")
    eligible_branch_ids = Column(Text, nullable=False, default="[]")
    fulfillment_restriction = Column(String(30), nullable=False, default="all")
    is_active = Column(Boolean, nullable=False, default=True)
    is_flash_deal = Column(Boolean, nullable=False, default=False)
    banner_image_url = Column(Text, nullable=True)
    is_sample_data = Column(Boolean, nullable=False, default=True)


class Cart(Base):
    __tablename__ = "carts"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(String(120), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    fulfillment_type = Column(String(30), nullable=False, default="delivery")
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="SET NULL"), nullable=True)
    delivery_lat = Column(Float, nullable=True)
    delivery_lng = Column(Float, nullable=True)
    delivery_formatted_address = Column(Text, nullable=True)
    coupon_code = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    items = relationship("CartItem", back_populates="cart", cascade="all, delete-orphan")


class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)
    cart_id = Column(Integer, ForeignKey("carts.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(Integer, ForeignKey("product_variants.id", ondelete="SET NULL"), nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    selected_options_json = Column(Text, nullable=False, default="[]")
    special_instructions = Column(Text, nullable=True)
    unit_price = Column(Integer, nullable=False)
    line_total = Column(Integer, nullable=False)

    cart = relationship("Cart", back_populates="items")
    product = relationship("Product")
    variant = relationship("ProductVariant")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_reference = Column(String(50), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    guest_verification_token = Column(String(120), nullable=False)
    customer_name = Column(String(150), nullable=False)
    customer_phone = Column(String(40), nullable=False)
    customer_email = Column(String(150), nullable=True)
    fulfillment_type = Column(String(30), nullable=False, default="delivery")
    branch_id = Column(Integer, ForeignKey("branches.id", ondelete="RESTRICT"), nullable=False, index=True)
    delivery_address_snapshot = Column(Text, nullable=True)
    delivery_lat = Column(Float, nullable=True)
    delivery_lng = Column(Float, nullable=True)
    delivery_distance_km = Column(Float, nullable=True)
    subtotal = Column(Integer, nullable=False)
    discount_amount = Column(Integer, nullable=False, default=0)
    coupon_code = Column(String(50), nullable=True)
    delivery_fee = Column(Integer, nullable=False, default=0)
    tax_amount = Column(Integer, nullable=False, default=0)
    total_amount = Column(Integer, nullable=False)
    loyalty_points_earned = Column(Integer, nullable=False, default=0)
    loyalty_points_redeemed = Column(Integer, nullable=False, default=0)
    payment_method = Column(String(50), nullable=False, default="cod")
    payment_status = Column(String(40), nullable=False, default="pending")
    status = Column(String(50), index=True, nullable=False, default="order_placed")
    order_notes = Column(Text, nullable=True)
    cancellation_reason = Column(Text, nullable=True)
    estimated_ready_at = Column(DateTime(timezone=True), nullable=True)
    assigned_rider_name = Column(String(120), nullable=True)
    assigned_rider_phone = Column(String(40), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user = relationship("User", back_populates="orders")
    branch = relationship("Branch")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    status_history = relationship(
        "OrderStatusHistory",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderStatusHistory.created_at",
    )
    payments = relationship("Payment", back_populates="order", cascade="all, delete-orphan")
    refunds = relationship("RefundRecord", back_populates="order", cascade="all, delete-orphan")
    rider_locations = relationship(
        "RiderLocation",
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="RiderLocation.recorded_at.desc()",
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    product_name_snapshot = Column(String(180), nullable=False)
    product_image_snapshot = Column(Text, nullable=True)
    variant_name_snapshot = Column(String(100), nullable=True)
    base_price_snapshot = Column(Integer, nullable=False)
    customizations_snapshot = Column(Text, nullable=False, default="[]")
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Integer, nullable=False)
    total_price = Column(Integer, nullable=False)
    special_instructions = Column(Text, nullable=True)

    order = relationship("Order", back_populates="items")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), nullable=False)
    note = Column(Text, nullable=True)
    updated_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    order = relationship("Order", back_populates="status_history")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    provider = Column(String(60), nullable=False)
    transaction_reference = Column(String(120), unique=True, nullable=False)
    session_id = Column(String(120), nullable=True)
    amount = Column(Integer, nullable=False)
    currency = Column(String(10), nullable=False, default="PKR")
    status = Column(String(40), nullable=False, default="initiated")
    signature_verified = Column(Boolean, nullable=False, default=False)
    raw_response_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    order = relationship("Order", back_populates="payments")


class RefundRecord(Base):
    __tablename__ = "refund_records"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)
    payment_id = Column(Integer, ForeignKey("payments.id", ondelete="SET NULL"), nullable=True)
    amount = Column(Integer, nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(40), nullable=False, default="requested")
    processed_by_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    order = relationship("Order", back_populates="refunds")


class LoyaltyTransaction(Base):
    __tablename__ = "loyalty_transactions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    points_delta = Column(Integer, nullable=False)
    transaction_type = Column(String(40), nullable=False)
    description = Column(String(255), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="loyalty_transactions")


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_reference = Column(String(50), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    customer_name = Column(String(150), nullable=False)
    customer_email = Column(String(150), nullable=True)
    customer_phone = Column(String(40), nullable=False)
    category = Column(String(60), nullable=False, default="general_inquiry")
    priority = Column(String(30), nullable=False, default="medium")
    subject = Column(String(255), nullable=False)
    status = Column(String(40), nullable=False, default="open")
    escalated_from_ai = Column(Boolean, nullable=False, default=False)
    ai_transcript_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    messages = relationship(
        "SupportMessage",
        back_populates="ticket",
        cascade="all, delete-orphan",
        order_by="SupportMessage.created_at",
    )


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("support_tickets.id", ondelete="CASCADE"), nullable=False)
    sender_role = Column(String(40), nullable=False)  # 'customer', 'admin', 'ai_agent'
    sender_name = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    ticket = relationship("SupportTicket", back_populates="messages")


class RiderLocation(Base):
    __tablename__ = "rider_locations"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    rider_id = Column(String(60), nullable=False)
    rider_name = Column(String(120), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    heading = Column(Float, nullable=True)
    speed_kmh = Column(Float, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    recorded_at = Column(DateTime(timezone=True), default=utcnow)

    order = relationship("Order", back_populates="rider_locations")


class NotificationRecord(Base):
    __tablename__ = "notification_records"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    order_id = Column(Integer, ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    ticket_id = Column(Integer, ForeignKey("support_tickets.id", ondelete="SET NULL"), nullable=True)
    channel = Column(String(40), nullable=False)
    recipient = Column(String(150), nullable=False)
    subject = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    provider_status = Column(String(50), nullable=False)
    provider_reference = Column(String(120), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    actor_role = Column(String(40), nullable=False)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(60), nullable=False)
    entity_id = Column(String(60), nullable=True)
    details_json = Column(Text, nullable=True)
    ip_address = Column(String(60), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False)
    consent_given = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)
    subscribed_at = Column(DateTime(timezone=True), default=utcnow)


class FavoriteProduct(Base):
    __tablename__ = "favorite_products"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_user_favorite_product"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="favorites")
    product = relationship("Product")
