from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field


# --- Auth & User Schemas ---
class UserRegisterRequest(BaseModel):
    email: EmailStr
    phone: str = Field(..., min_length=7, max_length=30)
    full_name: str = Field(..., min_length=2, max_length=150)
    password: str = Field(..., min_length=6, max_length=128)


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    email: EmailStr
    reset_token: str
    new_password: str = Field(..., min_length=6, max_length=128)


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = Field(None, min_length=2, max_length=150)
    phone: Optional[str] = Field(None, min_length=7, max_length=30)


class CustomerAddressCreate(BaseModel):
    label: str = "Home"
    recipient_name: Optional[str] = None
    phone: Optional[str] = None
    house_number: str = Field(..., min_length=1, max_length=100)
    street: str = Field(..., min_length=1, max_length=150)
    area: str = Field(..., min_length=1, max_length=150)
    city: str = Field(default="Islamabad", max_length=100)
    landmark: Optional[str] = None
    delivery_instructions: Optional[str] = None
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    formatted_address: str
    is_default: bool = False


class CustomerAddressOut(CustomerAddressCreate):
    id: int
    user_id: Optional[int] = None
    created_at: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)


class UserOut(BaseModel):
    id: int
    email: str
    phone: str
    full_name: str
    role: str
    is_active: bool
    loyalty_points: int
    created_at: Optional[datetime] = None
    addresses: List[CustomerAddressOut] = []
    model_config = ConfigDict(from_attributes=True)


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# --- Menu & Product Schemas ---
class CustomizationOptionOut(BaseModel):
    id: int
    group_id: int
    name: str
    description: Optional[str] = None
    price: int
    is_default: bool
    is_available: bool
    calories: Optional[int] = None
    model_config = ConfigDict(from_attributes=True)


class CustomizationGroupOut(BaseModel):
    id: int
    product_id: int
    name: str
    selection_type: str
    is_required: bool
    min_selections: int
    max_selections: int
    display_order: int
    options: List[CustomizationOptionOut] = []
    model_config = ConfigDict(from_attributes=True)


class ProductVariantOut(BaseModel):
    id: int
    product_id: int
    name: str
    code: str
    price_modifier: int
    absolute_price: Optional[int] = None
    serves_label: Optional[str] = None
    is_default: bool
    is_available: bool
    model_config = ConfigDict(from_attributes=True)


class CategoryOut(BaseModel):
    id: int
    name: str
    slug: str
    description: Optional[str] = None
    image_url: str
    icon_name: Optional[str] = None
    display_order: int
    is_active: bool
    model_config = ConfigDict(from_attributes=True)


class ProductOut(BaseModel):
    id: int
    category_id: int
    category_name: Optional[str] = None
    category_slug: Optional[str] = None
    name: str
    slug: str
    short_description: str
    full_description: Optional[str] = None
    image_url: str
    base_price: int
    compare_at_price: Optional[int] = None
    is_available: bool
    is_bestseller: bool
    is_featured: bool
    is_new: bool
    is_vegetarian: bool
    is_spicy: bool
    calories: Optional[int] = None
    prep_time_mins: int
    dietary_tags: List[str] = []
    allergens: List[str] = []
    stock_qty: int
    popularity_score: int = 50
    is_sample_data: bool = True
    variants: List[ProductVariantOut] = []
    customization_groups: List[CustomizationGroupOut] = []
    model_config = ConfigDict(from_attributes=True)


# --- Pricing & Cart Calculation Schemas ---
class SelectedItemInput(BaseModel):
    product_id: int
    variant_id: Optional[int] = None
    selected_option_ids: List[int] = []
    half_and_half_product_id: Optional[int] = None
    quantity: int = Field(default=1, ge=1, le=50)
    special_instructions: Optional[str] = Field(None, max_length=500)


class CartCalculationRequest(BaseModel):
    items: List[SelectedItemInput]
    fulfillment_type: str = Field(default="delivery", pattern="^(delivery|pickup)$")
    branch_id: Optional[int] = None
    delivery_lat: Optional[float] = None
    delivery_lng: Optional[float] = None
    coupon_code: Optional[str] = None
    redeem_loyalty_points: int = Field(default=0, ge=0)


class ValidatedOptionDetail(BaseModel):
    option_id: int
    group_name: str
    option_name: str
    price: int


class ValidatedCartItemOut(BaseModel):
    product_id: int
    product_name: str
    product_slug: str
    product_image: str
    variant_id: Optional[int] = None
    variant_name: Optional[str] = None
    base_unit_price: int
    options: List[ValidatedOptionDetail] = []
    options_total_price: int
    unit_price: int
    quantity: int
    line_total: int
    special_instructions: Optional[str] = None


class CartCalculationResponse(BaseModel):
    items: List[ValidatedCartItemOut]
    subtotal: int
    coupon_code: Optional[str] = None
    coupon_valid: bool = False
    coupon_message: Optional[str] = None
    discount_amount: int
    loyalty_points_redeemed: int = 0
    loyalty_discount_amount: int = 0
    delivery_fee: int
    delivery_fee_explanation: str
    min_order_amount: int = 0
    meets_min_order: bool = True
    tax_rate_percent: int
    tax_amount: int
    total_amount: int
    estimated_loyalty_points_earned: int = 0
    recommended_addons: List[Dict[str, Any]] = []


# --- Branches & Maps Schemas ---
class DeliveryZoneOut(BaseModel):
    id: int
    branch_id: int
    name: str
    zone_type: str
    radius_km: float
    polygon_coords: List[List[float]] = []
    base_delivery_fee: int
    per_km_fee: int
    min_order_amount: int
    free_delivery_threshold: Optional[int] = None
    estimated_mins: int
    is_active: bool


class BranchOut(BaseModel):
    id: int
    code: str
    name: str
    city: str
    area: str
    address: str
    phone: str
    email: Optional[str] = None
    latitude: float
    longitude: float
    opening_time: str
    closing_time: str
    is_open: bool
    supports_delivery: bool
    supports_pickup: bool
    supports_dine_in: bool
    prep_time_mins: int
    delivery_time_mins: int
    is_sample_data: bool = True
    distance_km: Optional[float] = None
    delivery_zones: List[DeliveryZoneOut] = []


class CoverageCheckRequest(BaseModel):
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    subtotal: int = Field(default=0, ge=0)
    preferred_branch_id: Optional[int] = None


class CoverageCheckResponse(BaseModel):
    deliverable: bool
    message: str
    matched_branch: Optional[BranchOut] = None
    matched_zone: Optional[DeliveryZoneOut] = None
    distance_km: Optional[float] = None
    delivery_fee: int = 0
    delivery_fee_breakdown: str = ""
    min_order_amount: int = 0
    free_delivery_threshold: Optional[int] = None
    estimated_delivery_mins: Optional[int] = None
    nearest_pickup_branch: Optional[BranchOut] = None
    alternative_branches: List[BranchOut] = []


# --- Checkout & Orders Schemas ---
class DeliveryAddressInput(BaseModel):
    house_number: str = Field(..., min_length=1, max_length=100)
    street: str = Field(..., min_length=1, max_length=150)
    area: str = Field(..., min_length=1, max_length=150)
    city: str = Field(default="Islamabad", max_length=100)
    landmark: Optional[str] = None
    delivery_instructions: Optional[str] = None
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    formatted_address: str


class CheckoutCreateOrderRequest(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=150)
    customer_phone: str = Field(..., min_length=7, max_length=40)
    customer_email: Optional[EmailStr] = None
    fulfillment_type: str = Field(..., pattern="^(delivery|pickup)$")
    branch_id: Optional[int] = None
    delivery_address: Optional[DeliveryAddressInput] = None
    items: List[SelectedItemInput] = Field(..., min_length=1)
    coupon_code: Optional[str] = None
    redeem_loyalty_points: int = Field(default=0, ge=0)
    payment_method: str = Field(
        default="cod",
        pattern="^(cod|card_online|wallet_jazzcash|wallet_easypaisa)$",
    )
    order_notes: Optional[str] = Field(None, max_length=1000)
    idempotency_key: Optional[str] = None


# --- Promotions & Coupons ---
class CouponOut(BaseModel):
    id: int
    code: str
    title: str
    description: str
    discount_type: str
    discount_value: int
    min_order_amount: int
    max_discount_amount: Optional[int] = None
    start_date: datetime
    end_date: Optional[datetime] = None
    usage_limit: Optional[int] = None
    used_count: int
    per_user_limit: int
    eligible_category_ids: List[int] = []
    eligible_branch_ids: List[int] = []
    fulfillment_restriction: str
    is_active: bool
    is_flash_deal: bool
    banner_image_url: Optional[str] = None
    is_sample_data: bool = True


# --- Support Tickets ---
class SupportTicketCreateRequest(BaseModel):
    customer_name: str = Field(..., min_length=2, max_length=150)
    customer_email: Optional[EmailStr] = None
    customer_phone: str = Field(..., min_length=7, max_length=40)
    order_reference: Optional[str] = None
    category: str = "general_inquiry"
    priority: str = "medium"
    subject: str = Field(..., min_length=3, max_length=255)
    message: str = Field(..., min_length=5, max_length=3000)
    escalated_from_ai: bool = False


class SupportMessageCreateRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=3000)


# --- AI Assistant Schemas ---
class AIChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant|system)$")
    content: str


class AIAgentStep(BaseModel):
    step_type: str  # 'thought' | 'tool_call' | 'observation' | 'action'
    title: str
    detail: str
    tool_name: Optional[str] = None


class AIAgentAction(BaseModel):
    action_type: str  # 'ADD_TO_CART' | 'APPLY_COUPON' | 'CLEAR_CART' | 'REMOVE_FROM_CART' | 'SET_FULFILLMENT' | 'OPEN_CUSTOMIZER' | 'NAVIGATE'
    label: str
    auto_execute: bool = True
    payload: Dict[str, Any] = {}


class AIChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    history: List[AIChatMessage] = []
    current_cart: List[SelectedItemInput] = []
    current_coupon: Optional[str] = None
    fulfillment_type: str = "delivery"
    branch_id: Optional[int] = None
    delivery_lat: Optional[float] = None
    delivery_lng: Optional[float] = None
    guest_order_reference: Optional[str] = None
    guest_phone: Optional[str] = None
    runtime_api_key: Optional[str] = None
    runtime_provider: Optional[str] = None


class AIChatResponse(BaseModel):
    reply: str
    mode: str  # 'live_llm' or 'autonomous_react_agent' or 'local_tool_concierge'
    provider_status_note: str
    recommended_products: List[Dict[str, Any]] = []
    proposed_cart: Optional[Dict[str, Any]] = None
    order_status_card: Optional[Dict[str, Any]] = None
    support_ticket_card: Optional[Dict[str, Any]] = None
    agent_steps: List[AIAgentStep] = []
    agent_actions: List[AIAgentAction] = []
    suggested_Order_actions: List[str] = []
    quick_replies: List[str] = []
    tools_invoked: List[str] = []


# --- Newsletter ---
class NewsletterSubscribeRequest(BaseModel):
    email: EmailStr
    consent_given: bool = True


# --- Admin Input Schemas ---
class AdminProductCreateUpdate(BaseModel):
    category_id: int
    name: str
    slug: Optional[str] = None
    short_description: str
    full_description: Optional[str] = None
    image_url: str
    base_price: int = Field(..., ge=1)
    compare_at_price: Optional[int] = None
    is_available: bool = True
    is_bestseller: bool = False
    is_featured: bool = False
    is_new: bool = False
    is_vegetarian: bool = False
    is_spicy: bool = False
    calories: Optional[int] = None
    prep_time_mins: int = 18
    stock_qty: int = 100
    dietary_tags: List[str] = []
    allergens: List[str] = []


class AdminCategoryCreateUpdate(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    image_url: str
    icon_name: Optional[str] = "Pizza"
    display_order: int = 0
    is_active: bool = True


class AdminOrderStatusUpdate(BaseModel):
    status: str = Field(
        ...,
        pattern="^(order_placed|order_confirmed|preparing|out_for_delivery|ready_for_pickup|delivered|collected|cancelled)$",
    )
    note: Optional[str] = None
    assigned_rider_name: Optional[str] = None
    assigned_rider_phone: Optional[str] = None


class AdminCouponCreateUpdate(BaseModel):
    code: str = Field(..., min_length=3, max_length=50)
    title: str
    description: str
    discount_type: str = Field(..., pattern="^(percentage|fixed)$")
    discount_value: int = Field(..., ge=1)
    min_order_amount: int = 0
    max_discount_amount: Optional[int] = None
    end_date: Optional[datetime] = None
    usage_limit: Optional[int] = None
    per_user_limit: int = 3
    fulfillment_restriction: str = "all"
    is_active: bool = True
    is_flash_deal: bool = False


class AdminBranchCreateUpdate(BaseModel):
    code: str
    name: str
    city: str
    area: str
    address: str
    phone: str
    email: Optional[str] = None
    latitude: float
    longitude: float
    opening_time: str = "11:00"
    closing_time: str = "02:00"
    is_open: bool = True
    supports_delivery: bool = True
    supports_pickup: bool = True
    supports_dine_in: bool = True
    prep_time_mins: int = 20
    delivery_time_mins: int = 35
    base_delivery_fee: int = 150
    per_km_fee: int = 20
    min_order_amount: int = 600
    radius_km: float = 6.5


class RiderLocationUpdateRequest(BaseModel):
    rider_id: str
    rider_name: str
    latitude: float = Field(..., ge=-90.0, le=90.0)
    longitude: float = Field(..., ge=-180.0, le=180.0)
    heading: Optional[float] = None
    speed_kmh: Optional[float] = None
