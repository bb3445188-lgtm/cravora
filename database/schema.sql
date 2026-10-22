-- =============================================================================
-- CRAVORA — PIZZA & MORE | PostgreSQL Production Database Schema
-- Normalized relational schema with foreign keys, unique constraints & indexes
-- =============================================================================

CREATE TABLE IF NOT EXISTS roles_permissions (
    id SERIAL PRIMARY KEY,
    role_name VARCHAR(50) UNIQUE NOT NULL,
    description VARCHAR(255) NOT NULL,
    permissions_json TEXT NOT NULL DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(30) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'customer',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    loyalty_points INTEGER NOT NULL DEFAULT 0,
    reset_token VARCHAR(255),
    reset_token_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS customer_addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    label VARCHAR(60) NOT NULL DEFAULT 'Home',
    recipient_name VARCHAR(150),
    phone VARCHAR(30),
    house_number VARCHAR(100) NOT NULL,
    street VARCHAR(150) NOT NULL,
    area VARCHAR(150) NOT NULL,
    city VARCHAR(100) NOT NULL DEFAULT 'Islamabad',
    landmark VARCHAR(255),
    delivery_instructions TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    formatted_address TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON customer_addresses(user_id);

CREATE TABLE IF NOT EXISTS branches (
    id SERIAL PRIMARY KEY,
    code VARCHAR(40) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    city VARCHAR(100) NOT NULL,
    area VARCHAR(150) NOT NULL,
    address TEXT NOT NULL,
    phone VARCHAR(40) NOT NULL,
    email VARCHAR(150),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    opening_time VARCHAR(20) NOT NULL DEFAULT '11:00',
    closing_time VARCHAR(20) NOT NULL DEFAULT '02:00',
    is_open BOOLEAN NOT NULL DEFAULT TRUE,
    supports_delivery BOOLEAN NOT NULL DEFAULT TRUE,
    supports_pickup BOOLEAN NOT NULL DEFAULT TRUE,
    supports_dine_in BOOLEAN NOT NULL DEFAULT TRUE,
    prep_time_mins INTEGER NOT NULL DEFAULT 20,
    delivery_time_mins INTEGER NOT NULL DEFAULT 35,
    is_sample_data BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_branches_city ON branches(city);

CREATE TABLE IF NOT EXISTS delivery_zones (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    zone_type VARCHAR(30) NOT NULL DEFAULT 'radius', -- 'radius' or 'polygon'
    radius_km DOUBLE PRECISION NOT NULL DEFAULT 6.0,
    polygon_coords TEXT NOT NULL DEFAULT '[]', -- JSON array of [lat, lng]
    base_delivery_fee INTEGER NOT NULL DEFAULT 150,
    per_km_fee INTEGER NOT NULL DEFAULT 20,
    min_order_amount INTEGER NOT NULL DEFAULT 600,
    free_delivery_threshold INTEGER DEFAULT 3000,
    estimated_mins INTEGER NOT NULL DEFAULT 35,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_branch_id ON delivery_zones(branch_id);

CREATE TABLE IF NOT EXISTS categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(120) UNIQUE NOT NULL,
    description TEXT,
    image_url TEXT NOT NULL,
    icon_name VARCHAR(60),
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    name VARCHAR(180) NOT NULL,
    slug VARCHAR(180) UNIQUE NOT NULL,
    short_description VARCHAR(300) NOT NULL,
    full_description TEXT,
    image_url TEXT NOT NULL,
    base_price INTEGER NOT NULL,
    compare_at_price INTEGER,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    is_bestseller BOOLEAN NOT NULL DEFAULT FALSE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    is_new BOOLEAN NOT NULL DEFAULT FALSE,
    is_vegetarian BOOLEAN NOT NULL DEFAULT FALSE,
    is_spicy BOOLEAN NOT NULL DEFAULT FALSE,
    calories INTEGER,
    prep_time_mins INTEGER NOT NULL DEFAULT 18,
    dietary_tags TEXT NOT NULL DEFAULT '[]',
    allergens TEXT NOT NULL DEFAULT '[]',
    stock_qty INTEGER NOT NULL DEFAULT 100,
    popularity_score INTEGER NOT NULL DEFAULT 50,
    is_sample_data BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_bestseller ON products(is_bestseller);

CREATE TABLE IF NOT EXISTS product_variants (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    price_modifier INTEGER NOT NULL DEFAULT 0,
    absolute_price INTEGER,
    serves_label VARCHAR(80),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_available BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);

CREATE TABLE IF NOT EXISTS customization_groups (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    selection_type VARCHAR(30) NOT NULL DEFAULT 'single', -- 'single' or 'multiple'
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    min_selections INTEGER NOT NULL DEFAULT 0,
    max_selections INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_customization_groups_product_id ON customization_groups(product_id);

CREATE TABLE IF NOT EXISTS customization_options (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES customization_groups(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(255),
    price INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    calories INTEGER
);
CREATE INDEX IF NOT EXISTS idx_customization_options_group_id ON customization_options(group_id);

CREATE TABLE IF NOT EXISTS product_price_history (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    old_price INTEGER NOT NULL,
    new_price INTEGER NOT NULL,
    changed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reason VARCHAR(255),
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS coupons (
    id SERIAL PRIMARY KEY,
    code VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(180) NOT NULL,
    description TEXT NOT NULL,
    discount_type VARCHAR(30) NOT NULL DEFAULT 'percentage', -- 'percentage' or 'fixed'
    discount_value INTEGER NOT NULL,
    min_order_amount INTEGER NOT NULL DEFAULT 0,
    max_discount_amount INTEGER,
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE,
    usage_limit INTEGER,
    used_count INTEGER NOT NULL DEFAULT 0,
    per_user_limit INTEGER NOT NULL DEFAULT 3,
    eligible_category_ids TEXT NOT NULL DEFAULT '[]',
    eligible_branch_ids TEXT NOT NULL DEFAULT '[]',
    fulfillment_restriction VARCHAR(30) NOT NULL DEFAULT 'all',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_flash_deal BOOLEAN NOT NULL DEFAULT FALSE,
    banner_image_url TEXT,
    is_sample_data BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

CREATE TABLE IF NOT EXISTS carts (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(120) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    fulfillment_type VARCHAR(30) NOT NULL DEFAULT 'delivery',
    branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    delivery_lat DOUBLE PRECISION,
    delivery_lng DOUBLE PRECISION,
    delivery_formatted_address TEXT,
    coupon_code VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cart_items (
    id SERIAL PRIMARY KEY,
    cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    selected_options_json TEXT NOT NULL DEFAULT '[]',
    special_instructions TEXT,
    unit_price INTEGER NOT NULL,
    line_total INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_reference VARCHAR(50) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    guest_verification_token VARCHAR(120) NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(40) NOT NULL,
    customer_email VARCHAR(150),
    fulfillment_type VARCHAR(30) NOT NULL DEFAULT 'delivery',
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    delivery_address_snapshot TEXT,
    delivery_lat DOUBLE PRECISION,
    delivery_lng DOUBLE PRECISION,
    delivery_distance_km DOUBLE PRECISION,
    subtotal INTEGER NOT NULL,
    discount_amount INTEGER NOT NULL DEFAULT 0,
    coupon_code VARCHAR(50),
    delivery_fee INTEGER NOT NULL DEFAULT 0,
    tax_amount INTEGER NOT NULL DEFAULT 0,
    total_amount INTEGER NOT NULL,
    loyalty_points_earned INTEGER NOT NULL DEFAULT 0,
    loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cod',
    payment_status VARCHAR(40) NOT NULL DEFAULT 'pending',
    status VARCHAR(50) NOT NULL DEFAULT 'order_placed',
    order_notes TEXT,
    cancellation_reason TEXT,
    estimated_ready_at TIMESTAMP WITH TIME ZONE,
    assigned_rider_name VARCHAR(120),
    assigned_rider_phone VARCHAR(40),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_orders_reference ON orders(order_reference);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id);

CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name_snapshot VARCHAR(180) NOT NULL,
    product_image_snapshot TEXT,
    variant_name_snapshot VARCHAR(100),
    base_price_snapshot INTEGER NOT NULL,
    customizations_snapshot TEXT NOT NULL DEFAULT '[]',
    quantity INTEGER NOT NULL,
    unit_price INTEGER NOT NULL,
    total_price INTEGER NOT NULL,
    special_instructions TEXT
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

CREATE TABLE IF NOT EXISTS order_status_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    note TEXT,
    updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    provider VARCHAR(60) NOT NULL,
    transaction_reference VARCHAR(120) UNIQUE NOT NULL,
    session_id VARCHAR(120),
    amount INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'PKR',
    status VARCHAR(40) NOT NULL DEFAULT 'initiated',
    signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    raw_response_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);

CREATE TABLE IF NOT EXISTS refund_records (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_id INTEGER REFERENCES payments(id) ON DELETE SET NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'requested',
    processed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS loyalty_transactions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    points_delta INTEGER NOT NULL,
    transaction_type VARCHAR(40) NOT NULL,
    description VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_loyalty_user_id ON loyalty_transactions(user_id);

CREATE TABLE IF NOT EXISTS support_tickets (
    id SERIAL PRIMARY KEY,
    ticket_reference VARCHAR(50) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    customer_name VARCHAR(150) NOT NULL,
    customer_email VARCHAR(150),
    customer_phone VARCHAR(40) NOT NULL,
    category VARCHAR(60) NOT NULL DEFAULT 'general_inquiry',
    priority VARCHAR(30) NOT NULL DEFAULT 'medium',
    subject VARCHAR(255) NOT NULL,
    status VARCHAR(40) NOT NULL DEFAULT 'open',
    escalated_from_ai BOOLEAN NOT NULL DEFAULT FALSE,
    ai_transcript_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_ref ON support_tickets(ticket_reference);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets(user_id);

CREATE TABLE IF NOT EXISTS support_messages (
    id SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    sender_role VARCHAR(40) NOT NULL,
    sender_name VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS rider_locations (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rider_id VARCHAR(60) NOT NULL,
    rider_name VARCHAR(120) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    heading DOUBLE PRECISION,
    speed_kmh DOUBLE PRECISION,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_rider_locations_order_id ON rider_locations(order_id);

CREATE TABLE IF NOT EXISTS notification_records (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    ticket_id INTEGER REFERENCES support_tickets(id) ON DELETE SET NULL,
    channel VARCHAR(40) NOT NULL,
    recipient VARCHAR(150) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    provider_status VARCHAR(50) NOT NULL,
    provider_reference VARCHAR(120),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
    id SERIAL PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    actor_role VARCHAR(40) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(60) NOT NULL,
    entity_id VARCHAR(60),
    details_json TEXT,
    ip_address VARCHAR(60),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    consent_given BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    subscribed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS favorite_products (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);
