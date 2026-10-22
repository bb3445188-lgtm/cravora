import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Branch,
    Category,
    Coupon,
    CustomizationGroup,
    CustomizationOption,
    Order,
    Product,
    ProductVariant,
    User,
)
from app.schemas import (
    CartCalculationRequest,
    CartCalculationResponse,
    SelectedItemInput,
    ValidatedCartItemOut,
    ValidatedOptionDetail,
)
from app.services.maps import evaluate_delivery_coverage


def serialize_product(product: Product) -> Dict[str, Any]:
    try:
        dietary = json.loads(product.dietary_tags or "[]")
    except Exception:
        dietary = []
    try:
        allergens = json.loads(product.allergens or "[]")
    except Exception:
        allergens = []

    return {
        "id": product.id,
        "category_id": product.category_id,
        "category_name": product.category.name if product.category else None,
        "category_slug": product.category.slug if product.category else None,
        "name": product.name,
        "slug": product.slug,
        "short_description": product.short_description,
        "full_description": product.full_description,
        "image_url": product.image_url,
        "base_price": product.base_price,
        "compare_at_price": product.compare_at_price,
        "is_available": product.is_available and product.stock_qty > 0,
        "is_bestseller": product.is_bestseller,
        "is_featured": product.is_featured,
        "is_new": product.is_new,
        "is_vegetarian": product.is_vegetarian,
        "is_spicy": product.is_spicy,
        "calories": product.calories,
        "prep_time_mins": product.prep_time_mins,
        "dietary_tags": dietary,
        "allergens": allergens,
        "stock_qty": product.stock_qty,
        "popularity_score": product.popularity_score,
        "is_sample_data": product.is_sample_data,
        "variants": [
            {
                "id": v.id,
                "product_id": v.product_id,
                "name": v.name,
                "code": v.code,
                "price_modifier": v.price_modifier,
                "absolute_price": v.absolute_price,
                "serves_label": v.serves_label,
                "is_default": v.is_default,
                "is_available": v.is_available,
            }
            for v in product.variants
        ],
        "customization_groups": [
            {
                "id": g.id,
                "product_id": g.product_id,
                "name": g.name,
                "selection_type": g.selection_type,
                "is_required": g.is_required,
                "min_selections": g.min_selections,
                "max_selections": g.max_selections,
                "display_order": g.display_order,
                "options": [
                    {
                        "id": o.id,
                        "group_id": o.group_id,
                        "name": o.name,
                        "description": o.description,
                        "price": o.price,
                        "is_default": o.is_default,
                        "is_available": o.is_available,
                        "calories": o.calories,
                    }
                    for o in g.options
                ],
            }
            for g in product.customization_groups
        ],
    }


def validate_and_price_item(db: Session, item_input: SelectedItemInput) -> Tuple[ValidatedCartItemOut, int]:
    """Validate a single cart item against the database and compute its authoritative price.
    Returns (ValidatedCartItemOut, category_id).
    """
    product = db.query(Product).filter(Product.id == item_input.product_id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product ID {item_input.product_id} does not exist.",
        )
    if not product.is_available or product.stock_qty < item_input.quantity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"'{product.name}' is currently out of stock or unavailable in the requested quantity.",
        )

    # Resolve variant
    base_unit_price = product.base_price
    variant_id = None
    variant_name = None

    if product.variants:
        chosen_variant: Optional[ProductVariant] = None
        if item_input.variant_id is not None:
            chosen_variant = next(
                (v for v in product.variants if v.id == item_input.variant_id),
                None,
            )
            if not chosen_variant or not chosen_variant.is_available:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Selected size/variant is invalid or unavailable for '{product.name}'.",
                )
        else:
            chosen_variant = next(
                (v for v in product.variants if v.is_default and v.is_available),
                product.variants[0],
            )
        if chosen_variant:
            variant_id = chosen_variant.id
            variant_name = chosen_variant.name
            if chosen_variant.absolute_price is not None:
                base_unit_price = chosen_variant.absolute_price
            else:
                base_unit_price = product.base_price + chosen_variant.price_modifier

    # Validate customization options
    selected_option_ids_set = set(item_input.selected_option_ids or [])
    validated_options: List[ValidatedOptionDetail] = []

    for group in product.customization_groups:
        group_options_map = {opt.id: opt for opt in group.options}
        chosen_in_group = [
            group_options_map[oid]
            for oid in selected_option_ids_set
            if oid in group_options_map
        ]

        # If group is required and user didn't pass an option, auto-select default option if available
        if group.is_required and not chosen_in_group:
            default_opt = next((o for o in group.options if o.is_default and o.is_available), None)
            if not default_opt and group.options:
                default_opt = next((o for o in group.options if o.is_available), None)
            if default_opt:
                chosen_in_group = [default_opt]
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Selection required for '{group.name}' on '{product.name}'.",
                )

        if len(chosen_in_group) > group.max_selections:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Too many selections for '{group.name}' on '{product.name}' (maximum {group.max_selections}).",
            )

        for opt in chosen_in_group:
            if not opt.is_available:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Option '{opt.name}' is currently unavailable.",
                )
            validated_options.append(
                ValidatedOptionDetail(
                    option_id=opt.id,
                    group_name=group.name,
                    option_name=opt.name,
                    price=opt.price,
                )
            )
            selected_option_ids_set.discard(opt.id)

    # Reject any foreign option IDs that do not belong to this product
    if selected_option_ids_set:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid customization option ID(s) {list(selected_option_ids_set)} for product '{product.name}'.",
        )

    # Optional Half-and-Half second pizza flavor validation
    if item_input.half_and_half_product_id:
        second_pizza = (
            db.query(Product)
            .filter(Product.id == item_input.half_and_half_product_id, Product.is_available == True)
            .first()
        )
        if second_pizza:
            validated_options.append(
                ValidatedOptionDetail(
                    option_id=0,
                    group_name="Half & Half Flavor",
                    option_name=f"Half {second_pizza.name}",
                    price=150,
                )
            )

    options_total = sum(o.price for o in validated_options)
    unit_price = base_unit_price + options_total
    line_total = unit_price * item_input.quantity

    return (
        ValidatedCartItemOut(
            product_id=product.id,
            product_name=product.name,
            product_slug=product.slug,
            product_image=product.image_url,
            variant_id=variant_id,
            variant_name=variant_name,
            base_unit_price=base_unit_price,
            options=validated_options,
            options_total_price=options_total,
            unit_price=unit_price,
            quantity=item_input.quantity,
            line_total=line_total,
            special_instructions=item_input.special_instructions,
        ),
        product.category_id,
    )


def validate_coupon_code(
    db: Session,
    code: str,
    subtotal: int,
    category_ids: List[int],
    fulfillment_type: str = "delivery",
    branch_id: Optional[int] = None,
    user: Optional[User] = None,
) -> Tuple[bool, int, str, Optional[Coupon]]:
    """Validate a coupon code and return (is_valid, discount_amount, message, coupon_obj)."""
    clean_code = (code or "").strip().upper()
    if not clean_code:
        return False, 0, "", None

    coupon = db.query(Coupon).filter(Coupon.code == clean_code).first()
    if not coupon or not coupon.is_active:
        return False, 0, f"Coupon '{clean_code}' is invalid or inactive.", None

    now = datetime.now(timezone.utc)
    if coupon.start_date:
        start_dt = (
            coupon.start_date
            if coupon.start_date.tzinfo
            else coupon.start_date.replace(tzinfo=timezone.utc)
        )
        if now < start_dt:
            return False, 0, f"Coupon '{clean_code}' is not active yet.", coupon

    if coupon.end_date:
        end_dt = (
            coupon.end_date
            if coupon.end_date.tzinfo
            else coupon.end_date.replace(tzinfo=timezone.utc)
        )
        if now > end_dt:
            return False, 0, f"Coupon '{clean_code}' has expired.", coupon

    if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
        return False, 0, f"Coupon '{clean_code}' has reached its maximum usage limit.", coupon

    if user and coupon.per_user_limit:
        user_redemptions = (
            db.query(Order)
            .filter(
                Order.user_id == user.id,
                Order.coupon_code == clean_code,
                Order.status != "cancelled",
            )
            .count()
        )
        if user_redemptions >= coupon.per_user_limit:
            return (
                False,
                0,
                f"You have already used '{clean_code}' the maximum number of times ({coupon.per_user_limit}).",
                coupon,
            )

    if (
        coupon.fulfillment_restriction in ("delivery", "pickup")
        and coupon.fulfillment_restriction != fulfillment_type
    ):
        return (
            False,
            0,
            f"Coupon '{clean_code}' is valid for {coupon.fulfillment_restriction} orders only.",
            coupon,
        )

    if subtotal < coupon.min_order_amount:
        shortfall = coupon.min_order_amount - subtotal
        return (
            False,
            0,
            f"Minimum order of Rs. {coupon.min_order_amount:,} required for '{clean_code}' (Add Rs. {shortfall:,} more).",
            coupon,
        )

    try:
        eligible_cats = json.loads(coupon.eligible_category_ids or "[]")
    except Exception:
        eligible_cats = []
    if eligible_cats:
        if not any(cid in eligible_cats for cid in category_ids):
            return (
                False,
                0,
                f"Coupon '{clean_code}' requires eligible menu items from the promoted category.",
                coupon,
            )

    try:
        eligible_branches = json.loads(coupon.eligible_branch_ids or "[]")
    except Exception:
        eligible_branches = []
    if eligible_branches and branch_id is not None:
        if branch_id not in eligible_branches:
            return (
                False,
                0,
                f"Coupon '{clean_code}' is not valid at the selected branch.",
                coupon,
            )

    if coupon.discount_type == "percentage":
        discount = int(round(subtotal * (coupon.discount_value / 100.0)))
        if coupon.max_discount_amount is not None:
            discount = min(discount, coupon.max_discount_amount)
    else:
        discount = min(coupon.discount_value, subtotal)

    return (
        True,
        discount,
        f"Coupon '{clean_code}' applied! You saved Rs. {discount:,}.",
        coupon,
    )


def calculate_cart_summary(
    db: Session,
    req: CartCalculationRequest,
    user: Optional[User] = None,
) -> CartCalculationResponse:
    validated_items: List[ValidatedCartItemOut] = []
    category_ids: List[int] = []

    for item_input in req.items:
        v_item, cat_id = validate_and_price_item(db, item_input)
        validated_items.append(v_item)
        category_ids.append(cat_id)

    subtotal = sum(item.line_total for item in validated_items)

    # Validate coupon if provided
    coupon_valid = False
    discount_amount = 0
    coupon_message = None
    applied_code = None

    if req.coupon_code and req.coupon_code.strip():
        coupon_valid, discount_amount, coupon_message, _ = validate_coupon_code(
            db=db,
            code=req.coupon_code,
            subtotal=subtotal,
            category_ids=category_ids,
            fulfillment_type=req.fulfillment_type,
            branch_id=req.branch_id,
            user=user,
        )
        if coupon_valid:
            applied_code = req.coupon_code.strip().upper()

    # Loyalty points redemption (authenticated users only)
    loyalty_points_redeemed = 0
    loyalty_discount_amount = 0
    if user and req.redeem_loyalty_points > 0:
        available_pts = min(req.redeem_loyalty_points, user.loyalty_points)
        max_redeemable = max(0, subtotal - discount_amount)
        loyalty_points_redeemed = min(available_pts, max_redeemable)
        loyalty_discount_amount = loyalty_points_redeemed * settings.LOYALTY_PKR_PER_POINT

    total_discounts = min(subtotal, discount_amount + loyalty_discount_amount)
    discounted_subtotal = max(0, subtotal - total_discounts)

    # Delivery fee & minimum order check
    delivery_fee = 0
    delivery_fee_explanation = "Free Store Pickup"
    min_order_amount = 0
    meets_min_order = True

    if req.fulfillment_type == "delivery":
        if req.delivery_lat is not None and req.delivery_lng is not None:
            cov = evaluate_delivery_coverage(
                db=db,
                latitude=req.delivery_lat,
                longitude=req.delivery_lng,
                subtotal=subtotal,
                preferred_branch_id=req.branch_id,
            )
            if cov["deliverable"]:
                delivery_fee = cov["delivery_fee"]
                delivery_fee_explanation = cov["delivery_fee_breakdown"]
                min_order_amount = cov["min_order_amount"]
                meets_min_order = subtotal >= min_order_amount
            else:
                delivery_fee = 150
                delivery_fee_explanation = cov["message"]
                meets_min_order = False
        else:
            # Default branch base fee until location pin is chosen
            default_fee = 150
            min_order_amount = 600
            if subtotal >= 3000:
                delivery_fee = 0
                delivery_fee_explanation = "FREE Delivery unlocked (Order above Rs. 3,000)"
            elif subtotal > 0:
                delivery_fee = default_fee
                delivery_fee_explanation = "Standard base delivery fee Rs. 150 (Select pin on map for exact distance rate)"
            else:
                delivery_fee = 0
                delivery_fee_explanation = "Add items to calculate delivery"
            meets_min_order = subtotal >= min_order_amount if subtotal > 0 else True

    tax_rate = settings.TAX_RATE_PERCENT
    tax_amount = int(round(discounted_subtotal * (tax_rate / 100.0)))
    total_amount = discounted_subtotal + delivery_fee + tax_amount
    estimated_loyalty_points = int(discounted_subtotal // 100) * settings.LOYALTY_POINTS_PER_100_PKR

    # Suggest 4 eligible add-ons (dips, drinks, desserts, sides not already in cart)
    in_cart_ids = {item.product_id for item in validated_items}
    addon_products = (
        db.query(Product)
        .filter(
            Product.is_available == True,
            Product.base_price <= 650,
            ~Product.id.in_(in_cart_ids) if in_cart_ids else True,
        )
        .order_by(Product.popularity_score.desc())
        .limit(4)
        .all()
    )
    recommended_addons = [
        {
            "id": p.id,
            "name": p.name,
            "slug": p.slug,
            "base_price": p.base_price,
            "image_url": p.image_url,
            "short_description": p.short_description,
        }
        for p in addon_products
    ]

    return CartCalculationResponse(
        items=validated_items,
        subtotal=subtotal,
        coupon_code=applied_code,
        coupon_valid=coupon_valid,
        coupon_message=coupon_message,
        discount_amount=total_discounts,
        loyalty_points_redeemed=loyalty_points_redeemed,
        loyalty_discount_amount=loyalty_discount_amount,
        delivery_fee=delivery_fee,
        delivery_fee_explanation=delivery_fee_explanation,
        min_order_amount=min_order_amount,
        meets_min_order=meets_min_order,
        tax_rate_percent=tax_rate,
        tax_amount=tax_amount,
        total_amount=total_amount,
        estimated_loyalty_points_earned=estimated_loyalty_points,
        recommended_addons=recommended_addons,
    )
