export interface Category {
  id: number;
  name: string;
  slug: string;
  description?: string;
  image_url: string;
  icon_name?: string;
  display_order: number;
  is_active: boolean;
  product_count?: number;
}

export interface ProductVariant {
  id: number;
  product_id: number;
  name: string;
  code: string;
  price_modifier: number;
  absolute_price?: number | null;
  serves_label?: string | null;
  is_default: boolean;
  is_available: boolean;
}

export interface CustomizationOption {
  id: number;
  group_id: number;
  name: string;
  description?: string | null;
  price: number;
  is_default: boolean;
  is_available: boolean;
  calories?: number | null;
}

export interface CustomizationGroup {
  id: number;
  product_id: number;
  name: string;
  selection_type: 'single' | 'multiple';
  is_required: boolean;
  min_selections: number;
  max_selections: number;
  display_order: number;
  options: CustomizationOption[];
}

export interface Product {
  id: number;
  category_id: number;
  category_name?: string;
  category_slug?: string;
  name: string;
  slug: string;
  short_description: string;
  full_description?: string;
  image_url: string;
  base_price: number;
  compare_at_price?: number | null;
  is_available: boolean;
  is_bestseller: boolean;
  is_featured: boolean;
  is_new: boolean;
  is_vegetarian: boolean;
  is_spicy: boolean;
  calories?: number | null;
  prep_time_mins: number;
  dietary_tags: string[];
  allergens: string[];
  stock_qty: number;
  popularity_score: number;
  is_sample_data: boolean;
  variants: ProductVariant[];
  customization_groups: CustomizationGroup[];
  related_products?: Product[];
  recommended_sides?: Product[];
}

export interface DeliveryZone {
  id: number;
  branch_id: number;
  name: string;
  zone_type: 'radius' | 'polygon';
  radius_km: number;
  polygon_coords: number[][];
  base_delivery_fee: number;
  per_km_fee: number;
  min_order_amount: number;
  free_delivery_threshold?: number | null;
  estimated_mins: number;
  is_active: boolean;
}

export interface Branch {
  id: number;
  code: string;
  name: string;
  city: string;
  area: string;
  address: string;
  phone: string;
  email?: string;
  latitude: number;
  longitude: number;
  opening_time: string;
  closing_time: string;
  is_open: boolean;
  supports_delivery: boolean;
  supports_pickup: boolean;
  supports_dine_in: boolean;
  prep_time_mins: number;
  delivery_time_mins: number;
  is_sample_data: boolean;
  distance_km?: number | null;
  delivery_zones: DeliveryZone[];
}

export interface CoverageCheckResponse {
  deliverable: boolean;
  message: string;
  matched_branch?: Branch | null;
  matched_zone?: DeliveryZone | null;
  distance_km?: number | null;
  delivery_fee: number;
  delivery_fee_breakdown: string;
  min_order_amount: number;
  free_delivery_threshold?: number | null;
  estimated_delivery_mins?: number | null;
  nearest_pickup_branch?: Branch | null;
  alternative_branches: Branch[];
}

export interface SelectedCartItem {
  cart_item_key: string;
  product_id: number;
  product_name: string;
  product_image: string;
  variant_id?: number | null;
  variant_name?: string | null;
  selected_option_ids: number[];
  selected_option_labels: string[];
  half_and_half_product_id?: number | null;
  quantity: number;
  unit_price_preview: number;
  special_instructions?: string;
}

export interface ValidatedOptionDetail {
  option_id: number;
  group_name: string;
  option_name: string;
  price: number;
}

export interface ValidatedCartItem {
  product_id: number;
  product_name: string;
  product_slug: string;
  product_image: string;
  variant_id?: number | null;
  variant_name?: string | null;
  base_unit_price: number;
  options: ValidatedOptionDetail[];
  options_total_price: number;
  unit_price: number;
  quantity: number;
  line_total: number;
  special_instructions?: string | null;
}

export interface CartCalculationResponse {
  items: ValidatedCartItem[];
  subtotal: number;
  coupon_code?: string | null;
  coupon_valid: boolean;
  coupon_message?: string | null;
  discount_amount: number;
  loyalty_points_redeemed: number;
  loyalty_discount_amount: number;
  delivery_fee: number;
  delivery_fee_explanation: string;
  min_order_amount: number;
  meets_min_order: boolean;
  tax_rate_percent: number;
  tax_amount: number;
  total_amount: number;
  estimated_loyalty_points_earned: number;
  recommended_addons: {
    id: number;
    name: string;
    slug: string;
    base_price: number;
    image_url: string;
    short_description: string;
  }[];
  requires_customer_confirmation?: boolean;
  confirmation_prompt?: string;
}

export interface Coupon {
  id: number;
  code: string;
  title: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  min_order_amount: number;
  max_discount_amount?: number | null;
  start_date: string;
  end_date?: string | null;
  usage_limit?: number | null;
  used_count: number;
  per_user_limit: number;
  fulfillment_restriction: string;
  is_active: boolean;
  is_flash_deal: boolean;
  banner_image_url?: string | null;
  is_sample_data: boolean;
}

export interface CustomerAddress {
  id: number;
  user_id?: number;
  label: string;
  recipient_name?: string;
  phone?: string;
  house_number: string;
  street: string;
  area: string;
  city: string;
  landmark?: string;
  delivery_instructions?: string;
  latitude: number;
  longitude: number;
  formatted_address: string;
  is_default: boolean;
}

export interface User {
  id: number;
  email: string;
  phone: string;
  full_name: string;
  role: 'customer' | 'admin' | 'staff';
  is_active: boolean;
  loyalty_points: number;
  addresses: CustomerAddress[];
}

export interface Order {
  id: number;
  order_reference: string;
  guest_verification_token?: string;
  user_id?: number | null;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  fulfillment_type: 'delivery' | 'pickup';
  branch_id: number;
  branch_name: string;
  branch_address: string;
  branch_phone: string;
  delivery_address?: {
    house_number?: string;
    street?: string;
    area?: string;
    city?: string;
    landmark?: string;
    delivery_instructions?: string;
    formatted_address?: string;
  };
  delivery_lat?: number | null;
  delivery_lng?: number | null;
  delivery_distance_km?: number | null;
  subtotal: number;
  discount_amount: number;
  coupon_code?: string | null;
  delivery_fee: number;
  tax_amount: number;
  total_amount: number;
  loyalty_points_earned: number;
  loyalty_points_redeemed: number;
  payment_method: string;
  payment_status: string;
  status: string;
  order_notes?: string | null;
  cancellation_reason?: string | null;
  estimated_ready_at?: string | null;
  assigned_rider_name?: string | null;
  assigned_rider_phone?: string | null;
  latest_rider_location?: {
    rider_id: string;
    rider_name: string;
    latitude: number;
    longitude: number;
    heading?: number;
    speed_kmh?: number;
    recorded_at?: string;
  } | null;
  created_at: string;
  items: {
    id: number;
    product_id: number;
    product_name: string;
    product_image?: string;
    variant_name?: string;
    base_price: number;
    customizations: ValidatedOptionDetail[];
    quantity: number;
    unit_price: number;
    total_price: number;
    special_instructions?: string;
  }[];
  status_history: {
    id: number;
    status: string;
    note?: string;
    created_at: string;
  }[];
  payments: {
    transaction_reference: string;
    provider: string;
    amount: number;
    status: string;
    signature_verified: boolean;
  }[];
}

export interface SupportTicket {
  id: number;
  ticket_reference: string;
  customer_name: string;
  customer_email?: string;
  customer_phone: string;
  category: string;
  priority: string;
  subject: string;
  status: string;
  escalated_from_ai: boolean;
  created_at: string;
  messages: {
    id: number;
    sender_role: string;
    sender_name: string;
    message: string;
    created_at: string;
  }[];
}

export interface AIChatResponse {
  reply: string;
  mode: string;
  provider_status_note: string;
  recommended_products: Product[];
  proposed_cart?: CartCalculationResponse | null;
  order_status_card?: {
    authorized: boolean;
    found: boolean;
    order_reference: string;
    status: string;
    payment_status: string;
    fulfillment_type: string;
    branch_name: string;
    total_amount: number;
  } | null;
  support_ticket_card?: {
    ticket_reference: string;
    status: string;
    priority: string;
    subject: string;
    support_phone: string;
    support_email: string;
    message: string;
  } | null;
  agent_steps?: {
    step_type: 'thought' | 'tool_call' | 'observation' | 'action' | string;
    title: string;
    detail: string;
    tool_name?: string | null;
  }[];
  agent_actions?: {
    action_type: string;
    label: string;
    auto_execute: boolean;
    payload: Record<string, any>;
  }[];
  quick_replies: string[];
  tools_invoked: string[];
}
