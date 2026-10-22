import json
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session

from app.models import (
    Branch,
    Category,
    Coupon,
    CustomerAddress,
    CustomizationGroup,
    CustomizationOption,
    DeliveryZone,
    LoyaltyTransaction,
    Order,
    OrderItem,
    OrderStatusHistory,
    Payment,
    Product,
    ProductVariant,
    RolePermission,
    SupportMessage,
    SupportTicket,
    User,
)
from app.security import hash_password


def attach_pizza_customizations(db: Session, product: Product, base_reg_price: int) -> None:
    """Attach standard Pakistani artisan pizza size variants, crusts, stuffed crusts, toppings & dips."""
    variants = [
        ProductVariant(
            product_id=product.id,
            name='Small 8"',
            code="SM",
            price_modifier=-350,
            absolute_price=max(690, base_reg_price - 400),
            serves_label="Serves 1 (4 Slices)",
            is_default=False,
        ),
        ProductVariant(
            product_id=product.id,
            name='Regular 10"',
            code="REG",
            price_modifier=0,
            absolute_price=base_reg_price,
            serves_label="Serves 2 (6 Slices)",
            is_default=True,
        ),
        ProductVariant(
            product_id=product.id,
            name='Large 13"',
            code="LRG",
            price_modifier=550,
            absolute_price=base_reg_price + 550,
            serves_label="Serves 3–4 (8 Slices)",
            is_default=False,
        ),
        ProductVariant(
            product_id=product.id,
            name='Party Beast 16"',
            code="PRTY",
            price_modifier=1150,
            absolute_price=base_reg_price + 1150,
            serves_label="Serves 5–6 (12 Slices)",
            is_default=False,
        ),
    ]
    db.add_all(variants)

    # Group 1: Crust Selection (Required single)
    crust_group = CustomizationGroup(
        product_id=product.id,
        name="Artisan Crust Selection",
        selection_type="single",
        is_required=True,
        min_selections=1,
        max_selections=1,
        display_order=1,
    )
    db.add(crust_group)
    db.flush()
    db.add_all([
        CustomizationOption(
            group_id=crust_group.id,
            name="Hand-Tossed Classic Crust",
            description="Golden airy edge brushed with garlic herb butter",
            price=0,
            is_default=True,
            calories=180,
        ),
        CustomizationOption(
            group_id=crust_group.id,
            name="Thin & Crispy Roman Crust",
            description="Light, crackly stone-baked base",
            price=0,
            is_default=False,
            calories=140,
        ),
        CustomizationOption(
            group_id=crust_group.id,
            name="Deep Pan Buttery Crust",
            description="Thick, pillowy pan-baked crust with caramelized cheese rim",
            price=120,
            is_default=False,
            calories=260,
        ),
    ])

    # Group 2: Stuffed Crust & Cheese Upgrades (Optional single)
    cheese_group = CustomizationGroup(
        product_id=product.id,
        name="Cheese & Stuffed Crust Upgrades",
        selection_type="single",
        is_required=False,
        min_selections=0,
        max_selections=1,
        display_order=2,
    )
    db.add(cheese_group)
    db.flush()
    db.add_all([
        CustomizationOption(
            group_id=cheese_group.id,
            name="Double Mozzarella Cheese Pull",
            description="Generous extra layer of 100% real shredded mozzarella",
            price=250,
            is_default=False,
            calories=220,
        ),
        CustomizationOption(
            group_id=cheese_group.id,
            name="Royal Seekh Kebab Stuffed Crust",
            description="Outer ring stuffed with smoky charcoal chicken seekh kebab & molten cheese",
            price=380,
            is_default=False,
            calories=310,
        ),
        CustomizationOption(
            group_id=cheese_group.id,
            name="Molten Cheddar-Jalapeño Crown Crust",
            description="Crown pockets filled with aged cheddar Sauce and pickled jalapeños",
            price=350,
            is_default=False,
            calories=290,
        ),
    ])

    # Group 3: Extra Toppings (Optional multiple up to 5)
    topping_group = CustomizationGroup(
        product_id=product.id,
        name="Extra Fire-Roasted Toppings",
        selection_type="multiple",
        is_required=False,
        min_selections=0,
        max_selections=5,
        display_order=3,
    )
    db.add(topping_group)
    db.flush()
    db.add_all([
        CustomizationOption(
            group_id=topping_group.id,
            name="Charcoal Chicken Tikka Chunks",
            price=240,
            calories=130,
        ),
        CustomizationOption(
            group_id=topping_group.id,
            name="Smoked Beef Pepperoni",
            price=220,
            calories=150,
        ),
        CustomizationOption(
            group_id=topping_group.id,
            name="Fire-Roasted Jalapeños & Olives",
            price=120,
            calories=45,
        ),
        CustomizationOption(
            group_id=topping_group.id,
            name="Sautéed Button Mushrooms",
            price=140,
            calories=40,
        ),
        CustomizationOption(
            group_id=topping_group.id,
            name="Sweet Corn & Red Paprika",
            price=110,
            calories=55,
        ),
    ])

    # Group 4: Signature Drizzle & Dips (Optional multiple up to 3)
    sauce_group = CustomizationGroup(
        product_id=product.id,
        name="Signature Dips & Swirls",
        selection_type="multiple",
        is_required=False,
        min_selections=0,
        max_selections=3,
        display_order=4,
    )
    db.add(sauce_group)
    db.flush()
    db.add_all([
        CustomizationOption(
            group_id=sauce_group.id,
            name="Cravora Creamy Garlic Herb Dip",
            price=120,
            calories=160,
        ),
        CustomizationOption(
            group_id=sauce_group.id,
            name="Peri-Peri Fiery Drizzle",
            price=100,
            calories=90,
        ),
        CustomizationOption(
            group_id=sauce_group.id,
            name="Smoky Chipotle Mayo Tub",
            price=120,
            calories=170,
        ),
    ])


def attach_burger_or_wrap_customizations(db: Session, product: Product, base_price: int) -> None:
    """Attach variants & meal upgrades for burgers, sandwiches, and wraps."""
    db.add_all([
        ProductVariant(
            product_id=product.id,
            name="Single Classic",
            code="SGL",
            price_modifier=0,
            absolute_price=base_price,
            serves_label="Single Fillet / Patty",
            is_default=True,
        ),
        ProductVariant(
            product_id=product.id,
            name="Double Monster Stack",
            code="DBL",
            price_modifier=360,
            absolute_price=base_price + 360,
            serves_label="Double Fillet / Double Cheese",
            is_default=False,
        ),
    ])

    meal_group = CustomizationGroup(
        product_id=product.id,
        name="Make It A Complete Meal",
        selection_type="single",
        is_required=True,
        min_selections=1,
        max_selections=1,
        display_order=1,
    )
    db.add(meal_group)
    db.flush()
    db.add_all([
        CustomizationOption(
            group_id=meal_group.id,
            name="Sandwich / Burger Only",
            description="Served with signature house dip",
            price=0,
            is_default=True,
        ),
        CustomizationOption(
            group_id=meal_group.id,
            name="Regular Cravora Meal (+Fries & 345ml Drink)",
            description="Masala skin-on fries + chilled soft drink",
            price=350,
            is_default=False,
        ),
        CustomizationOption(
            group_id=meal_group.id,
            name="Loaded Meal (+Cheesy Jalapeño Fries & Mint Margarita)",
            description="Upgrade to molten cheese fries & fresh blended Mint Margarita",
            price=550,
            is_default=False,
        ),
    ])

    extras_group = CustomizationGroup(
        product_id=product.id,
        name="Add-On Extras & Sauces",
        selection_type="multiple",
        is_required=False,
        min_selections=0,
        max_selections=4,
        display_order=2,
    )
    db.add(extras_group)
    db.flush()
    db.add_all([
        CustomizationOption(
            group_id=extras_group.id,
            name="Aged Cheddar Cheese Slice",
            price=110,
        ),
        CustomizationOption(
            group_id=extras_group.id,
            name="Crispy Turkey Bacon Strips",
            price=190,
        ),
        CustomizationOption(
            group_id=extras_group.id,
            name="Pickled Jalapeños & Gherkins",
            price=80,
        ),
        CustomizationOption(
            group_id=extras_group.id,
            name="Extra Garlic Mayo Dip",
            price=100,
        ),
    ])


def attach_combo_customizations(db: Session, product: Product) -> None:
    """Attach combo customization groups: pizza flavor choice, side selection, and drink choice."""
    flavor_group = CustomizationGroup(
        product_id=product.id,
        name="Select Primary Pizza / Entrée Flavor",
        selection_type="single",
        is_required=True,
        min_selections=1,
        max_selections=1,
        display_order=1,
    )
    db.add(flavor_group)
    db.flush()
    db.add_all([
        CustomizationOption(
            group_id=flavor_group.id,
            name="Royal Crown Crust Tikka (Included)",
            price=0,
            is_default=True,
        ),
        CustomizationOption(
            group_id=flavor_group.id,
            name="Lahori Seekh Kebab Supreme (Included)",
            price=0,
            is_default=False,
        ),
        CustomizationOption(
            group_id=flavor_group.id,
            name="Blazing Peri-Peri Fiesta (Included)",
            price=0,
            is_default=False,
        ),
        CustomizationOption(
            group_id=flavor_group.id,
            name="Upgrade to Truffle Beef Pepperoni (+Rs. 250)",
            price=250,
            is_default=False,
        ),
    ])

    side_group = CustomizationGroup(
        product_id=product.id,
        name="Choose Your Included Side",
        selection_type="single",
        is_required=True,
        min_selections=1,
        max_selections=1,
        display_order=2,
    )
    db.add(side_group)
    db.flush()
    db.add_all([
        CustomizationOption(
            group_id=side_group.id,
            name="4 Pcs Stuffed Garlic Breadsticks (Included)",
            price=0,
            is_default=True,
        ),
        CustomizationOption(
            group_id=side_group.id,
            name="6 Pcs Peri-Peri Oven Wings (+Rs. 180)",
            price=180,
            is_default=False,
        ),
        CustomizationOption(
            group_id=side_group.id,
            name="Loaded Animal Style Fries (+Rs. 220)",
            price=220,
            is_default=False,
        ),
    ])

    drink_group = CustomizationGroup(
        product_id=product.id,
        name="Select Chilled Beverage",
        selection_type="single",
        is_required=True,
        min_selections=1,
        max_selections=1,
        display_order=3,
    )
    db.add(drink_group)
    db.flush()
    db.add_all([
        CustomizationOption(
            group_id=drink_group.id,
            name="Cola Next / Fizzup 1.5L Pitchers (Included)",
            price=0,
            is_default=True,
        ),
        CustomizationOption(
            group_id=drink_group.id,
            name="2x Fresh Mint Margaritas (+Rs. 240)",
            price=240,
            is_default=False,
        ),
    ])


def seed_database(db: Session) -> None:
    """Idempotent seed function that populates Cravora — Pizza & More sample development data."""
    if db.query(Category).count() > 0:
        # Ensure any legacy broken or non-food image URLs are healed in existing DB
        url_fixes = {
            "https://images.unsplash.com/photo-1573140247632-f8fd74997d5c?auto=format&fit=crop&w=900&q=80": "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1576107232684-1279f3908594?auto=format&fit=crop&w=900&q=80": "https://images.unsplash.com/photo-1585109649139-366815a0d713?auto=format&fit=crop&w=900&q=80",
        }
        changed = False
        for old_url, new_url in url_fixes.items():
            for cat in db.query(Category).filter(Category.image_url == old_url).all():
                cat.image_url = new_url
                changed = True
            for prod in db.query(Product).filter(Product.image_url == old_url).all():
                prod.image_url = new_url
                changed = True
        if changed:
            db.commit()
        return

    # 1. Roles & Permissions
    db.add_all([
        RolePermission(
            role_name="admin",
            description="Full platform administrator with menu, orders, branches, promotions, support & AI settings access",
            permissions_json=json.dumps(["*"]),
        ),
        RolePermission(
            role_name="staff",
            description="Branch operations manager with order status & kitchen queue permissions",
            permissions_json=json.dumps(["orders.read", "orders.update", "support.read", "support.reply"]),
        ),
        RolePermission(
            role_name="customer",
            description="Authenticated Cravora customer with ordering, loyalty & support access",
            permissions_json=json.dumps(["orders.create", "orders.own", "profile.manage", "loyalty.redeem"]),
        ),
    ])

    # 2. Users (Admin, Staff, Sample Customer)
    admin_user = User(
        email="admin@cravora.pk",
        phone="+92 300 1112728",
        full_name="Zainab Tariq (Cravora Admin)",
        password_hash=hash_password("CravoraAdmin!2026"),
        role="admin",
        loyalty_points=1200,
    )
    staff_user = User(
        email="kitchen@cravora.pk",
        phone="+92 321 5550199",
        full_name="Bilal Ahmed (Branch Operations)",
        password_hash=hash_password("CravoraStaff!2026"),
        role="staff",
        loyalty_points=0,
    )
    customer_user = User(
        email="hamza@example.com",
        phone="+92 333 5129081",
        full_name="Hamza Khan",
        password_hash=hash_password("Customer!2026"),
        role="customer",
        loyalty_points=450,
    )
    db.add_all([admin_user, staff_user, customer_user])
    db.flush()

    db.add_all([
        CustomerAddress(
            user_id=customer_user.id,
            label="Home (F-7)",
            recipient_name="Hamza Khan",
            phone="+92 333 5129081",
            house_number="House 14-B",
            street="Street 28",
            area="F-7/2",
            city="Islamabad",
            landmark="Near Jinnah Super Gol Market",
            delivery_instructions="Ring the black gate bell twice.",
            latitude=33.7215,
            longitude=73.0571,
            formatted_address="House 14-B, Street 28, F-7/2, Islamabad",
            is_default=True,
        ),
        CustomerAddress(
            user_id=customer_user.id,
            label="Office (Blue Area)",
            recipient_name="Hamza Khan",
            phone="+92 333 5129081",
            house_number="4th Floor, Evacuee Trust Plaza",
            street="Jinnah Avenue",
            area="Blue Area",
            city="Islamabad",
            landmark="Opposite Metro Bus Station",
            delivery_instructions="Leave with reception desk.",
            latitude=33.7138,
            longitude=73.0619,
            formatted_address="4th Floor, Jinnah Avenue, Blue Area, Islamabad",
            is_default=False,
        ),
    ])

    db.add(
        LoyaltyTransaction(
            user_id=customer_user.id,
            points_delta=450,
            transaction_type="earned",
            description="Welcome bonus & sample past order rewards",
        )
    )

    # 3. Branches & Delivery Zones (Verified coordinates in Islamabad, Rawalpindi, Lahore, Karachi)
    branches_data = [
        {
            "code": "ISB-F7",
            "name": "Cravora Flagship — F-7 Jinnah Super",
            "city": "Islamabad",
            "area": "F-7 Markaz",
            "address": "Plot 12-C, Bhittai Road, Jinnah Super Market, F-7 Markaz, Islamabad",
            "phone": "+92 (51) 265-4401",
            "email": "f7.islamabad@cravora.pk",
            "latitude": 33.7215,
            "longitude": 73.0571,
            "opening_time": "11:00",
            "closing_time": "03:00",
            "prep_time_mins": 18,
            "delivery_time_mins": 32,
            "zones": [
                {
                    "name": "Central Islamabad Core Polygon (F-5, F-6, F-7, F-8, G-6, G-7, Blue Area)",
                    "zone_type": "polygon",
                    "radius_km": 6.5,
                    "polygon_coords": [
                        [33.7550, 73.0150],
                        [33.7550, 73.1050],
                        [33.6850, 73.1050],
                        [33.6850, 73.0150],
                    ],
                    "base_delivery_fee": 140,
                    "per_km_fee": 20,
                    "min_order_amount": 600,
                    "free_delivery_threshold": 3000,
                    "estimated_mins": 30,
                },
                {
                    "name": "Greater Islamabad Extended Radius (F-10, F-11, G-10, G-11, E-7)",
                    "zone_type": "radius",
                    "radius_km": 9.5,
                    "polygon_coords": [],
                    "base_delivery_fee": 170,
                    "per_km_fee": 25,
                    "min_order_amount": 800,
                    "free_delivery_threshold": 3500,
                    "estimated_mins": 38,
                },
            ],
        },
        {
            "code": "ISB-I8",
            "name": "Cravora Express — I-8 Markaz",
            "city": "Islamabad",
            "area": "I-8 Markaz",
            "address": "Plaza 24, Habibi Chowk, I-8 Markaz, Islamabad",
            "phone": "+92 (51) 486-2290",
            "email": "i8.islamabad@cravora.pk",
            "latitude": 33.6682,
            "longitude": 73.0752,
            "opening_time": "11:00",
            "closing_time": "02:30",
            "prep_time_mins": 18,
            "delivery_time_mins": 30,
            "zones": [
                {
                    "name": "I-8, I-9, I-10, H-8 & Faizabad Zone",
                    "zone_type": "radius",
                    "radius_km": 7.5,
                    "polygon_coords": [],
                    "base_delivery_fee": 140,
                    "per_km_fee": 20,
                    "min_order_amount": 600,
                    "free_delivery_threshold": 2800,
                    "estimated_mins": 30,
                }
            ],
        },
        {
            "code": "RWP-SDR",
            "name": "Cravora Saddar & Cantt Lounge",
            "city": "Rawalpindi",
            "area": "Saddar Bank Road",
            "address": "44 Bank Road, Near Mall Road, Saddar Cantonment, Rawalpindi",
            "phone": "+92 (51) 556-8812",
            "email": "saddar.rwp@cravora.pk",
            "latitude": 33.5973,
            "longitude": 73.0479,
            "opening_time": "11:00",
            "closing_time": "02:00",
            "prep_time_mins": 20,
            "delivery_time_mins": 35,
            "zones": [
                {
                    "name": "Rawalpindi Cantt, Saddar, Satellite Town & Chaklala Zone",
                    "zone_type": "radius",
                    "radius_km": 8.5,
                    "polygon_coords": [],
                    "base_delivery_fee": 130,
                    "per_km_fee": 20,
                    "min_order_amount": 550,
                    "free_delivery_threshold": 2800,
                    "estimated_mins": 35,
                }
            ],
        },
        {
            "code": "RWP-BHR",
            "name": "Cravora Bahria Town Civic Center",
            "city": "Rawalpindi",
            "area": "Bahria Town Phase 4",
            "address": "Arena Boulevard, Civic Center Phase 4, Bahria Town, Rawalpindi",
            "phone": "+92 (51) 573-1900",
            "email": "bahria.rwp@cravora.pk",
            "latitude": 33.5512,
            "longitude": 73.1243,
            "opening_time": "11:30",
            "closing_time": "03:00",
            "prep_time_mins": 18,
            "delivery_time_mins": 30,
            "zones": [
                {
                    "name": "Bahria Town Phases 1–8 & DHA Phase 1–2 Zone",
                    "zone_type": "radius",
                    "radius_km": 8.0,
                    "polygon_coords": [],
                    "base_delivery_fee": 150,
                    "per_km_fee": 20,
                    "min_order_amount": 650,
                    "free_delivery_threshold": 3000,
                    "estimated_mins": 32,
                }
            ],
        },
        {
            "code": "LHR-GLB",
            "name": "Cravora MM Alam Flagship — Gulberg III",
            "city": "Lahore",
            "area": "Gulberg III",
            "address": "82-B MM Alam Road, Block B2, Gulberg III, Lahore",
            "phone": "+92 (42) 357-59900",
            "email": "gulberg.lahore@cravora.pk",
            "latitude": 31.5119,
            "longitude": 74.3519,
            "opening_time": "11:00",
            "closing_time": "03:30",
            "prep_time_mins": 20,
            "delivery_time_mins": 35,
            "zones": [
                {
                    "name": "Gulberg, Garden Town, Model Town, Cantt & DHA Phase 1–5 Zone",
                    "zone_type": "radius",
                    "radius_km": 10.5,
                    "polygon_coords": [],
                    "base_delivery_fee": 150,
                    "per_km_fee": 20,
                    "min_order_amount": 650,
                    "free_delivery_threshold": 3000,
                    "estimated_mins": 35,
                }
            ],
        },
        {
            "code": "KHI-CLF",
            "name": "Cravora Sea Breeze — Clifton Block 5",
            "city": "Karachi",
            "area": "Clifton Block 5",
            "address": "Plot F-19, Boat Basin Commercial, Block 5 Clifton, Karachi",
            "phone": "+92 (21) 358-64400",
            "email": "clifton.karachi@cravora.pk",
            "latitude": 24.8195,
            "longitude": 67.0281,
            "opening_time": "12:00",
            "closing_time": "04:00",
            "prep_time_mins": 20,
            "delivery_time_mins": 38,
            "zones": [
                {
                    "name": "Clifton, Bath Island & DHA Phase 1–8 Karachi Zone",
                    "zone_type": "radius",
                    "radius_km": 9.5,
                    "polygon_coords": [],
                    "base_delivery_fee": 160,
                    "per_km_fee": 20,
                    "min_order_amount": 700,
                    "free_delivery_threshold": 3200,
                    "estimated_mins": 38,
                }
            ],
        },
    ]

    branch_objs = []
    for b_info in branches_data:
        zones_raw = b_info.pop("zones")
        branch = Branch(**b_info, is_sample_data=True)
        db.add(branch)
        db.flush()
        for z_info in zones_raw:
            poly_str = json.dumps(z_info.pop("polygon_coords"))
            zone = DeliveryZone(branch_id=branch.id, polygon_coords=poly_str, **z_info)
            db.add(zone)
        branch_objs.append(branch)
    db.flush()

    # 4. All 16 Menu Categories required by Part 4
    categories_spec = [
        (
            "Signature & Specialty Pizzas",
            "signature-pizzas",
            "Our legendary crown-crust, kebab-stuffed, and Mughlai-inspired artisan pizzas.",
            "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80",
            "Crown",
            1,
        ),
        (
            "Pizza",
            "classic-pizzas",
            "Stone-baked hand-tossed classics loaded with 100% real stretched mozzarella.",
            "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=80",
            "Pizza",
            2,
        ),
        (
            "Burgers",
            "burgers",
            "Ultra-crunchy golden zinger fillets and double-smashed Angus beef burgers.",
            "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
            "Flame",
            3,
        ),
        (
            "Sandwiches",
            "sandwiches",
            "Oven-toasted artisan sub sandwiches stacked with smoked chicken, cheese, and Euro sauces.",
            "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=80",
            "Layers",
            4,
        ),
        (
            "Wraps & Rolls",
            "wraps-and-rolls",
            "Spinach and tortilla wraps baked golden with Bihari chicken, Arabic garlic sauce, and molten cheese.",
            "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=900&q=80",
            "Sparkles",
            5,
        ),
        (
            "Pasta & Lasagna",
            "pasta-and-lasagna",
            "Oven-bubbling fettuccine alfredo, crunchy chicken pasta, and multi-layered beef & chicken lasagna.",
            "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=900&q=80",
            "Utensils",
            6,
        ),
        (
            "Fried Chicken & Wings",
            "fried-chicken-and-wings",
            "Flaming peri-peri wings, honey-sriracha glazed drums, and spicy crispy broast.",
            "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=900&q=80",
            "Drumstick",
            7,
        ),
        (
            "Platters",
            "platters",
            "Showstopping sharing platters with rolls, wings, fries, calzone chunks, and trio dips.",
            "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80",
            "Award",
            8,
        ),
        (
            "Starters",
            "starters",
            "Cheesy stuffed calzones, garlic bread supreme, and mozzarella sticks.",
            "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&w=900&q=80",
            "Star",
            9,
        ),
        (
            "Fries & Sides",
            "fries-and-sides",
            "Lahori masala crinkle fries, animal-style loaded jalapeño fries, and curly wedges.",
            "https://images.unsplash.com/photo-1585109649139-366815a0d713?auto=format&fit=crop&w=900&q=80",
            "Zap",
            10,
        ),
        (
            "Dips & Sauces",
            "dips-and-sauces",
            "House-whipped roasted garlic herb, fiery peri-peri, smoky chipotle, and honey mustard dips.",
            "https://images.unsplash.com/photo-1472476443507-c7a5948772fc?auto=format&fit=crop&w=900&q=80",
            "Droplet",
            11,
        ),
        (
            "Desserts & Ice Cream",
            "desserts",
            "Belgian dark chocolate molten lava cake, Lotus Biscoff sundae, and fudge brownies.",
            "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=80",
            "IceCream",
            12,
        ),
        (
            "Beverages",
            "beverages",
            "Blended icy Mint Margarita, thick artisan shakes, and chilled soft drink pitchers.",
            "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=80",
            "CupSoda",
            13,
        ),
        (
            "Family Meals",
            "family-meals",
            "All-in-one feasts designed for 4 to 8 hungry cravings with pizzas, wings, pasta, and drinks.",
            "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80",
            "Users",
            14,
        ),
        (
            "Value Deals",
            "value-deals",
            "Unbeatable solo, duo, and student meal combos engineered for maximum satisfaction.",
            "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=900&q=80",
            "Tag",
            15,
        ),
        (
            "Limited-Time Promotions",
            "limited-time-promotions",
            "Seasonal chef creations and late-night craving drops available for a limited run.",
            "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=900&q=80",
            "Clock",
            16,
        ),
    ]

    cat_map = {}
    for name, slug, desc, img, icon, order in categories_spec:
        c = Category(
            name=name,
            slug=slug,
            description=desc,
            image_url=img,
            icon_name=icon,
            display_order=order,
            is_active=True,
        )
        db.add(c)
        db.flush()
        cat_map[slug] = c

    # 5. Products across all 16 categories
    products_data = [
        # --- Signature & Specialty Pizzas ---
        {
            "cat": "signature-pizzas",
            "name": "Royal Crown Crust Pizza",
            "slug": "royal-crown-crust-pizza",
            "short_description": "Iconic crown pockets stuffed with charcoal seekh kebab & molten cheddar, topped with smoky chicken tikka, olives, and garlic ranch swirl.",
            "full_description": "Our #1 bestseller across Pakistan. Hand-stretched artisan dough shaped into a regal crown filled with juicy chicken seekh kebab bites and liquid gold cheese, finished with charred tikka chunks, crisp capsicum, black olives, and our signature roasted garlic herb drizzle.",
            "image_url": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80",
            "base_price": 1690,
            "compare_at_price": 1950,
            "is_bestseller": True,
            "is_featured": True,
            "is_spicy": True,
            "calories": 920,
            "popularity_score": 99,
            "dietary_tags": ["Halal Certified", "Chef Signature", "High Protein"],
            "allergens": ["Gluten", "Dairy", "Egg"],
            "custom_type": "pizza",
        },
        {
            "cat": "signature-pizzas",
            "name": "Lahori Seekh Kebab Stuffed Supreme",
            "slug": "lahori-seekh-kebab-stuffed-supreme",
            "short_description": "Whole seekh kebab ring baked inside the crust edge, loaded with spicy bihari chicken, red onions, and green chilies.",
            "full_description": "Inspired by Lahore's midnight grill culture. Every slice finishes with a hot, spiced chicken seekh kebab baked right into the golden crust rim.",
            "image_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80",
            "base_price": 1750,
            "compare_at_price": 1990,
            "is_bestseller": True,
            "is_featured": True,
            "is_spicy": True,
            "calories": 960,
            "popularity_score": 96,
            "dietary_tags": ["Halal Certified", "Spicy Pakistani Grill"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "pizza",
        },
        {
            "cat": "signature-pizzas",
            "name": "Mughlai Malai Boti White Gold Pizza",
            "slug": "mughlai-malai-boti-pizza",
            "short_description": "Velvety cream-cheese & roasted garlic base topped with melt-in-mouth malai chicken boti, sweet corn, and fresh coriander.",
            "full_description": "Rich, creamy, and mildly spiced for lovers of authentic Mughlai malai boti paired with 100% stretched mozzarella.",
            "image_url": "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=900&q=80",
            "base_price": 1650,
            "compare_at_price": None,
            "is_bestseller": False,
            "is_featured": True,
            "is_spicy": False,
            "calories": 890,
            "popularity_score": 91,
            "dietary_tags": ["Halal Certified", "Creamy Mild"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "pizza",
        },
        {
            "cat": "signature-pizzas",
            "name": "Blazing Peri-Peri Flame Pizza",
            "slug": "blazing-peri-peri-flame-pizza",
            "short_description": "Flame-grilled peri-peri chicken strips, pickled jalapeños, red paprika, and tangential African bird's eye chili swirl.",
            "full_description": "Bold, zesty, and unapologetically fiery. Topped with house-made peri-peri glaze and double mozzarella.",
            "image_url": "https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?auto=format&fit=crop&w=900&q=80",
            "base_price": 1620,
            "compare_at_price": 1800,
            "is_bestseller": True,
            "is_featured": False,
            "is_spicy": True,
            "calories": 840,
            "popularity_score": 92,
            "dietary_tags": ["Halal Certified", "Fiery Hot"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "pizza",
        },
        # --- Classic Pizzas ---
        {
            "cat": "classic-pizzas",
            "name": "Smoked Beef Pepperoni Feast",
            "slug": "smoked-beef-pepperoni-feast",
            "short_description": "Edge-to-edge crispy cupped halal beef pepperoni over San Marzano style tomato sauce and aged mozzarella.",
            "full_description": "A timeless artisan classic featuring double-layered smoked beef pepperoni that crisps into flavorful cups in our stone deck oven.",
            "image_url": "https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=900&q=80",
            "base_price": 1490,
            "compare_at_price": None,
            "is_bestseller": True,
            "is_featured": False,
            "is_spicy": False,
            "calories": 870,
            "popularity_score": 90,
            "dietary_tags": ["Halal Certified"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "pizza",
        },
        {
            "cat": "classic-pizzas",
            "name": "Charcoal Fajita Sicilian Pizza",
            "slug": "charcoal-fajita-sicilian-pizza",
            "short_description": "Mexican-spiced fajita chicken, bell peppers, red onions, black olives, and oregano-infused mozzarella.",
            "full_description": "Pakistan's beloved fajita flavor elevated with smoky char-grilled chicken and crisp garden vegetables.",
            "image_url": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=900&q=80",
            "base_price": 1390,
            "compare_at_price": 1550,
            "is_bestseller": False,
            "is_featured": False,
            "is_spicy": True,
            "calories": 810,
            "popularity_score": 85,
            "dietary_tags": ["Halal Certified"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "pizza",
        },
        {
            "cat": "classic-pizzas",
            "name": "Garden Harvest Margherita & Burrata (Veg)",
            "slug": "garden-harvest-margherita-veg",
            "short_description": "Vine-ripened tomato sauce, fresh basil leaves, roasted mushrooms, sweet corn, olives, and creamy mozzarella.",
            "full_description": "100% Vegetarian artisan pizza crafted with cold-pressed olive oil, fresh basil, and stone-baked mozzarella.",
            "image_url": "https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?auto=format&fit=crop&w=900&q=80",
            "base_price": 1290,
            "compare_at_price": None,
            "is_bestseller": False,
            "is_featured": False,
            "is_vegetarian": True,
            "is_spicy": False,
            "calories": 730,
            "popularity_score": 78,
            "dietary_tags": ["Vegetarian", "Halal Certified"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "pizza",
        },
        # --- Burgers ---
        {
            "cat": "burgers",
            "name": "Cravora Monster Crunch Zinger",
            "slug": "cravora-monster-crunch-zinger",
            "short_description": "Massive buttermilk-brined whole chicken thigh fillet fried golden, topped with molten cheddar, fiery chipotle, and iceberg on a brioche bun.",
            "full_description": "Shatteringly crisp outside, juicy and tender inside. Served on a butter-toasted potato brioche bun with house-made smoky chipotle sauce.",
            "image_url": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=900&q=80",
            "base_price": 790,
            "compare_at_price": 890,
            "is_bestseller": True,
            "is_featured": True,
            "is_spicy": True,
            "calories": 680,
            "popularity_score": 97,
            "dietary_tags": ["Halal Certified", "Signature Crunch"],
            "allergens": ["Gluten", "Dairy", "Egg"],
            "custom_type": "burger",
        },
        {
            "cat": "burgers",
            "name": "Bazooka Fiery Lava Chicken Burger",
            "slug": "bazooka-fiery-lava-burger",
            "short_description": "Crispy spicy fillet drenched in warm nacho cheese lava, jalapeño relish, and crunchy Doritos-style tortilla strips.",
            "full_description": "Built for bold cravings: a towering crunch burger overflowing with warm cheddar lava sauce and pickled jalapeños.",
            "image_url": "https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=900&q=80",
            "base_price": 880,
            "compare_at_price": None,
            "is_bestseller": True,
            "is_featured": True,
            "is_spicy": True,
            "calories": 790,
            "popularity_score": 94,
            "dietary_tags": ["Halal Certified", "Extra Cheesy"],
            "allergens": ["Gluten", "Dairy", "Egg"],
            "custom_type": "burger",
        },
        {
            "cat": "burgers",
            "name": "Oklahoma Double Smash Beef Burger",
            "slug": "oklahoma-double-smash-beef-burger",
            "short_description": "Two lacy-edged smashed prime beef patties seared with shaved white onions, double American cheese, and dill pickles.",
            "full_description": "100% grass-fed halal beef smashed thin on a scorching griddle for caramelized crust edges and juicy flavor.",
            "image_url": "https://images.unsplash.com/photo-1553979459-d2229ba7433b?auto=format&fit=crop&w=900&q=80",
            "base_price": 990,
            "compare_at_price": 1150,
            "is_bestseller": False,
            "is_featured": False,
            "is_spicy": False,
            "calories": 820,
            "popularity_score": 89,
            "dietary_tags": ["Halal Certified", "High Protein"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "burger",
        },
        # --- Sandwiches ---
        {
            "cat": "sandwiches",
            "name": "Euro Smoked Chicken Sub Sandwich",
            "slug": "euro-smoked-chicken-sub-sandwich",
            "short_description": "Oven-baked crusty baguette filled with smoked chicken strips, beef pepperoni, black olives, sweet corn, and thousand-island garlic glaze.",
            "full_description": "Toasted until golden and bubbling with melted mozzarella, served with crispy skin-on potato chips.",
            "image_url": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=900&q=80",
            "base_price": 850,
            "compare_at_price": None,
            "is_bestseller": True,
            "is_featured": False,
            "is_spicy": False,
            "calories": 640,
            "popularity_score": 88,
            "dietary_tags": ["Halal Certified"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "burger",
        },
        {
            "cat": "sandwiches",
            "name": "Mexican Club Grill Sandwich",
            "slug": "mexican-club-grill-sandwich",
            "short_description": "Triple-decker artisan sourdough stacked with char-grilled fajita chicken, fried egg, cheddar, and chipotle slaw.",
            "full_description": "A hearty cafe-style club sandwich served with golden fries and garlic herb dip.",
            "image_url": "https://images.unsplash.com/photo-1554433607-66b5efe9d304?auto=format&fit=crop&w=900&q=80",
            "base_price": 820,
            "compare_at_price": None,
            "is_bestseller": False,
            "is_featured": False,
            "is_spicy": True,
            "calories": 670,
            "popularity_score": 81,
            "dietary_tags": ["Halal Certified"],
            "allergens": ["Gluten", "Dairy", "Egg"],
            "custom_type": "burger",
        },
        # --- Wraps & Rolls ---
        {
            "cat": "wraps-and-rolls",
            "name": "Bihari Spin-Roll Platter (4 Pcs)",
            "slug": "bihari-spin-roll-platter",
            "short_description": "Four oven-baked tortilla pinwheel rolls stuffed with smoky Bihari chicken, mozzarella, jalapeños, and creamy garlic toum.",
            "full_description": "A cult-favorite Pakistani fast-food classic! Brushed with garlic butter and served with two tubs of signature white garlic dip.",
            "image_url": "https://images.unsplash.com/photo-1626700051175-6818013e1d4f?auto=format&fit=crop&w=900&q=80",
            "base_price": 760,
            "compare_at_price": 850,
            "is_bestseller": True,
            "is_featured": True,
            "is_spicy": True,
            "calories": 610,
            "popularity_score": 95,
            "dietary_tags": ["Halal Certified", "Fan Favorite"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "burger",
        },
        {
            "cat": "wraps-and-rolls",
            "name": "Arabic Crispy Zinger Tortilla Wrap",
            "slug": "arabic-crispy-zinger-wrap",
            "short_description": "Toasted jumbo tortilla wrapped around crunchy zinger tenders, seasoned fries, pickled cucumbers, and smoky garlic sauce.",
            "full_description": "Grilled on a panini press for a crisp exterior and warm, melty interior.",
            "image_url": "https://images.unsplash.com/photo-1562967914-608f82629710?auto=format&fit=crop&w=900&q=80",
            "base_price": 690,
            "compare_at_price": None,
            "is_bestseller": False,
            "is_featured": False,
            "is_spicy": True,
            "calories": 580,
            "popularity_score": 84,
            "dietary_tags": ["Halal Certified"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "burger",
        },
        # --- Pasta & Lasagna ---
        {
            "cat": "pasta-and-lasagna",
            "name": "Crunchy Chicken Oven-Baked Pasta",
            "slug": "crunchy-chicken-oven-baked-pasta",
            "short_description": "Penne pasta tossed in velvety white cheddar alfredo sauce, baked under a blanket of mozzarella and topped with crispy zinger strips.",
            "full_description": "The ultimate comfort bowl: rich, bubbly cheese sauce meets crunchy golden chicken strips.",
            "image_url": "https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=900&q=80",
            "base_price": 920,
            "compare_at_price": 1050,
            "is_bestseller": True,
            "is_featured": True,
            "is_spicy": False,
            "calories": 780,
            "popularity_score": 93,
            "dietary_tags": ["Halal Certified", "Creamy Comfort"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "none",
        },
        {
            "cat": "pasta-and-lasagna",
            "name": "Flaming Arrabbiata Lasagna",
            "slug": "flaming-arrabbiata-lasagna",
            "short_description": "Layered pasta sheets with spiced chicken mince, béchamel cream, smoky marinara, and blistered mozzarella.",
            "full_description": "Baked to order in individual cast-iron trays and served with a warm garlic bread slice.",
            "image_url": "https://images.unsplash.com/photo-1574894709920-11b28e7367e3?auto=format&fit=crop&w=900&q=80",
            "base_price": 980,
            "compare_at_price": None,
            "is_bestseller": False,
            "is_featured": False,
            "is_spicy": True,
            "calories": 810,
            "popularity_score": 83,
            "dietary_tags": ["Halal Certified"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "none",
        },
        # --- Fried Chicken & Wings ---
        {
            "cat": "fried-chicken-and-wings",
            "name": "Flaming Peri-Peri Oven Wings (8 Pcs)",
            "slug": "flaming-peri-peri-oven-wings",
            "short_description": "Eight jumbo chicken wings marinated for 24 hours in fiery peri-peri spices and roasted to juicy perfection.",
            "full_description": "Served piping hot with cooling garlic ranch dip.",
            "image_url": "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=900&q=80",
            "base_price": 750,
            "compare_at_price": None,
            "is_bestseller": True,
            "is_featured": False,
            "is_spicy": True,
            "calories": 540,
            "popularity_score": 88,
            "dietary_tags": ["Halal Certified", "High Protein"],
            "allergens": ["Dairy"],
            "custom_type": "none",
        },
        {
            "cat": "fried-chicken-and-wings",
            "name": "Honey Sriracha Crispy Tenders (6 Pcs)",
            "slug": "honey-sriracha-crispy-tenders",
            "short_description": "Six crunchy whole-muscle chicken tenders tossed in sweet-heat wildflower honey and sriracha glaze, topped with toasted sesame.",
            "full_description": "Zero bones, 100% crunch and sweet-fiery flavor.",
            "image_url": "https://images.unsplash.com/photo-1562967916-eb82221dfb92?auto=format&fit=crop&w=900&q=80",
            "base_price": 780,
            "compare_at_price": None,
            "is_bestseller": False,
            "is_featured": False,
            "is_spicy": True,
            "calories": 590,
            "popularity_score": 82,
            "dietary_tags": ["Halal Certified"],
            "allergens": ["Gluten", "Sesame"],
            "custom_type": "none",
        },
        # --- Platters ---
        {
            "cat": "platters",
            "name": "Cravora Grand Showstopper Platter",
            "slug": "cravora-grand-showstopper-platter",
            "short_description": "4 Bihari Spin Rolls + 6 Peri-Peri Wings + 2 Calzone Chunks + Masala Fries + 3 Signature Dips.",
            "full_description": "Designed for sharing! Experience all of Cravora's signature oven-baked starters in one loaded platter.",
            "image_url": "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=900&q=80",
            "base_price": 1850,
            "compare_at_price": 2150,
            "is_bestseller": True,
            "is_featured": True,
            "is_spicy": True,
            "calories": 1450,
            "popularity_score": 95,
            "dietary_tags": ["Halal Certified", "Sharing Platter"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "none",
        },
        # --- Starters ---
        {
            "cat": "starters",
            "name": "Cheesy Stuffed Calzone Chunks (4 Pcs)",
            "slug": "cheesy-stuffed-calzone-chunks",
            "short_description": "Folded artisan pizza pockets stuffed with smoked chicken, beef pepperoni, olives, and molten mozzarella.",
            "full_description": "Baked golden and brushed with garlic herb butter and parmesan.",
            "image_url": "https://images.unsplash.com/photo-1534308983496-4fabb1a015ee?auto=format&fit=crop&w=900&q=80",
            "base_price": 790,
            "compare_at_price": None,
            "is_bestseller": True,
            "is_featured": False,
            "is_spicy": False,
            "calories": 680,
            "popularity_score": 86,
            "dietary_tags": ["Halal Certified"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "none",
        },
        {
            "cat": "starters",
            "name": "Garlic Bread Supreme with Jalapeños (4 Pcs)",
            "slug": "garlic-bread-supreme-jalapenos",
            "short_description": "Toasted French baguette slices slathered in roasted garlic butter, bubbling mozzarella, and pickled green chilies.",
            "full_description": "100% Vegetarian starter that pairs with every pizza and pasta.",
            "image_url": "https://images.unsplash.com/photo-1619535860434-ba1d8fa12536?auto=format&fit=crop&w=900&q=80",
            "base_price": 490,
            "compare_at_price": None,
            "is_vegetarian": True,
            "is_spicy": True,
            "calories": 440,
            "popularity_score": 80,
            "dietary_tags": ["Vegetarian", "Halal Certified"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "none",
        },
        # --- Fries & Sides ---
        {
            "cat": "fries-and-sides",
            "name": "Animal-Style Tikka Loaded Fries",
            "slug": "animal-style-tikka-loaded-fries",
            "short_description": "Crispy skin-on fries smothered in molten cheddar sauce, charcoal chicken tikka chunks, jalapeños, and chipotle drizzle.",
            "full_description": "A meal on its own! Served in a foil heat-lock tray so every fry stays hot and cheesy.",
            "image_url": "https://images.unsplash.com/photo-1585109649139-366815a0d713?auto=format&fit=crop&w=900&q=80",
            "base_price": 680,
            "compare_at_price": 750,
            "is_bestseller": True,
            "is_featured": True,
            "is_spicy": True,
            "calories": 720,
            "popularity_score": 92,
            "dietary_tags": ["Halal Certified"],
            "allergens": ["Dairy"],
            "custom_type": "none",
        },
        {
            "cat": "fries-and-sides",
            "name": "Lahori Chatpata Masala Fries",
            "slug": "lahori-chatpata-masala-fries",
            "short_description": "Golden crinkle-cut fries tossed in our house chaat-paprika spice blend.",
            "full_description": "100% Vegetarian, crispy, and addictive.",
            "image_url": "https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?auto=format&fit=crop&w=900&q=80",
            "base_price": 390,
            "compare_at_price": None,
            "is_vegetarian": True,
            "is_spicy": True,
            "calories": 410,
            "popularity_score": 85,
            "dietary_tags": ["Vegetarian", "Halal Certified"],
            "allergens": [],
            "custom_type": "none",
        },
        # --- Dips & Sauces ---
        {
            "cat": "dips-and-sauces",
            "name": "Cravora White Garlic Herb Dip",
            "slug": "cravora-white-garlic-herb-dip",
            "short_description": "Our famous rich, velvety roasted garlic and parsley dipping sauce.",
            "full_description": "Prepared fresh daily in small batches. Essential for crust dipping!",
            "image_url": "https://images.unsplash.com/photo-1472476443507-c7a5948772fc?auto=format&fit=crop&w=900&q=80",
            "base_price": 120,
            "compare_at_price": None,
            "is_bestseller": True,
            "is_vegetarian": True,
            "calories": 160,
            "popularity_score": 96,
            "dietary_tags": ["Vegetarian", "Halal Certified"],
            "allergens": ["Dairy", "Egg"],
            "custom_type": "none",
        },
        {
            "cat": "dips-and-sauces",
            "name": "Smoky Chipotle & Peri-Peri Duo Pack",
            "slug": "smoky-chipotle-peri-peri-duo",
            "short_description": "Two signature dipping tubs: smoky Mexican chipotle mayo and fiery peri-peri glaze.",
            "full_description": "Double the flavor for wings, crusts, and fries.",
            "image_url": "https://images.unsplash.com/photo-1585325701956-60dd9c8553bc?auto=format&fit=crop&w=900&q=80",
            "base_price": 210,
            "compare_at_price": None,
            "is_vegetarian": True,
            "is_spicy": True,
            "calories": 240,
            "popularity_score": 84,
            "dietary_tags": ["Vegetarian", "Halal Certified"],
            "allergens": ["Egg"],
            "custom_type": "none",
        },
        # --- Desserts & Ice Cream ---
        {
            "cat": "desserts",
            "name": "Belgian Molten Chocolate Lava Cake",
            "slug": "belgian-molten-chocolate-lava-cake",
            "short_description": "Warm dark chocolate sponge with a flowing Belgian fudge center, dusted with cocoa and served with vanilla bean gelato.",
            "full_description": "Baked fresh to order so the rich chocolate center pours out the moment your spoon breaks the crust.",
            "image_url": "https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=900&q=80",
            "base_price": 590,
            "compare_at_price": 680,
            "is_bestseller": True,
            "is_featured": True,
            "is_vegetarian": True,
            "calories": 520,
            "popularity_score": 94,
            "dietary_tags": ["Vegetarian", "Halal Certified"],
            "allergens": ["Gluten", "Dairy", "Egg"],
            "custom_type": "none",
        },
        {
            "cat": "desserts",
            "name": "Lotus Biscoff Caramel Swirl Sundae",
            "slug": "lotus-biscoff-caramel-sundae",
            "short_description": "Creamy soft-serve gelato layered with crushed Lotus Biscoff cookies and warm speculoos butter.",
            "full_description": "The ultimate sweet finale after a spicy meal.",
            "image_url": "https://images.unsplash.com/photo-1563805042-7684c019e1cb?auto=format&fit=crop&w=900&q=80",
            "base_price": 540,
            "compare_at_price": None,
            "is_vegetarian": True,
            "calories": 480,
            "popularity_score": 87,
            "dietary_tags": ["Vegetarian", "Halal Certified"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "none",
        },
        # --- Beverages ---
        {
            "cat": "beverages",
            "name": "Icy Hill-Station Mint Margarita",
            "slug": "icy-mint-margarita",
            "short_description": "Fresh hand-picked garden mint leaves blended with Himalayan black salt, lime juice, crushed ice, and sparkling soda.",
            "full_description": "Islamabad's favorite refresher! Blended fresh upon order.",
            "image_url": "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=900&q=80",
            "base_price": 320,
            "compare_at_price": None,
            "is_bestseller": True,
            "is_vegetarian": True,
            "calories": 140,
            "popularity_score": 95,
            "dietary_tags": ["Vegetarian", "Halal Certified", "Freshly Blended"],
            "allergens": [],
            "custom_type": "none",
        },
        {
            "cat": "beverages",
            "name": "Belgian Chocolate Hazelnut Thick Shake",
            "slug": "belgian-chocolate-hazelnut-shake",
            "short_description": "Rich Nutella-inspired hazelnut chocolate spun with full-cream gelato and topped with whipped cream.",
            "full_description": "Thick, indulgent, and served chilled in a sealed cup.",
            "image_url": "https://images.unsplash.com/photo-1572490122747-3968b75cc699?auto=format&fit=crop&w=900&q=80",
            "base_price": 520,
            "compare_at_price": None,
            "is_vegetarian": True,
            "calories": 560,
            "popularity_score": 86,
            "dietary_tags": ["Vegetarian", "Halal Certified"],
            "allergens": ["Dairy", "Nuts"],
            "custom_type": "none",
        },
        # --- Family Meals ---
        {
            "cat": "family-meals",
            "name": "Grand Family Royal Feast (Serves 5–6)",
            "slug": "grand-family-royal-feast",
            "short_description": "2 Large 13\" Signature Pizzas + 1 Crunchy Baked Pasta + 8 Peri-Peri Wings + 1.5L Drink Pitcher.",
            "full_description": "Our best-selling family celebration bundle! Customize your pizza flavors, side choice, and drinks.",
            "image_url": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=900&q=80",
            "base_price": 4290,
            "compare_at_price": 5150,
            "is_bestseller": True,
            "is_featured": True,
            "is_spicy": True,
            "calories": 3800,
            "popularity_score": 98,
            "dietary_tags": ["Halal Certified", "Family Bundle", "Save Rs. 860"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "combo",
        },
        # --- Value Deals ---
        {
            "cat": "value-deals",
            "name": "Solo Craving Box (Under Rs. 1,200)",
            "slug": "solo-craving-box",
            "short_description": "1 Monster Crunch Zinger Burger + 2 Bihari Spin Rolls + Masala Fries + Chilled Drink.",
            "full_description": "Unbeatable value for one hungry appetite! Includes burger, oven-baked rolls, fries, and beverage.",
            "image_url": "https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?auto=format&fit=crop&w=900&q=80",
            "base_price": 1150,
            "compare_at_price": 1420,
            "is_bestseller": True,
            "is_featured": True,
            "is_spicy": True,
            "calories": 1120,
            "popularity_score": 97,
            "dietary_tags": ["Halal Certified", "Best Value Solo"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "combo",
        },
        {
            "cat": "value-deals",
            "name": "Duo Pizza & Pasta Date Deal (Serves 2–3)",
            "slug": "duo-pizza-pasta-deal",
            "short_description": "1 Regular 10\" Signature Crown Pizza + 1 Crunchy Baked Pasta + 4 Garlic Breads + 2 Mint Margaritas.",
            "full_description": "The ultimate duo combo pairing our #1 Royal Crown Pizza with Creamy Oven-Baked Pasta.",
            "image_url": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80",
            "base_price": 2490,
            "compare_at_price": 2980,
            "is_bestseller": True,
            "is_featured": True,
            "is_spicy": True,
            "calories": 1950,
            "popularity_score": 96,
            "dietary_tags": ["Halal Certified", "Duo Saver"],
            "allergens": ["Gluten", "Dairy"],
            "custom_type": "combo",
        },
        # --- Limited-Time Promotions ---
        {
            "cat": "limited-time-promotions",
            "name": "Midnight Craving Hot Box (Limited Drop)",
            "slug": "midnight-craving-hot-box",
            "short_description": "1 Regular Seekh Kebab Stuffed Pizza + 4 Peri-Peri Wings + 1 Belgian Molten Lava Cake.",
            "full_description": "Available during our seasonal Craving Campaign! Includes savory stuffed-crust pizza, wings, and warm molten chocolate cake.",
            "image_url": "https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?auto=format&fit=crop&w=900&q=80",
            "base_price": 2190,
            "compare_at_price": 2650,
            "is_bestseller": False,
            "is_featured": True,
            "is_new": True,
            "is_spicy": True,
            "calories": 1820,
            "popularity_score": 91,
            "dietary_tags": ["Halal Certified", "Limited Time Drop"],
            "allergens": ["Gluten", "Dairy", "Egg"],
            "custom_type": "combo",
        },
    ]

    created_products = []
    for p_item in products_data:
        cat_slug = p_item.pop("cat")
        custom_type = p_item.pop("custom_type")
        dietary_str = json.dumps(p_item.pop("dietary_tags", []))
        allergens_str = json.dumps(p_item.pop("allergens", []))
        prod = Product(
            category_id=cat_map[cat_slug].id,
            dietary_tags=dietary_str,
            allergens=allergens_str,
            is_sample_data=True,
            **p_item,
        )
        db.add(prod)
        db.flush()

        if custom_type == "pizza":
            attach_pizza_customizations(db, prod, prod.base_price)
        elif custom_type == "burger":
            attach_burger_or_wrap_customizations(db, prod, prod.base_price)
        elif custom_type == "combo":
            attach_combo_customizations(db, prod)

        created_products.append(prod)

    db.flush()

    # 6. Coupons & Promotions
    now = datetime.now(timezone.utc)
    coupons_data = [
        Coupon(
            code="CRAVORA20",
            title="20% OFF Launch Celebration",
            description="Enjoy 20% off your order (up to Rs. 600 discount) on orders above Rs. 1,500.",
            discount_type="percentage",
            discount_value=20,
            min_order_amount=1500,
            max_discount_amount=600,
            start_date=now - timedelta(days=5),
            end_date=now + timedelta(days=14),
            usage_limit=500,
            used_count=42,
            per_user_limit=3,
            fulfillment_restriction="all",
            is_active=True,
            is_flash_deal=True,
            banner_image_url="https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80",
            is_sample_data=True,
        ),
        Coupon(
            code="CROWN300",
            title="Flat Rs. 300 OFF Crown & Specialty Orders",
            description="Instant Rs. 300 discount when your cart subtotal reaches Rs. 1,600 or more.",
            discount_type="fixed",
            discount_value=300,
            min_order_amount=1600,
            max_discount_amount=300,
            start_date=now - timedelta(days=10),
            end_date=now + timedelta(days=30),
            usage_limit=1000,
            used_count=89,
            per_user_limit=5,
            fulfillment_restriction="all",
            is_active=True,
            is_flash_deal=False,
            is_sample_data=True,
        ),
        Coupon(
            code="FAMILY500",
            title="Rs. 500 OFF Family Feast Orders",
            description="Save a flat Rs. 500 on family & group orders of Rs. 3,200 or above.",
            discount_type="fixed",
            discount_value=500,
            min_order_amount=3200,
            max_discount_amount=500,
            start_date=now - timedelta(days=7),
            end_date=now + timedelta(days=25),
            usage_limit=300,
            used_count=19,
            per_user_limit=3,
            fulfillment_restriction="all",
            is_active=True,
            is_flash_deal=False,
            is_sample_data=True,
        ),
        Coupon(
            code="PICKUP15",
            title="15% OFF Branch Self-Pickup",
            description="Skip the wait! Get 15% off (up to Rs. 450) when you select Branch Pickup at checkout.",
            discount_type="percentage",
            discount_value=15,
            min_order_amount=1000,
            max_discount_amount=450,
            start_date=now - timedelta(days=5),
            end_date=now + timedelta(days=45),
            usage_limit=800,
            used_count=31,
            per_user_limit=5,
            fulfillment_restriction="pickup",
            is_active=True,
            is_flash_deal=False,
            is_sample_data=True,
        ),
    ]
    db.add_all(coupons_data)
    db.flush()

    # 7. Sample Order for Hamza Khan so Order Tracking & AI Order Lookup work out-of-the-box
    sample_order = Order(
        order_reference="CRV-20261020-1001",
        user_id=customer_user.id,
        guest_verification_token="tok_sample_1001",
        customer_name=customer_user.full_name,
        customer_phone=customer_user.phone,
        customer_email=customer_user.email,
        fulfillment_type="delivery",
        branch_id=branch_objs[0].id,
        delivery_address_snapshot=json.dumps({
            "house_number": "House 14-B",
            "street": "Street 28",
            "area": "F-7/2",
            "city": "Islamabad",
            "formatted_address": "House 14-B, Street 28, F-7/2, Islamabad",
        }),
        delivery_lat=33.7215,
        delivery_lng=73.0571,
        delivery_distance_km=1.2,
        subtotal=2480,
        discount_amount=300,
        coupon_code="CROWN300",
        delivery_fee=164,
        tax_amount=349,
        total_amount=2693,
        loyalty_points_earned=105,
        loyalty_points_redeemed=0,
        payment_method="cod",
        payment_status="pending",
        status="preparing",
        order_notes="Extra garlic herb dip on the side please!",
        estimated_ready_at=now + timedelta(minutes=25),
    )
    db.add(sample_order)
    db.flush()

    db.add_all([
        OrderItem(
            order_id=sample_order.id,
            product_id=created_products[0].id,
            product_name_snapshot=created_products[0].name,
            product_image_snapshot=created_products[0].image_url,
            variant_name_snapshot='Regular 10"',
            base_price_snapshot=1690,
            customizations_snapshot=json.dumps([
                {"group_name": "Artisan Crust Selection", "option_name": "Hand-Tossed Classic Crust", "price": 0}
            ]),
            quantity=1,
            unit_price=1690,
            total_price=1690,
        ),
        OrderItem(
            order_id=sample_order.id,
            product_id=created_products[7].id,
            product_name_snapshot=created_products[7].name,
            product_image_snapshot=created_products[7].image_url,
            variant_name_snapshot="Single Classic",
            base_price_snapshot=790,
            customizations_snapshot=json.dumps([]),
            quantity=1,
            unit_price=790,
            total_price=790,
        ),
    ])

    db.add_all([
        OrderStatusHistory(
            order_id=sample_order.id,
            status="order_placed",
            note="Order received and verified by Cravora checkout engine.",
            created_at=now - timedelta(minutes=14),
        ),
        OrderStatusHistory(
            order_id=sample_order.id,
            status="order_confirmed",
            note="Confirmed by Cravora Flagship — F-7 Jinnah Super kitchen.",
            created_at=now - timedelta(minutes=11),
        ),
        OrderStatusHistory(
            order_id=sample_order.id,
            status="preparing",
            note="Hand-stretching dough and firing stone deck oven at 450°C.",
            created_at=now - timedelta(minutes=6),
        ),
    ])

    db.add(
        Payment(
            order_id=sample_order.id,
            provider="cod",
            transaction_reference="PAY-CRV-20261020-1001-COD",
            amount=2693,
            currency="PKR",
            status="pending_cod",
            signature_verified=True,
        )
    )

    # 8. Sample Support Ticket
    sample_ticket = SupportTicket(
        ticket_reference="TKT-10420",
        user_id=customer_user.id,
        order_id=sample_order.id,
        customer_name=customer_user.full_name,
        customer_email=customer_user.email,
        customer_phone=customer_user.phone,
        category="general_inquiry",
        priority="medium",
        subject="Add extra chili flakes to my F-7 order",
        status="in_progress",
        escalated_from_ai=False,
    )
    db.add(sample_ticket)
    db.flush()
    db.add_all([
        SupportMessage(
            ticket_id=sample_ticket.id,
            sender_role="customer",
            sender_name=customer_user.full_name,
            message="Hi team, could you please include extra red chili flakes and oregano packets with CRV-20261020-1001?",
        ),
        SupportMessage(
            ticket_id=sample_ticket.id,
            sender_role="admin",
            sender_name="Zainab Tariq (Cravora Care)",
            message="Absolutely Hamza! We have notified the F-7 dispatch counter to pack extra oregano and red chili sachets with your box.",
        ),
    ])

    db.commit()
