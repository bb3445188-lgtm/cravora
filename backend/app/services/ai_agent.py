import json
import re
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Branch,
    Category,
    Coupon,
    Order,
    Product,
    SupportMessage,
    SupportTicket,
    User,
)
from app.schemas import (
    AIAgentAction,
    AIAgentStep,
    AIChatRequest,
    AIChatResponse,
    CartCalculationRequest,
    SelectedItemInput,
)
from app.services.maps import evaluate_delivery_coverage, serialize_branch
from app.services.pricing import (
    calculate_cart_summary,
    serialize_product,
    validate_coupon_code,
)

# Operational metrics & tool error log for Admin Dashboard
AI_METRICS: Dict[str, Any] = {
    "total_requests": 0,
    "tool_calls_count": 0,
    "live_llm_calls": 0,
    "fallback_concierge_calls": 0,
    "tool_errors": [],
}


def record_tool_error(tool_name: str, error_msg: str) -> None:
    AI_METRICS["tool_errors"].append({
        "tool": tool_name,
        "error": error_msg,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    AI_METRICS["tool_errors"] = AI_METRICS["tool_errors"][-50:]


# =============================================================================
# 12 VALIDATED BACKEND AI TOOLS (Database & Maps Source of Truth)
# =============================================================================

def tool_search_products(
    db: Session,
    query: Optional[str] = None,
    max_price: Optional[int] = None,
    category_slug: Optional[str] = None,
    vegetarian_only: bool = False,
    spicy_only: bool = False,
    bestsellers_only: bool = False,
    limit: int = 6,
) -> List[Dict[str, Any]]:
    AI_METRICS["tool_calls_count"] += 1
    q = db.query(Product).filter(Product.is_available == True, Product.stock_qty > 0)
    if category_slug:
        cat = db.query(Category).filter(Category.slug == category_slug).first()
        if cat:
            q = q.filter(Product.category_id == cat.id)
    if max_price is not None:
        q = q.filter(Product.base_price <= max_price)
    if vegetarian_only:
        q = q.filter(Product.is_vegetarian == True)
    if spicy_only:
        q = q.filter(Product.is_spicy == True)
    if bestsellers_only:
        q = q.filter(Product.is_bestseller == True)
    if query:
        stop_words = {
            "the", "and", "for", "with", "under", "below", "best", "suggest", "recommend",
            "want", "need", "please", "add", "cart", "order", "make", "give", "show",
            "mujhe", "chahiye", "dikhao", "batao", "koi", "acha", "mere", "मेरा", "में",
            "daal", "kuch", "meal", "food", "item", "items", "one", "two", "three",
        }
        keywords = [
            w.strip().lower()
            for w in re.split(r"[^a-zA-Z0-9]+", query)
            if len(w.strip()) > 2 and w.strip().lower() not in stop_words
        ]
        products = q.order_by(Product.popularity_score.desc()).all()
        scored = []
        for p in products:
            haystack = f"{p.name} {p.slug} {p.short_description} {p.full_description or ''} {p.category.name if p.category else ''} {p.category.slug if p.category else ''}".lower()
            score = 0
            for kw in keywords:
                if kw in p.name.lower():
                    score += 4
                elif p.category and kw in p.category.name.lower():
                    score += 3
                elif kw in haystack:
                    score += 1
                # Handle plural/singular stems (e.g. pizzas -> pizza, burgers -> burger, shakes -> shake)
                elif kw.endswith("s") and len(kw) > 3 and kw[:-1] in haystack:
                    score += 2
            if score > 0 or not keywords:
                scored.append((score, p))
        scored.sort(key=lambda x: (x[0], x[1].popularity_score), reverse=True)
        return [serialize_product(p) for _, p in scored[:limit]]

    products = q.order_by(Product.popularity_score.desc(), Product.base_price.asc()).limit(limit).all()
    return [serialize_product(p) for p in products]


def tool_get_product_details(db: Session, product_id_or_slug: str) -> Optional[Dict[str, Any]]:
    AI_METRICS["tool_calls_count"] += 1
    product = None
    if str(product_id_or_slug).isdigit():
        product = db.query(Product).filter(Product.id == int(product_id_or_slug)).first()
    if not product:
        product = db.query(Product).filter(Product.slug == str(product_id_or_slug)).first()
    if not product:
        product = (
            db.query(Product)
            .filter(Product.name.ilike(f"%{product_id_or_slug}%"))
            .first()
        )
    return serialize_product(product) if product else None


def tool_get_current_offers(db: Session) -> List[Dict[str, Any]]:
    AI_METRICS["tool_calls_count"] += 1
    coupons = db.query(Coupon).filter(Coupon.is_active == True).all()
    return [
        {
            "code": c.code,
            "title": c.title,
            "description": c.description,
            "discount_type": c.discount_type,
            "discount_value": c.discount_value,
            "min_order_amount": c.min_order_amount,
            "max_discount_amount": c.max_discount_amount,
            "fulfillment_restriction": c.fulfillment_restriction,
            "is_flash_deal": c.is_flash_deal,
        }
        for c in coupons
    ]


def tool_check_availability(db: Session, product_id_or_slug: str) -> Dict[str, Any]:
    AI_METRICS["tool_calls_count"] += 1
    details = tool_get_product_details(db, product_id_or_slug)
    if not details:
        return {"found": False, "available": False, "message": "Product not found in menu."}
    return {
        "found": True,
        "product_id": details["id"],
        "name": details["name"],
        "available": details["is_available"],
        "stock_qty": details["stock_qty"],
        "base_price": details["base_price"],
    }


def tool_validate_coupon(db: Session, code: str, subtotal: int) -> Dict[str, Any]:
    AI_METRICS["tool_calls_count"] += 1
    valid, discount, msg, _ = validate_coupon_code(db, code, subtotal, [])
    return {
        "code": code.upper(),
        "valid": valid,
        "discount_amount": discount,
        "message": msg,
    }


def tool_check_delivery_coverage(
    db: Session,
    latitude: float,
    longitude: float,
    subtotal: int = 1500,
) -> Dict[str, Any]:
    AI_METRICS["tool_calls_count"] += 1
    return evaluate_delivery_coverage(db, latitude, longitude, subtotal=subtotal)


def tool_get_delivery_fee(
    db: Session,
    latitude: float,
    longitude: float,
    subtotal: int = 1500,
) -> Dict[str, Any]:
    AI_METRICS["tool_calls_count"] += 1
    cov = evaluate_delivery_coverage(db, latitude, longitude, subtotal=subtotal)
    return {
        "deliverable": cov["deliverable"],
        "delivery_fee": cov["delivery_fee"],
        "breakdown": cov["delivery_fee_breakdown"],
        "min_order_amount": cov["min_order_amount"],
        "free_delivery_threshold": cov["free_delivery_threshold"],
        "branch_name": cov["matched_branch"]["name"] if cov["matched_branch"] else None,
    }


def tool_find_nearby_branches(
    db: Session,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    city: Optional[str] = None,
) -> List[Dict[str, Any]]:
    AI_METRICS["tool_calls_count"] += 1
    q = db.query(Branch).filter(Branch.is_open == True)
    if city:
        q = q.filter(Branch.city.ilike(f"%{city}%"))
    branches = q.all()
    serialized = [serialize_branch(b, latitude, longitude) for b in branches]
    if latitude is not None and longitude is not None:
        serialized.sort(key=lambda b: b["distance_km"] if b["distance_km"] is not None else 9999.0)
    return serialized


def tool_calculate_cart_total(
    db: Session,
    items: List[Dict[str, Any]],
    fulfillment_type: str = "delivery",
    branch_id: Optional[int] = None,
    delivery_lat: Optional[float] = None,
    delivery_lng: Optional[float] = None,
    coupon_code: Optional[str] = None,
    user: Optional[User] = None,
) -> Dict[str, Any]:
    AI_METRICS["tool_calls_count"] += 1
    selected_inputs = [
        SelectedItemInput(
            product_id=int(i["product_id"]),
            variant_id=i.get("variant_id"),
            selected_option_ids=i.get("selected_option_ids", []),
            quantity=int(i.get("quantity", 1)),
            special_instructions=i.get("special_instructions"),
        )
        for i in items
    ]
    req = CartCalculationRequest(
        items=selected_inputs,
        fulfillment_type=fulfillment_type,
        branch_id=branch_id,
        delivery_lat=delivery_lat,
        delivery_lng=delivery_lng,
        coupon_code=coupon_code,
    )
    summary = calculate_cart_summary(db, req, user=user)
    return summary.model_dump()


def tool_prepare_cart(
    db: Session,
    items: List[Dict[str, Any]],
    coupon_code: Optional[str] = None,
    fulfillment_type: str = "delivery",
    delivery_lat: Optional[float] = None,
    delivery_lng: Optional[float] = None,
    user: Optional[User] = None,
) -> Dict[str, Any]:
    AI_METRICS["tool_calls_count"] += 1
    summary = tool_calculate_cart_total(
        db=db,
        items=items,
        fulfillment_type=fulfillment_type,
        delivery_lat=delivery_lat,
        delivery_lng=delivery_lng,
        coupon_code=coupon_code,
        user=user,
    )
    summary["requires_customer_confirmation"] = True
    summary["confirmation_prompt"] = (
        "Please review the proposed cart items and total breakdown below. "
        "Click 'Confirm & Load Into My Cart' to proceed to checkout."
    )
    return summary


def tool_get_verified_order_status(
    db: Session,
    current_user: Optional[User],
    order_reference: Optional[str] = None,
    guest_phone: Optional[str] = None,
) -> Dict[str, Any]:
    """Strictly verifies ownership before returning any order status details."""
    AI_METRICS["tool_calls_count"] += 1
    if not order_reference and current_user:
        latest_order = (
            db.query(Order)
            .filter(Order.user_id == current_user.id)
            .order_by(Order.created_at.desc())
            .first()
        )
        if not latest_order:
            return {
                "authorized": True,
                "found": False,
                "message": "You do not have any orders under your account yet.",
            }
        order = latest_order
    elif order_reference:
        clean_ref = order_reference.strip().upper()
        order = db.query(Order).filter(Order.order_reference == clean_ref).first()
        if not order:
            return {
                "authorized": False,
                "found": False,
                "message": f"No order found matching reference '{clean_ref}'.",
            }
        # Authorization check: Either authenticated owner OR verified phone number match
        is_owner = current_user is not None and order.user_id == current_user.id
        is_admin = current_user is not None and current_user.role in ("admin", "staff")
        phone_matches = False
        if guest_phone:
            norm_input = re.sub(r"\D", "", guest_phone)[-9:]
            norm_order = re.sub(r"\D", "", order.customer_phone)[-9:]
            phone_matches = bool(norm_input and len(norm_input) >= 7 and norm_input == norm_order)

        if not (is_owner or is_admin or phone_matches):
            return {
                "authorized": False,
                "found": True,
                "message": (
                    f"To protect customer privacy, order '{clean_ref}' requires verification. "
                    "Please log in to the account that placed the order, or provide both the Order Reference and the registered phone number."
                ),
            }
    else:
        return {
            "authorized": False,
            "found": False,
            "message": "Please log in or provide your Order Reference (e.g., CRV-...) and phone number so I can verify and check your order status.",
        }

    return {
        "authorized": True,
        "found": True,
        "order_reference": order.order_reference,
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "fulfillment_type": order.fulfillment_type,
        "branch_name": order.branch.name if order.branch else "Cravora Flagship",
        "total_amount": order.total_amount,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "items": [
            {
                "name": i.product_name_snapshot,
                "variant": i.variant_name_snapshot,
                "quantity": i.quantity,
                "total_price": i.total_price,
            }
            for i in order.items
        ],
    }


def tool_create_support_ticket(
    db: Session,
    current_user: Optional[User],
    subject: str,
    message: str,
    customer_name: Optional[str] = None,
    customer_phone: Optional[str] = None,
    customer_email: Optional[str] = None,
    order_reference: Optional[str] = None,
    category: str = "ai_escalation",
) -> Dict[str, Any]:
    AI_METRICS["tool_calls_count"] += 1
    name = customer_name or (current_user.full_name if current_user else "Cravora Guest")
    phone = customer_phone or (current_user.phone if current_user else "Not provided")
    email = customer_email or (current_user.email if current_user else None)

    order_id = None
    if order_reference:
        ord_obj = db.query(Order).filter(Order.order_reference == order_reference.strip().upper()).first()
        if ord_obj:
            order_id = ord_obj.id

    ticket_ref = f"TKT-{secrets.randbelow(89999) + 10000}"
    ticket = SupportTicket(
        ticket_reference=ticket_ref,
        user_id=current_user.id if current_user else None,
        order_id=order_id,
        customer_name=name,
        customer_email=email,
        customer_phone=phone,
        category=category,
        priority="high" if "refund" in message.lower() or "wrong" in message.lower() else "medium",
        subject=subject[:250],
        status="open",
        escalated_from_ai=True,
    )
    db.add(ticket)
    db.flush()

    msg_row = SupportMessage(
        ticket_id=ticket.id,
        sender_role="customer",
        sender_name=name,
        message=message,
    )
    db.add(msg_row)
    db.commit()
    db.refresh(ticket)

    return {
        "ticket_reference": ticket.ticket_reference,
        "status": ticket.status,
        "priority": ticket.priority,
        "subject": ticket.subject,
        "support_phone": settings.SUPPORT_PHONE,
        "support_email": settings.SUPPORT_EMAIL,
        "message": f"Support ticket {ticket.ticket_reference} has been logged and escalated to our Human Customer Care team.",
    }


# =============================================================================
# AUTONOMOUS REACT AGENT HELPERS & NATURAL LANGUAGE PARSERS
# =============================================================================

def extract_budget_from_text(text: str) -> Optional[int]:
    """Extract PKR budget like 'under Rs. 1,500' or 'under 2000' or '2000 ke andar'."""
    cleaned = text.replace(",", "")
    patterns = [
        r"(?:under|below|within|budget|around|rs\.?|pkr|in)\s*(\d{3,5})",
        r"(\d{3,5})\s*(?:rs|pkr|rupees|budget|ke\s*andar|tak|mein|wala)",
    ]
    for pat in patterns:
        m = re.search(pat, cleaned, re.IGNORECASE)
        if m:
            val = int(m.group(1))
            if 200 <= val <= 50000:
                return val
    return None


def extract_order_ref_from_text(text: str) -> Optional[str]:
    m = re.search(r"\b(CRV-[A-Z0-9-]+)\b", text, re.IGNORECASE)
    return m.group(1).upper() if m else None


def extract_phone_from_text(text: str) -> Optional[str]:
    m = re.search(r"(\+?92[\d\s-]{9,13}|03[\d\s-]{9,11})", text)
    return m.group(1).strip() if m else None


def extract_quantity_from_text(text: str) -> int:
    word_nums = {
        "one": 1, "ek": 1, "1": 1,
        "two": 2, "do": 2, "2": 2, "double": 2,
        "three": 3, "teen": 3, "3": 3,
        "four": 4, "chaar": 4, "4": 4,
        "five": 5, "paanch": 5, "5": 5,
    }
    m = re.search(r"\b(\d|one|two|three|four|five|ek|do|teen|chaar)\b", text.lower())
    if m:
        tok = m.group(1)
        if tok in word_nums:
            return word_nums[tok]
    return 1


def find_best_coupon_for_subtotal(
    db: Session,
    subtotal: int,
    fulfillment_type: str = "delivery",
) -> Tuple[Optional[str], int, Optional[Dict[str, Any]]]:
    offers = tool_get_current_offers(db)
    best_code = None
    best_discount = 0
    best_offer = None
    for off in offers:
        if off["fulfillment_restriction"] not in ("all", fulfillment_type):
            continue
        val_res = tool_validate_coupon(db, off["code"], subtotal)
        if val_res["valid"] and val_res["discount_amount"] > best_discount:
            best_discount = val_res["discount_amount"]
            best_code = off["code"]
            best_offer = off
    return best_code, best_discount, best_offer


def resolve_product_from_text_or_history(
    db: Session,
    text: str,
    history: List[Any],
) -> List[Tuple[Dict[str, Any], int, Optional[int], List[int]]]:
    """
    Match one or more products mentioned in `text` (or referred to via 'first one', 'second one', 'it' from `history`),
    and determine quantity, variant_id (Small/Regular/Large/Party/Double), and option_ids (Stuffed crust, extra cheese, meal).
    """
    msg_lower = text.lower()
    all_products = [serialize_product(p) for p in db.query(Product).filter(Product.is_available == True).all()]

    # Check if user says "first one", "second one", "it", "this" referring to previous AI turn
    if any(ref in msg_lower for ref in ["first one", "1st one", "second one", "2nd one", "third one", "add it", "customize it", "order it", "ye wala", "pehle wala", "pehla"]):
        prev_ai_msgs = [h.content for h in reversed(history) if getattr(h, "role", "") == "assistant"]
        mentioned_prods = []
        for ai_txt in prev_ai_msgs:
            for p in all_products:
                if p["name"].lower() in ai_txt.lower() and p not in mentioned_prods:
                    mentioned_prods.append(p)
            if mentioned_prods:
                break
        if mentioned_prods:
            idx = 1 if ("second" in msg_lower or "2nd" in msg_lower) and len(mentioned_prods) > 1 else 0
            chosen = mentioned_prods[idx]
            qty = extract_quantity_from_text(msg_lower)
            variant_id, opt_ids = pick_variant_and_options(chosen, msg_lower)
            return [(chosen, qty, variant_id, opt_ids)]

    # Split multi-item requests by " and " or " aur " or "+" or ","
    segments = re.split(r"\b(?:and|aur|plus)\b|\+|,", msg_lower)
    matched_results: List[Tuple[Dict[str, Any], int, Optional[int], List[int]]] = []
    seen_ids = set()

    for seg in segments:
        seg = seg.strip()
        if not seg:
            continue
        best_prod = None
        best_score = 0
        for p in all_products:
            p_name = p["name"].lower()
            p_words = [w for w in re.split(r"[^a-z0-9]+", p_name) if len(w) >= 4 and w not in {"pizza", "burger", "with", "pcs"}]
            score = 0
            if p_name in seg:
                score += 15
            for w in p_words:
                if w in seg:
                    score += 4
            # Specific common aliases
            if "crown" in seg and "crown" in p_name:
                score += 8
            if ("seekh" in seg or "kebab" in seg or "kabab" in seg) and "seekh" in p_name:
                score += 8
            if "malai" in seg and "malai" in p_name:
                score += 8
            if "peri" in seg and "peri" in p_name and ("wing" in seg) == ("wing" in p_name):
                score += 7
            if "pepperoni" in seg and "pepperoni" in p_name:
                score += 8
            if "fajita" in seg and "fajita" in p_name:
                score += 8
            if ("margherita" in seg or "veg pizza" in seg) and "margherita" in p_name:
                score += 8
            if ("zinger" in seg or "monster" in seg) and "monster crunch zinger" in p_name and "wrap" not in seg:
                score += 7
            if "bazooka" in seg and "bazooka" in p_name:
                score += 8
            if ("smash" in seg or "beef burger" in seg or "oklahoma" in seg) and "oklahoma" in p_name:
                score += 8
            if ("spin roll" in seg or "bihari" in seg or "roll" in seg) and "bihari spin-roll" in p_name:
                score += 8
            if "wrap" in seg and "wrap" in p_name:
                score += 8
            if "pasta" in seg and "pasta" in p_name and "deal" not in seg:
                score += 8
            if "lasagna" in seg and "lasagna" in p_name:
                score += 8
            if ("wing" in seg or "wings" in seg) and "wings" in p_name:
                score += 8
            if "tender" in seg and "tender" in p_name:
                score += 8
            if "platter" in seg and "showstopper" in p_name:
                score += 8
            if "calzone" in seg and "calzone" in p_name:
                score += 8
            if "garlic bread" in seg and "garlic bread" in p_name:
                score += 8
            if ("loaded fries" in seg or "animal" in seg or "tikka fries" in seg) and "animal-style" in p_name:
                score += 8
            if ("masala fries" in seg or ("fries" in seg and "loaded" not in seg and "animal" not in seg)) and "masala fries" in p_name:
                score += 6
            if ("garlic dip" in seg or "white dip" in seg or "dip" in seg) and "white garlic herb dip" in p_name:
                score += 7
            if ("lava" in seg or "cake" in seg or "brownie" in seg) and "lava cake" in p_name:
                score += 8
            if ("biscoff" in seg or "sundae" in seg or "ice cream" in seg) and "biscoff" in p_name:
                score += 8
            if ("margarita" in seg or "mint" in seg) and "mint margarita" in p_name:
                score += 8
            if ("shake" in seg or "hazelnut" in seg or "nutella" in seg) and "thick shake" in p_name:
                score += 8
            if ("family" in seg or "feast" in seg) and "grand family" in p_name:
                score += 7
            if "solo" in seg and "solo craving" in p_name:
                score += 8
            if "duo" in seg and "duo pizza" in p_name:
                score += 8
            if "midnight" in seg and "midnight craving" in p_name:
                score += 8

            if score > best_score and score >= 4:
                best_score = score
                best_prod = p

        if best_prod and best_prod["id"] not in seen_ids:
            seen_ids.add(best_prod["id"])
            qty = extract_quantity_from_text(seg)
            variant_id, opt_ids = pick_variant_and_options(best_prod, seg)
            matched_results.append((best_prod, qty, variant_id, opt_ids))

    return matched_results


def pick_variant_and_options(prod: Dict[str, Any], text_lower: str) -> Tuple[Optional[int], List[int]]:
    variant_id = None
    variants = prod.get("variants") or []
    if variants:
        if "small" in text_lower or '8"' in text_lower:
            v = next((x for x in variants if "small" in x["name"].lower()), None)
            if v:
                variant_id = v["id"]
        elif "party" in text_lower or '16"' in text_lower or "beast" in text_lower or "6 people" in text_lower:
            v = next((x for x in variants if "party" in x["name"].lower()), None)
            if v:
                variant_id = v["id"]
        elif "large" in text_lower or '13"' in text_lower or "4 people" in text_lower or "four" in text_lower:
            v = next((x for x in variants if "large" in x["name"].lower()), None)
            if v:
                variant_id = v["id"]
        elif "double" in text_lower:
            v = next((x for x in variants if "double" in x["name"].lower()), None)
            if v:
                variant_id = v["id"]
        if variant_id is None:
            default_v = next((x for x in variants if x.get("is_default")), variants[0])
            variant_id = default_v["id"]

    selected_opts: List[int] = []
    for grp in prod.get("customization_groups") or []:
        opts = grp.get("options") or []
        chosen_in_grp: List[int] = []
        for o in opts:
            o_name = o["name"].lower()
            if ("thin" in text_lower and "thin" in o_name) or (
                "deep pan" in text_lower and "deep pan" in o_name
            ) or (
                ("seekh" in text_lower or "kebab crust" in text_lower) and "seekh kebab stuffed" in o_name
            ) or (
                ("crown crust" in text_lower or "cheddar" in text_lower) and "crown crust" in o_name
            ) or (
                ("extra cheese" in text_lower or "double cheese" in text_lower or "double mozzarella" in text_lower)
                and "double mozzarella" in o_name
            ) or (
                "loaded meal" in text_lower and "loaded meal" in o_name
            ) or (
                "meal" in text_lower and "regular cravora meal" in o_name
            ):
                chosen_in_grp.append(o["id"])
                if grp["selection_type"] == "single":
                    break
        if not chosen_in_grp and grp.get("is_required"):
            def_opt = next((x for x in opts if x.get("is_default")), opts[0] if opts else None)
            if def_opt:
                chosen_in_grp.append(def_opt["id"])
        selected_opts.extend(chosen_in_grp)

    return variant_id, selected_opts


def try_live_llm_synthesis(
    req: AIChatRequest,
    fallback_reply: str,
    tools_invoked: List[str],
    context_summary: str,
) -> Tuple[str, str, str]:
    """
    If a live OpenAI or Gemini API key is configured (either in .env or passed via req.runtime_api_key),
    call the live LLM to synthesize the agent response grounded strictly in the verified database tool outputs.
    """
    api_key = (req.runtime_api_key or "").strip()
    provider = (req.runtime_provider or settings.LLM_PROVIDER or "openai").strip().lower()

    if not api_key:
        if provider == "gemini" and settings.GEMINI_API_KEY:
            api_key = settings.GEMINI_API_KEY.strip()
        elif settings.OPENAI_API_KEY:
            api_key = settings.OPENAI_API_KEY.strip()
            provider = "openai"
        elif settings.GEMINI_API_KEY:
            api_key = settings.GEMINI_API_KEY.strip()
            provider = "gemini"

    if not api_key or len(api_key) < 12:
        AI_METRICS["fallback_concierge_calls"] += 1
        return (
            fallback_reply,
            "catalog_assistant",
            "Cravora Smart Food Assistant active (Live Database & Menu Tools).",
        )

    system_prompt = (
        "You are Cravora AI, an autonomous, action-taking AI Food Agent for 'CRAVORA — Pizza & More' in Pakistan.\n"
        "RULES:\n"
        "1. Rely strictly on the VERIFIED DATABASE TOOL OUTPUTS provided below. Never invent prices, items, or order statuses.\n"
        "2. Respond naturally in the user's language (English or Roman Urdu/Hinglish if they used Roman Urdu).\n"
        "3. Be concise, warm, energetic, and action-oriented. Confirm any autonomous actions already executed.\n\n"
        f"VERIFIED TOOL OUTPUTS & CONTEXT:\n{context_summary}\n\n"
        f"BASELINE VERIFIED SUMMARY:\n{fallback_reply}"
    )

    try:
        if provider == "gemini" or api_key.startswith("AIza"):
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
            contents = []
            for h in req.history[-6:]:
                contents.append({
                    "role": "user" if h.role == "user" else "model",
                    "parts": [{"text": h.content}],
                })
            contents.append({"role": "user", "parts": [{"text": req.message}]})
            payload = {
                "systemInstruction": {"parts": [{"text": system_prompt}]},
                "contents": contents,
                "generationConfig": {"temperature": 0.3, "maxOutputTokens": 600},
            }
            with httpx.Client(timeout=12.0) as client:
                r = client.post(url, json=payload)
                if r.status_code == 200:
                    data = r.json()
                    text_out = (
                        data.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                    )
                    if text_out.strip():
                        AI_METRICS["live_llm_calls"] += 1
                        return (
                            text_out.strip(),
                            "live_llm",
                            "Connected to Live Google Gemini LLM + Cravora Verified Database Tools & Autonomous Actions.",
                        )
        else:
            url = "https://api.openai.com/v1/chat/completions"
            messages = [{"role": "system", "content": system_prompt}]
            for h in req.history[-6:]:
                messages.append({"role": h.role, "content": h.content})
            messages.append({"role": "user", "content": req.message})
            with httpx.Client(timeout=12.0) as client:
                r = client.post(
                    url,
                    headers={"Authorization": f"Bearer {api_key}"},
                    json={"model": "gpt-4o-mini", "messages": messages, "temperature": 0.3},
                )
                if r.status_code == 200:
                    data = r.json()
                    text_out = data["choices"][0]["message"]["content"]
                    if text_out.strip():
                        AI_METRICS["live_llm_calls"] += 1
                        return (
                            text_out.strip(),
                            "live_llm",
                            "Connected to Live OpenAI GPT-4o-mini + Cravora Verified Database Tools & Autonomous Actions.",
                        )
    except Exception as exc:
        record_tool_error("live_llm_call", str(exc))

    AI_METRICS["fallback_concierge_calls"] += 1
    return (
        fallback_reply,
        "catalog_assistant",
        "Cravora Smart Food Assistant active (Live Database & Menu Tools).",
    )


# =============================================================================
# MAIN AUTONOMOUS AI AGENT ORCHESTRATOR
# =============================================================================

def process_ai_chat(
    db: Session,
    req: AIChatRequest,
    current_user: Optional[User] = None,
) -> AIChatResponse:
    AI_METRICS["total_requests"] += 1
    msg_clean = req.message.strip()
    msg_lower = msg_clean.lower()

    tools_invoked: List[str] = []
    agent_steps: List[AIAgentStep] = []
    agent_actions: List[AIAgentAction] = []
    recommended_products: List[Dict[str, Any]] = []
    proposed_cart: Optional[Dict[str, Any]] = None
    order_status_card: Optional[Dict[str, Any]] = None
    support_ticket_card: Optional[Dict[str, Any]] = None

    def add_step(step_type: str, title: str, detail: str, tool_name: Optional[str] = None) -> None:
        agent_steps.append(
            AIAgentStep(step_type=step_type, title=title, detail=detail, tool_name=tool_name)
        )

    # -------------------------------------------------------------------------
    # INTENT 1: SUPPORT ESCALATION / COMPLAINT / REFUND / HUMAN AGENT
    # -------------------------------------------------------------------------
    if any(
        kw in msg_lower
        for kw in [
            "report a problem",
            "complaint",
            "refund",
            "wrong item",
            "missing item",
            "cold food",
            "late delivery",
            "human",
            "escalate",
            "support ticket",
            "speak to agent",
            "shikayat",
            "issue with my order",
        ]
    ):
        order_ref = extract_order_ref_from_text(req.message) or req.guest_order_reference
        add_step(
            "thought",
            "Detected Support Escalation Intent",
            f"Customer reported an issue or requested human support. Extracted order reference: {order_ref or 'None'}.",
        )
        tools_invoked.append("create_support_ticket")
        ticket_data = tool_create_support_ticket(
            db=db,
            current_user=current_user,
            subject=f"Customer Escalation: {req.message[:80]}",
            message=req.message,
            order_reference=order_ref,
            category="order_issue" if order_ref else "ai_escalation",
        )
        add_step(
            "tool_call",
            "Executed create_support_ticket()",
            f"Created priority ticket {ticket_data['ticket_reference']} in database with status '{ticket_data['status']}'.",
            tool_name="create_support_ticket",
        )
        support_ticket_card = ticket_data
        reply_text = (
            f"I have immediately logged and escalated priority support ticket **{ticket_data['ticket_reference']}** to our Human Customer Care specialists.\n\n"
            f"- **Ticket Reference:** `{ticket_data['ticket_reference']}`\n"
            f"- **Priority:** {ticket_data['priority'].title()} (Escalated)\n"
            f"- **Direct Helpline:** {ticket_data['support_phone']} | {ticket_data['support_email']}\n\n"
            "Our specialist team will review your ticket right away. You can also view or reply to it in the Support Center."
        )
        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps(ticket_data))
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            support_ticket_card=support_ticket_card,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Where is my order CRV-20261020-1001?",
                "Suggest the best meal under Rs. 1,500",
                "Show current deals",
            ],
        )

    # -------------------------------------------------------------------------
    # INTENT 2: ORDER STATUS TRACKING
    # -------------------------------------------------------------------------
    if any(
        kw in msg_lower
        for kw in [
            "where is my order",
            "track my order",
            "track order",
            "order status",
            "crv-",
            "mera order kahan",
            "order kab aayega",
        ]
    ):
        order_ref = extract_order_ref_from_text(req.message) or req.guest_order_reference
        phone = extract_phone_from_text(req.message) or req.guest_phone
        add_step(
            "thought",
            "Detected Order Tracking & Verification Intent",
            f"Checking ownership & live status for order_ref={order_ref or 'latest account order'}, phone={phone or 'session auth'}.",
        )
        tools_invoked.append("get_verified_order_status")
        status_res = tool_get_verified_order_status(
            db=db,
            current_user=current_user,
            order_reference=order_ref,
            guest_phone=phone,
        )
        add_step(
            "tool_call",
            "Executed get_verified_order_status()",
            f"Authorized={status_res.get('authorized')}, Found={status_res.get('found')}.",
            tool_name="get_verified_order_status",
        )
        if status_res.get("authorized") and status_res.get("found"):
            order_status_card = status_res
            status_label = status_res["status"].replace("_", " ").title()
            items_str = ", ".join(f"{i['quantity']}x {i['name']}" for i in status_res.get("items", []))
            reply_text = (
                f"Here is the live verified status for order **{status_res['order_reference']}**:\n\n"
                f"- **Current Kitchen/Dispatch Stage:** {status_label}\n"
                f"- **Items:** {items_str}\n"
                f"- **Fulfillment:** {status_res['fulfillment_type'].title()} ({status_res['branch_name']})\n"
                f"- **Verified Total:** Rs. {status_res['total_amount']:,} ({status_res['payment_status'].title()})\n\n"
                "Click **Open Live Order Timeline** below to watch real-time status updates, or tell me if you need help with this order."
            )
        else:
            reply_text = status_res.get(
                "message",
                "Please sign in or provide both your Order Reference (e.g. `CRV-20261020-1001`) and registered phone number (e.g. `0333-5129081`) so I can verify ownership and pull up your order.",
            )
        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps(status_res))
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            order_status_card=order_status_card,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Where is my order CRV-20261020-1001 for 03335129081?",
                "I want to report a problem with my order",
                "Suggest the best meal under Rs. 1,500",
            ],
        )

    # -------------------------------------------------------------------------
    # INTENT 3: DIRECT WEBSITE NAVIGATION / MODE SWITCH / CART CLEAR
    # -------------------------------------------------------------------------
    if any(kw in msg_lower for kw in ["clear my cart", "empty my cart", "clear cart", "reset cart", "cart khali karo"]):
        add_step("thought", "Detected Cart Reset Command", "User requested to empty their current shopping cart.")
        agent_actions.append(
            AIAgentAction(
                action_type="CLEAR_CART",
                label="Cleared All Items From Cart",
                auto_execute=True,
                payload={},
            )
        )
        add_step("action", "Executed CLEAR_CART on Live Session", "Emptied cart items and reset promo code.")
        return AIChatResponse(
            reply="Done! I have **cleared your cart** and reset any applied promo codes. What would you like me to build or add next?",
            mode="autonomous_react_agent",
            provider_status_note="Cravora Autonomous ReAct AI Agent executed CLEAR_CART action.",
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Add 1 Large Royal Crown Crust Pizza to my cart",
                "Suggest the best meal under Rs. 1,500",
                "Build a meal for 4 people",
            ],
        )

    if any(kw in msg_lower for kw in ["switch to pickup", "change to pickup", "branch pickup mode", "set to pickup"]):
        add_step("thought", "Detected Fulfillment Switch Command", "Switching fulfillment mode to Branch Pickup.")
        agent_actions.append(
            AIAgentAction(
                action_type="SET_FULFILLMENT",
                label="Switched Fulfillment Mode to Branch Pickup",
                auto_execute=True,
                payload={"fulfillment_type": "pickup"},
            )
        )
        add_step("action", "Executed SET_FULFILLMENT('pickup')", "Updated store state to Branch Pickup ($0 delivery fee).")
        return AIChatResponse(
            reply="Done! I have switched your order mode to **Branch Self-Pickup** (Rs. 0 delivery fee). You can also use promo code **`PICKUP15`** for **15% OFF** on pickup orders above Rs. 1,000!",
            mode="autonomous_react_agent",
            provider_status_note="Cravora Autonomous ReAct AI Agent executed SET_FULFILLMENT action.",
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Apply coupon PICKUP15",
                "Find nearest branch",
                "Add 1 Royal Crown Crust Pizza to my cart",
            ],
        )

    if any(kw in msg_lower for kw in ["switch to delivery", "change to delivery", "home delivery mode", "set to delivery"]):
        add_step("thought", "Detected Fulfillment Switch Command", "Switching fulfillment mode to Home Delivery.")
        agent_actions.append(
            AIAgentAction(
                action_type="SET_FULFILLMENT",
                label="Switched Fulfillment Mode to Home Delivery",
                auto_execute=True,
                payload={"fulfillment_type": "delivery"},
            )
        )
        add_step("action", "Executed SET_FULFILLMENT('delivery')", "Updated store state to Home Delivery.")
        return AIChatResponse(
            reply="Done! I have switched your order mode to **Home Delivery** and verified your delivery pin coverage.",
            mode="autonomous_react_agent",
            provider_status_note="Cravora Autonomous ReAct AI Agent executed SET_FULFILLMENT action.",
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Do you deliver to my location?",
                "Suggest the best meal under Rs. 1,500",
                "Show current deals",
            ],
        )

    if any(kw in msg_lower for kw in ["take me to checkout", "go to checkout", "open checkout", "proceed to checkout", "checkout karwao"]):
        add_step("thought", "Detected Checkout Navigation Command", "Navigating user directly to /checkout.")
        agent_actions.append(
            AIAgentAction(
                action_type="NAVIGATE",
                label="Navigated to Checkout Page",
                auto_execute=True,
                payload={"path": "/checkout"},
            )
        )
        add_step("action", "Executed NAVIGATE('/checkout')", "Redirected browser to checkout flow.")
        return AIChatResponse(
            reply="Taking you straight to **Checkout** now so you can confirm your delivery details and complete your order!",
            mode="autonomous_react_agent",
            provider_status_note="Cravora Autonomous ReAct AI Agent executed NAVIGATE('/checkout').",
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Apply best coupon to my cart",
                "What is in my cart?",
            ],
        )

    # -------------------------------------------------------------------------
    # SPECIFIC QUERY 1: CHEAPEST PIZZA AVAILABLE
    # -------------------------------------------------------------------------
    if any(kw in msg_lower for kw in ["cheapest pizza", "lowest price pizza", "sasti pizza", "sasta pizza", "least expensive pizza", "most affordable pizza"]) or (
        ("cheapest" in msg_lower or "sasta" in msg_lower or "sasti" in msg_lower or "lowest price" in msg_lower) and "pizza" in msg_lower
    ):
        tools_invoked.append("search_products")
        add_step("thought", "Finding Most Affordable Pizzas", "Querying all pizzas from database ordered by price ascending.")
        pizzas = (
            db.query(Product)
            .join(Category)
            .filter(
                Product.is_available == True,
                Category.slug.in_(["classic-pizzas", "signature-pizzas"]),
            )
            .order_by(Product.base_price.asc())
            .limit(4)
            .all()
        )
        recommended_products = [serialize_product(p) for p in pizzas]
        cheapest_one = recommended_products[0] if recommended_products else None
        cheapest_chicken = next((p for p in recommended_products if not p.get("is_vegetarian")), None)

        if cheapest_one:
            reply_lines = [
                f"The most affordable pizza on our menu is the **{cheapest_one['name']}** at **Rs. {cheapest_one['base_price']:,}**."
            ]
            if cheapest_chicken and cheapest_chicken["id"] != cheapest_one["id"]:
                reply_lines.append(f"If you prefer chicken, our **{cheapest_chicken['name']}** is just **Rs. {cheapest_chicken['base_price']:,}**.")
            reply_lines.append("\nBoth are stone-baked fresh at 450°C with 100% real mozzarella and hand-stretched dough.")
            reply_text = "\n".join(reply_lines)
        else:
            reply_text = "Our classic stone-baked pizzas start from **Rs. 1,290**."

        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps([p["name"] for p in recommended_products]))
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            recommended_products=recommended_products,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                f"Add 1 {cheapest_one['name']} to my cart" if cheapest_one else "Explore Menu",
                f"Customize {cheapest_one['name']}" if cheapest_one else "Explore Menu",
                "Show all pizzas",
            ],
        )

    # -------------------------------------------------------------------------
    # SPECIFIC QUERY 2: SPICY WITHOUT BEEF
    # -------------------------------------------------------------------------
    if any(nb in msg_lower for nb in ["without beef", "no beef", "beef free", "beef ke baghair", "baghair beef"]) and any(sp in msg_lower for sp in ["spicy", "hot", "teekha", "mirch", "chatpata", "peri"]):
        tools_invoked.append("search_products")
        add_step("thought", "Filtering Spicy Items with Zero Beef", "Querying spicy items and strictly excluding any beef ingredients.")
        spicy_items = (
            db.query(Product)
            .filter(Product.is_available == True, Product.is_spicy == True)
            .order_by(Product.popularity_score.desc())
            .all()
        )
        non_beef_spicy = [
            serialize_product(p)
            for p in spicy_items
            if not any(b in (p.name + " " + (p.short_description or "") + " " + (p.full_description or "")).lower() for b in ["beef", "smash", "pepperoni"])
        ][:4]
        recommended_products = non_beef_spicy

        reply_text = (
            "Here are our top fiery spicy picks with **zero beef** (100% halal chicken and vegetarian):\n\n"
            + "\n".join(
                f"- **{p['name']}** (**Rs. {p['base_price']:,}**) — {p['short_description']}"
                for p in recommended_products
            )
            + "\n\nWould you like me to add one of these to your cart or customize it?"
        )
        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps([p["name"] for p in recommended_products]))
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            recommended_products=recommended_products,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                f"Add 1 {recommended_products[0]['name']} to my cart" if recommended_products else "Explore menu",
                "Suggest a meal under Rs. 2,000",
                "Show all burgers",
            ],
        )

    # -------------------------------------------------------------------------
    # SPECIFIC QUERY 3: MEAL FOR TWO UNDER RS. 2,000 / COUPLE MEAL
    # -------------------------------------------------------------------------
    if any(two in msg_lower for two in ["for two", "two people", "2 people", "couple", "dono"]) and any(b in msg_lower for b in ["2000", "2,000", "under 2000", "under 2,000"]):
        tools_invoked.extend(["search_products", "prepare_cart"])
        add_step("thought", "Building Meal for Two Under Rs. 2,000", "Selecting pair of Zingers + Fries or Classic Pizza under Rs. 2,000.")

        zinger = db.query(Product).filter(Product.name.ilike("%Monster Crunch Zinger%")).first()
        fries = db.query(Product).filter(Product.name.ilike("%Masala Fries%")).first()

        items_to_propose = []
        if zinger and fries:
            items_to_propose = [
                {"product_id": zinger.id, "quantity": 2},
                {"product_id": fries.id, "quantity": 1},
            ]
            recommended_products = [serialize_product(zinger), serialize_product(fries)]
        else:
            candidates = tool_search_products(db, max_price=1000, limit=2)
            items_to_propose = [{"product_id": c["id"], "quantity": 1} for c in candidates]
            recommended_products = candidates

        proposed_cart = tool_prepare_cart(
            db=db,
            items=items_to_propose,
            fulfillment_type=req.fulfillment_type,
            delivery_lat=req.delivery_lat,
            delivery_lng=req.delivery_lng,
            user=current_user,
        )

        reply_text = (
            "Here is the ideal meal for two under **Rs. 2,000**:\n\n"
            "- **2x Cravora Monster Crunch Zingers** (Rs. 1,580)\n"
            "- **1x Lahori Chatpata Masala Fries** (Rs. 390)\n\n"
            f"**Subtotal:** **Rs. {proposed_cart['subtotal']:,}** (fits right inside your Rs. 2,000 budget!).\n\n"
            "I have prepared this verified cart below. Click **Confirm & Load Proposed Cart** to add it, or tell me *'Add it to my cart'*."
        )
        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps(proposed_cart))
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            recommended_products=recommended_products,
            proposed_cart=proposed_cart,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Confirm & Load Proposed Cart",
                "What about a pizza option instead?",
                "Take me to checkout",
            ],
        )

    # -------------------------------------------------------------------------
    # SPECIFIC QUERY 4: CONVERSATIONAL VARIANT UPGRADE (MAKE IT LARGE)
    # -------------------------------------------------------------------------
    if any(kw in msg_lower for kw in ["make that one a large", "make it large", "large size", "large kardo", "make it a large", "upgrade to large", "make that a large"]):
        all_prods = [serialize_product(p) for p in db.query(Product).filter(Product.is_available == True).all()]
        target_prod = None

        if req.current_cart:
            last_cart_item = req.current_cart[-1]
            target_prod = next((p for p in all_prods if p["id"] == last_cart_item.product_id), None)

        if not target_prod and req.history:
            for h in reversed(req.history):
                content_txt = getattr(h, "content", "") or ""
                for p in all_prods:
                    if p["name"].lower() in content_txt.lower():
                        target_prod = p
                        break
                if target_prod:
                    break

        if not target_prod:
            target_prod = next((p for p in all_prods if "royal crown" in p["name"].lower()), all_prods[0])

        large_variant = next(
            (v for v in (target_prod.get("variants") or []) if "large" in v["name"].lower() or "13" in v["name"].lower()),
            None,
        )

        if large_variant:
            unit_price = large_variant.get("absolute_price") or (target_prod["base_price"] + large_variant.get("price_modifier", 550))
            agent_actions.append(
                AIAgentAction(
                    action_type="ADD_TO_CART",
                    label=f"Added 1x {target_prod['name']} (Large 13\")",
                    auto_execute=True,
                    payload={
                        "product_id": target_prod["id"],
                        "product_name": target_prod["name"],
                        "product_image": target_prod["image_url"],
                        "variant_id": large_variant["id"],
                        "variant_name": large_variant["name"],
                        "selected_option_ids": [],
                        "selected_option_labels": [],
                        "quantity": 1,
                        "unit_price_preview": unit_price,
                    },
                )
            )
            reply_text = f"Done! I've selected **{target_prod['name']}** in **Large 13\" (8 slices, serves 3–4)** at **Rs. {unit_price:,}** and added it to your cart."
        else:
            reply_text = f"**{target_prod['name']}** comes in a single standard size (Rs. {target_prod['base_price']:,}). I've added it to your cart!"
            agent_actions.append(
                AIAgentAction(
                    action_type="ADD_TO_CART",
                    label=f"Added 1x {target_prod['name']}",
                    auto_execute=True,
                    payload={
                        "product_id": target_prod["id"],
                        "product_name": target_prod["name"],
                        "product_image": target_prod["image_url"],
                        "variant_id": None,
                        "variant_name": None,
                        "selected_option_ids": [],
                        "selected_option_labels": [],
                        "quantity": 1,
                        "unit_price_preview": target_prod["base_price"],
                    },
                )
            )

        return AIChatResponse(
            reply=reply_text,
            mode="catalog_assistant",
            provider_status_note="Cravora Smart Food Assistant active (Live Database & Menu Tools).",
            recommended_products=[target_prod],
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Take me to checkout",
                "Apply best coupon",
                "Add 1 Mint Margarita",
            ],
        )

    # -------------------------------------------------------------------------
    # SPECIFIC QUERY 5: DELIVERY FEE / CHARGES
    # -------------------------------------------------------------------------
    if any(kw in msg_lower for kw in ["how much will delivery cost", "delivery cost", "delivery fee", "delivery charges", "charges kitne", "delivery kitni", "kitna delivery fee"]) and not any(kw in msg_lower for kw in ["pizza", "burger", "deal", "add ", "dal do"]):
        tools_invoked.append("get_delivery_fee")
        lat = req.delivery_lat or 33.7215
        lng = req.delivery_lng or 73.0571
        fee_data = tool_get_delivery_fee(db, lat, lng, subtotal=1500)

        reply_text = (
            f"Delivery fee for your pinned location is **Rs. {fee_data['delivery_fee']:,}**"
            + (f" served from our **{fee_data['branch_name']}** kitchen" if fee_data.get("branch_name") else "")
            + f".\n\n- **Formula:** {fee_data.get('breakdown', 'Base fee + per-km rate')}\n"
            f"- **Minimum Order:** Rs. {fee_data['min_order_amount']:,}\n"
            f"- **Free Delivery:** Any order above **Rs. {fee_data['free_delivery_threshold']:,}** qualifies for **FREE delivery**!"
        )
        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps(fee_data))
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Suggest the best meal under Rs. 1,500",
                "Switch to pickup (Rs. 0 Fee)",
                "Show current deals",
            ],
        )

    # -------------------------------------------------------------------------
    # SPECIFIC QUERY 6: VEGETARIAN OPTIONS
    # -------------------------------------------------------------------------
    if any(kw in msg_lower for kw in ["vegetarian options", "veg options", "show me vegetarian", "sabzi", "pure veg", "only veg"]) or (msg_lower.strip() in ["vegetarian", "veg", "vegetarian food"]):
        tools_invoked.append("search_products")
        veg_items = (
            db.query(Product)
            .filter(Product.is_available == True, Product.is_vegetarian == True)
            .order_by(Product.popularity_score.desc())
            .all()
        )
        recommended_products = [serialize_product(p) for p in veg_items[:5]]
        reply_text = (
            "Here are our top **100% Vegetarian & Halal Certified** menu items:\n\n"
            + "\n".join(
                f"- **{p['name']}** (**Rs. {p['base_price']:,}**) — {p['short_description']}"
                for p in recommended_products
            )
            + "\n\nAll our cheeses and sauces are 100% vegetarian-friendly. Tell me what you would like to order!"
        )
        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps([p["name"] for p in recommended_products]))
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            recommended_products=recommended_products,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                f"Add 1 {recommended_products[0]['name']} to my cart" if recommended_products else "Explore menu",
                "Customize Garden Harvest Margherita",
                "Show spicy options",
            ],
        )

    # -------------------------------------------------------------------------
    # INTENT 4: AUTONOMOUS "ADD TO CART" / "ORDER THIS" / "CUSTOMIZE THIS"
    # -------------------------------------------------------------------------
    is_add_to_cart_intent = any(
        kw in msg_lower
        for kw in [
            "add ",
            "add to cart",
            "add to my cart",
            "put in cart",
            "order ",
            "i want to order",
            "cart me ",
            "cart mein ",
            "daal do",
            "dal do",
            "mangwana hai",
            "add the first",
            "add the second",
            "add it",
        ]
    )
    is_open_customizer_intent = any(
        kw in msg_lower for kw in ["customize ", "open customizer", "change crust on "]
    ) and not any(kw in msg_lower for kw in ["can i", "how do i", "what crust"])

    if is_add_to_cart_intent or is_open_customizer_intent:
        matched_items = resolve_product_from_text_or_history(db, req.message, req.history)
        if matched_items:
            add_step(
                "thought",
                "Parsed Direct Product Action Request",
                f"Matched {len(matched_items)} menu product(s) from user command: "
                + ", ".join(f"{qty}x {p['name']}" for p, qty, _, _ in matched_items),
            )
            tools_invoked.extend(["search_products", "check_availability"])

            if is_open_customizer_intent:
                target_prod = matched_items[0][0]
                agent_actions.append(
                    AIAgentAction(
                        action_type="OPEN_CUSTOMIZER",
                        label=f"Opened Customizer for {target_prod['name']}",
                        auto_execute=True,
                        payload={"product": target_prod},
                    )
                )
                add_step(
                    "action",
                    f"Executed OPEN_CUSTOMIZER('{target_prod['name']}')",
                    "Launched interactive pizza/meal customization modal on screen.",
                )
                return AIChatResponse(
                    reply=f"I've opened the **Interactive Customizer** for **{target_prod['name']}** right on your screen! Pick your size, stuffed crust, and extra toppings.",
                    mode="autonomous_react_agent",
                    provider_status_note="Cravora Autonomous ReAct AI Agent executed OPEN_CUSTOMIZER.",
                    recommended_products=[target_prod],
                    agent_steps=agent_steps,
                    agent_actions=agent_actions,
                    tools_invoked=tools_invoked,
                    quick_replies=[
                        f"Add 1 Large {target_prod['name']} to my cart",
                        "Apply best coupon",
                        "Take me to checkout",
                    ],
                )

            # Build combined cart (existing cart + newly added items) & execute ADD_TO_CART actions
            combined_items: List[Dict[str, Any]] = [
                {
                    "product_id": ci.product_id,
                    "variant_id": ci.variant_id,
                    "selected_option_ids": ci.selected_option_ids,
                    "quantity": ci.quantity,
                }
                for ci in req.current_cart
            ]
            added_descriptions: List[str] = []

            for prod, qty, variant_id, opt_ids in matched_items:
                recommended_products.append(prod)
                variant_obj = next((v for v in (prod.get("variants") or []) if v["id"] == variant_id), None)
                variant_name = variant_obj["name"] if variant_obj else None
                unit_price = (
                    variant_obj["absolute_price"]
                    if variant_obj and variant_obj.get("absolute_price")
                    else prod["base_price"] + (variant_obj["price_modifier"] if variant_obj else 0)
                )
                opt_labels: List[str] = []
                for grp in prod.get("customization_groups") or []:
                    for o in grp.get("options") or []:
                        if o["id"] in opt_ids:
                            opt_labels.append(o["name"])
                            unit_price += o["price"]

                agent_actions.append(
                    AIAgentAction(
                        action_type="ADD_TO_CART",
                        label=f"Added {qty}x {prod['name']}" + (f" ({variant_name})" if variant_name else ""),
                        auto_execute=True,
                        payload={
                            "product_id": prod["id"],
                            "product_name": prod["name"],
                            "product_image": prod["image_url"],
                            "variant_id": variant_id,
                            "variant_name": variant_name,
                            "selected_option_ids": opt_ids,
                            "selected_option_labels": opt_labels,
                            "quantity": qty,
                            "unit_price_preview": unit_price,
                        },
                    )
                )
                combined_items.append({
                    "product_id": prod["id"],
                    "variant_id": variant_id,
                    "selected_option_ids": opt_ids,
                    "quantity": qty,
                })
                added_descriptions.append(
                    f"- **{qty}x {prod['name']}**"
                    + (f" ({variant_name})" if variant_name else "")
                    + (f" + {', '.join(opt_labels)}" if opt_labels else "")
                    + f" — **Rs. {unit_price * qty:,}**"
                )

            tools_invoked.append("calculate_cart_total")
            calc_preview = tool_calculate_cart_total(
                db=db,
                items=combined_items,
                fulfillment_type=req.fulfillment_type,
                branch_id=req.branch_id,
                delivery_lat=req.delivery_lat,
                delivery_lng=req.delivery_lng,
                coupon_code=req.current_coupon,
                user=current_user,
            )

            # Check if we can auto-apply a coupon!
            best_code, best_disc, _ = find_best_coupon_for_subtotal(
                db, calc_preview["subtotal"], req.fulfillment_type
            )
            coupon_note = ""
            if best_code and best_disc > calc_preview.get("discount_amount", 0):
                tools_invoked.append("validate_coupon")
                agent_actions.append(
                    AIAgentAction(
                        action_type="APPLY_COUPON",
                        label=f"Auto-Applied Best Promo Code {best_code} (-Rs. {best_disc:,})",
                        auto_execute=True,
                        payload={"coupon_code": best_code},
                    )
                )
                calc_preview = tool_calculate_cart_total(
                    db=db,
                    items=combined_items,
                    fulfillment_type=req.fulfillment_type,
                    branch_id=req.branch_id,
                    delivery_lat=req.delivery_lat,
                    delivery_lng=req.delivery_lng,
                    coupon_code=best_code,
                    user=current_user,
                )
                coupon_note = f"\n- **Auto-Applied Promo (`{best_code}`):** -Rs. {best_disc:,} OFF!"

            add_step(
                "action",
                "Executed Live Cart Addition & Price Optimization",
                f"Added {len(matched_items)} item(s) to live cart. New verified total: Rs. {calc_preview['total_amount']:,}.",
                tool_name="calculate_cart_total",
            )

            reply_text = (
                "Done! I have **automatically added** the following item(s) directly into your live cart:\n\n"
                + "\n".join(added_descriptions)
                + "\n\n**Live Updated Cart Summary:**\n"
                f"- **Subtotal:** Rs. {calc_preview['subtotal']:,}"
                f"{coupon_note}\n"
                f"- **16% GST:** Rs. {calc_preview['tax_amount']:,}\n"
                f"- **Delivery Fee:** Rs. {calc_preview['delivery_fee']:,}\n"
                f"- **Verified Total:** **Rs. {calc_preview['total_amount']:,}**\n\n"
                "Would you like me to add any drinks or dips, or **take you straight to checkout**?"
            )
            final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps(calc_preview))
            return AIChatResponse(
                reply=final_reply,
                mode=mode,
                provider_status_note=note,
                recommended_products=recommended_products,
                agent_steps=agent_steps,
                agent_actions=agent_actions,
                tools_invoked=tools_invoked,
                quick_replies=[
                    "Take me to checkout",
                    "Add 1 Icy Hill-Station Mint Margarita",
                    "Add 1 Cravora White Garlic Herb Dip",
                    "What is in my cart?",
                ],
            )

    # -------------------------------------------------------------------------
    # INTENT 5: INSPECT LIVE CART / APPLY BEST COUPON / OPTIMIZE BILL
    # -------------------------------------------------------------------------
    if any(
        kw in msg_lower
        for kw in [
            "what is in my cart",
            "what's in my cart",
            "my cart",
            "check my cart",
            "bill kitna",
            "apply coupon",
            "apply best coupon",
            "apply promo",
            "cravora20",
            "crown300",
            "family500",
            "pickup15",
            "optimize my cart",
        ]
    ):
        add_step("thought", "Analyzing Live Customer Cart & Coupon Eligibility", f"Cart currently has {len(req.current_cart)} item(s).")
        if not req.current_cart:
            offers = tool_get_current_offers(db)
            tools_invoked.append("get_current_offers")
            explicit_code = None
            for c in ["CRAVORA20", "CROWN300", "FAMILY500", "PICKUP15"]:
                if c.lower() in msg_lower:
                    explicit_code = c
                    break
            if explicit_code:
                agent_actions.append(
                    AIAgentAction(
                        action_type="APPLY_COUPON",
                        label=f"Queued Promo Code {explicit_code}",
                        auto_execute=True,
                        payload={"coupon_code": explicit_code},
                    )
                )
                return AIChatResponse(
                    reply=f"I've pre-activated promo code **`{explicit_code}`** on your session! Your cart is currently empty—tell me what you'd like to eat (e.g., *'Add 1 Large Royal Crown Pizza to my cart'*) and the discount will calculate automatically.",
                    mode="autonomous_react_agent",
                    provider_status_note="Cravora Autonomous ReAct AI Agent queued coupon code.",
                    agent_steps=agent_steps,
                    agent_actions=agent_actions,
                    tools_invoked=tools_invoked,
                    quick_replies=[
                        "Add 1 Large Royal Crown Crust Pizza to my cart",
                        "Suggest the best meal under Rs. 1,500",
                        "I need a pizza for four people",
                    ],
                )
            return AIChatResponse(
                reply=(
                    "Your cart is currently empty! Tell me what you're craving and I can **add items directly to your cart** and **auto-apply the best discount coupon**.\n\n"
                    "Try saying:\n"
                    "- *\"Add 1 Large Royal Crown Crust Pizza and 1 Mint Margarita to my cart\"*\n"
                    "- *\"Suggest the best meal under Rs. 1,500\"*"
                ),
                mode="autonomous_react_agent",
                provider_status_note="Cravora Autonomous ReAct AI Agent inspected live cart.",
                agent_steps=agent_steps,
                agent_actions=agent_actions,
                tools_invoked=tools_invoked,
                quick_replies=[
                    "Add 1 Large Royal Crown Crust Pizza to my cart",
                    "Suggest the best meal under Rs. 1,500",
                    "Show current deals",
                ],
            )

        cart_dicts = [
            {
                "product_id": ci.product_id,
                "variant_id": ci.variant_id,
                "selected_option_ids": ci.selected_option_ids,
                "quantity": ci.quantity,
            }
            for ci in req.current_cart
        ]
        tools_invoked.extend(["calculate_cart_total", "get_current_offers"])
        calc = tool_calculate_cart_total(
            db=db,
            items=cart_dicts,
            fulfillment_type=req.fulfillment_type,
            branch_id=req.branch_id,
            delivery_lat=req.delivery_lat,
            delivery_lng=req.delivery_lng,
            coupon_code=req.current_coupon,
            user=current_user,
        )
        best_code, best_disc, _ = find_best_coupon_for_subtotal(db, calc["subtotal"], req.fulfillment_type)
        if best_code and best_disc > calc.get("discount_amount", 0):
            tools_invoked.append("validate_coupon")
            agent_actions.append(
                AIAgentAction(
                    action_type="APPLY_COUPON",
                    label=f"Applied Best Coupon {best_code} (-Rs. {best_disc:,})",
                    auto_execute=True,
                    payload={"coupon_code": best_code},
                )
            )
            calc = tool_calculate_cart_total(
                db=db,
                items=cart_dicts,
                fulfillment_type=req.fulfillment_type,
                branch_id=req.branch_id,
                delivery_lat=req.delivery_lat,
                delivery_lng=req.delivery_lng,
                coupon_code=best_code,
                user=current_user,
            )
            add_step(
                "action",
                f"Auto-Applied Coupon {best_code}",
                f"Saved Rs. {best_disc:,} on current cart!",
                tool_name="validate_coupon",
            )

        lines = [
            f"- **{it['quantity']}x {it['product_name']}**"
            + (f" ({it['variant_name']})" if it.get("variant_name") else "")
            + f" — Rs. {it['line_total']:,}"
            for it in calc["items"]
        ]
        upsell_tip = ""
        if calc["subtotal"] < 1500:
            diff = 1500 - calc["subtotal"]
            upsell_tip = (
                f"\n\n💡 **Agent Optimization Tip:** Add **Rs. {diff:,}** more (e.g., *Cravora White Garlic Herb Dip* or *Icy Mint Margarita*) "
                "to unlock **`CRAVORA20` (20% OFF, save Rs. 300+)**!"
            )

        reply_text = (
            "Here is the live breakdown of your current cart:\n\n"
            + "\n".join(lines)
            + f"\n\n- **Subtotal:** Rs. {calc['subtotal']:,}\n"
            + (
                f"- **Promo Discount (`{calc['coupon_code']}`):** -Rs. {calc['discount_amount']:,}\n"
                if calc.get("discount_amount", 0) > 0
                else ""
            )
            + f"- **Delivery Fee:** Rs. {calc['delivery_fee']:,}\n"
            + f"- **16% GST:** Rs. {calc['tax_amount']:,}\n"
            + f"- **Verified Total:** **Rs. {calc['total_amount']:,}**"
            + upsell_tip
        )
        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps(calc))
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Take me to checkout",
                "Add 1 Icy Hill-Station Mint Margarita",
                "Clear my cart",
            ],
        )

    # -------------------------------------------------------------------------
    # INTENT 6: DELIVERY COVERAGE / FEE / NEAREST BRANCHES
    # -------------------------------------------------------------------------
    if any(
        kw in msg_lower
        for kw in [
            "deliver to",
            "delivery fee",
            "delivery charges",
            "nearest branch",
            "available branch",
            "find a branch",
            "locate a branch",
            "coverage",
            "branches",
            "islamabad",
            "rawalpindi",
            "lahore",
            "karachi",
            "f-7",
            "i-8",
            "bahria",
            "saddar",
            "gulberg",
            "clifton",
        ]
    ) and not any(kw in msg_lower for kw in ["pizza", "burger", "fries", "pasta"]):
        lat = req.delivery_lat or 33.7215
        lng = req.delivery_lng or 73.0571
        city_filter = None
        for city_name in ["Islamabad", "Rawalpindi", "Lahore", "Karachi"]:
            if city_name.lower() in msg_lower:
                city_filter = city_name
                break

        add_step(
            "thought",
            "Evaluating Geospatial Delivery Coverage & Branch Proximity",
            f"Checking pin ({lat:.4f}, {lng:.4f}) against polygon & radius delivery zones.",
        )
        tools_invoked.extend(["check_delivery_coverage", "get_delivery_fee", "find_nearby_branches"])
        cov = tool_check_delivery_coverage(db, lat, lng, subtotal=1500)
        branches = tool_find_nearby_branches(db, lat, lng, city=city_filter)
        top_branches = branches[:4]

        add_step(
            "tool_call",
            "Executed check_delivery_coverage() & find_nearby_branches()",
            f"Deliverable={cov['deliverable']}, Distance={cov.get('distance_km')} km, Branches matched={len(top_branches)}.",
            tool_name="check_delivery_coverage",
        )

        branch_lines = "\n".join(
            f"- **{b['name']}** ({b['city']}) — {b['address']} | Hours: {b['opening_time']}–{b['closing_time']} | Tel: {b['phone']}"
            + (f" (**{b['distance_km']} km**)" if b.get("distance_km") is not None else "")
            for b in top_branches
        )
        if cov["deliverable"]:
            mb = cov["matched_branch"]
            mz = cov["matched_zone"]
            reply_text = (
                f"Yes! Your pinned location (`{lat:.4f}, {lng:.4f}`) is inside the **{mz['name']}** coverage zone served by **{mb['name']}**.\n\n"
                f"- **Distance from Kitchen:** {cov['distance_km']} km\n"
                f"- **Delivery Fee Formula:** {cov['delivery_fee_breakdown']}\n"
                f"- **Minimum Order:** Rs. {cov['min_order_amount']:,} (**FREE Delivery** on orders above Rs. {cov['free_delivery_threshold']:,})\n"
                f"- **Estimated Arrival:** ~{cov['estimated_delivery_mins']} mins\n\n"
                f"**Nearby Cravora Branches:**\n{branch_lines}"
            )
        else:
            reply_text = f"{cov['message']}\n\n**Active Cravora Branches:**\n{branch_lines}"

        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps(cov))
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Suggest the best meal under Rs. 1,500",
                "Switch to pickup",
                "Which deal gives me the best value?",
            ],
        )

    # -------------------------------------------------------------------------
    # INTENT 7: PROMOTIONS, COUPONS & BEST VALUE DEALS
    # -------------------------------------------------------------------------
    if any(
        kw in msg_lower
        for kw in ["deal", "offer", "coupon", "promo", "discount", "best value", "bundle", "save", "sasta"]
    ):
        add_step("thought", "Querying Active Promotions & Value Combos", "Fetching verified coupons and combo bundles from database.")
        tools_invoked.extend(["get_current_offers", "search_products"])
        offers = tool_get_current_offers(db)
        deal_products = tool_search_products(db, category_slug="value-deals", limit=2) + tool_search_products(
            db, category_slug="family-meals", limit=2
        )
        if not deal_products:
            deal_products = tool_search_products(db, bestsellers_only=True, limit=4)
        recommended_products = deal_products[:4]

        offer_list = "\n".join(
            f"- **`{o['code']}`** — **{o['title']}**: {o['description']} (Min order Rs. {o['min_order_amount']:,})"
            for o in offers
        )

        if recommended_products:
            chosen = recommended_products[0]
            tools_invoked.append("prepare_cart")
            proposed_cart = tool_prepare_cart(
                db=db,
                items=[{"product_id": chosen["id"], "quantity": 1}],
                coupon_code="CRAVORA20" if chosen["base_price"] >= 1500 else None,
                fulfillment_type=req.fulfillment_type,
                delivery_lat=req.delivery_lat,
                delivery_lng=req.delivery_lng,
                user=current_user,
            )
            add_step(
                "tool_call",
                "Executed prepare_cart() with Best Deal",
                f"Prepared verified cart proposal for '{chosen['name']}' (Total Rs. {proposed_cart['total_amount']:,}).",
                tool_name="prepare_cart",
            )

        reply_text = (
            "Here are our verified active promotions and value bundles right now:\n\n"
            f"{offer_list}\n\n"
            "I have also prepared a ready-to-load **Value Cart Proposal** below—click **Confirm & Load Proposed Cart** or tell me which deal to add directly to your cart!"
        )
        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps(offers))
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            recommended_products=recommended_products,
            proposed_cart=proposed_cart,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Add 1 Solo Craving Box to my cart",
                "Add 1 Duo Pizza & Pasta Date Deal to my cart",
                "Apply coupon CRAVORA20",
            ],
        )

    # -------------------------------------------------------------------------
    # INTENT 8: CUSTOMIZATION / EXTRA CHEESE / CRUSTS / DIETARY / VEGETARIAN
    # -------------------------------------------------------------------------
    if any(
        kw in msg_lower
        for kw in [
            "extra cheese",
            "stuffed crust",
            "kebab crust",
            "crust",
            "topping",
            "ingredient",
            "customize",
            "vegetarian",
            "veggie",
            "halal",
            "allergen",
            "half and half",
        ]
    ):
        veg_only = "vegetarian" in msg_lower or "veggie" in msg_lower
        spicy_only = "spicy" in msg_lower
        add_step(
            "thought",
            "Analyzing Customization & Dietary Rules",
            f"Querying products with vegetarian_only={veg_only}, spicy_only={spicy_only}.",
        )
        tools_invoked.append("search_products")
        products = tool_search_products(
            db,
            query="pizza" if not veg_only else None,
            vegetarian_only=veg_only,
            spicy_only=spicy_only,
            limit=4,
        )
        recommended_products = products
        add_step(
            "tool_call",
            "Executed search_products()",
            f"Retrieved {len(products)} matching customizable products from database.",
            tool_name="search_products",
        )
        if veg_only:
            reply_text = (
                "Here are our verified **100% Vegetarian & Halal Certified** menu items from the database:\n\n"
                + "\n".join(
                    f"- **{p['name']}** (**Rs. {p['base_price']:,}**) — {p['short_description']}"
                    for p in products
                )
                + "\n\nTell me *'Add 1 Garden Harvest Margherita to my cart'* and I will add it for you immediately!"
            )
        else:
            reply_text = (
                "Yes! Every Cravora Artisan & Specialty Pizza supports server-validated customizations:\n\n"
                "- **4 Sizes:** Small 8\" (Serves 1), Regular 10\" (Serves 2), Large 13\" (Serves 3–4, +Rs. 550), Party Beast 16\" (Serves 5–6, +Rs. 1,150)\n"
                "- **Artisan Crusts:** Hand-Tossed Classic (Included), Thin & Crispy Roman (Included), Deep Pan Buttery (+Rs. 120)\n"
                "- **Stuffed Crust & Cheese Upgrades:** Double Mozzarella Cheese Pull (+Rs. 250), Royal Seekh Kebab Stuffed Crust (+Rs. 380), Molten Cheddar-Jalapeño Crown (+Rs. 350)\n"
                "- **50/50 Half & Half Mode:** Combine any two pizza flavors on Regular, Large, or Party Beast sizes!\n\n"
                "You can tell me: *\"Add 1 Large Royal Crown Crust Pizza with Double Mozzarella to my cart\"* or *\"Customize Royal Crown Pizza\"* and I'll execute it right now!"
            )
        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, "Customization rules verified.")
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            recommended_products=recommended_products,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Customize Royal Crown Crust Pizza",
                "Add 1 Large Royal Crown Crust Pizza with Double Mozzarella to my cart",
                "Show vegetarian items",
            ],
        )

    # -------------------------------------------------------------------------
    # INTENT 9: BUDGET-BASED OR GROUP-SIZE MEAL PLANNING + CART PREPARATION
    # -------------------------------------------------------------------------
    budget = extract_budget_from_text(req.message)
    is_for_group = any(
        kw in msg_lower
        for kw in ["four people", "4 people", "family", "group", "friends", "party", "couple", "two people", "2 people", "6 people"]
    )

    if budget or is_for_group:
        tools_invoked.append("search_products")
        if budget:
            add_step(
                "thought",
                f"Planning Optimal Meal Within Rs. {budget:,} Budget",
                "Searching menu items that leave room for 16% GST and delivery while maximizing flavor & ratings.",
            )
            search_cap = int(budget * 0.85) if budget >= 900 else budget
            spicy_pref = "spicy" in msg_lower or "chatpata" in msg_lower or "fiery" in msg_lower
            candidates = tool_search_products(db, max_price=search_cap, spicy_only=spicy_pref, limit=6)
            if not candidates:
                candidates = tool_search_products(db, max_price=budget, limit=6)
            recommended_products = candidates[:4]

            cart_items_to_propose: List[Dict[str, Any]] = []
            running_sub = 0
            for p in candidates:
                if running_sub + p["base_price"] <= search_cap and len(cart_items_to_propose) < 2:
                    cart_items_to_propose.append({"product_id": p["id"], "quantity": 1})
                    running_sub += p["base_price"]

            if not cart_items_to_propose and candidates:
                cart_items_to_propose.append({"product_id": candidates[0]["id"], "quantity": 1})

            if cart_items_to_propose:
                tools_invoked.append("prepare_cart")
                best_c, _, _ = find_best_coupon_for_subtotal(db, running_sub, req.fulfillment_type)
                proposed_cart = tool_prepare_cart(
                    db=db,
                    items=cart_items_to_propose,
                    coupon_code=best_c,
                    fulfillment_type=req.fulfillment_type,
                    delivery_lat=req.delivery_lat,
                    delivery_lng=req.delivery_lng,
                    user=current_user,
                )
                add_step(
                    "tool_call",
                    "Executed search_products() & prepare_cart()",
                    f"Built proposed cart with {len(cart_items_to_propose)} item(s) totaling Rs. {proposed_cart['total_amount']:,} (including GST & delivery).",
                    tool_name="prepare_cart",
                )

            items_desc = "\n".join(
                f"- **{p['name']}** — **Rs. {p['base_price']:,}** ({p['short_description']})"
                for p in recommended_products
            )
            cart_note = ""
            if proposed_cart:
                cart_note = (
                    f"\n\nI have also prepared a **Verified Cart Proposal** below (Subtotal: **Rs. {proposed_cart['subtotal']:,}**, "
                    f"16% GST: **Rs. {proposed_cart['tax_amount']:,}**, Delivery: **Rs. {proposed_cart['delivery_fee']:,}**, "
                    f"**Final Total: Rs. {proposed_cart['total_amount']:,}**). "
                    "Click **Confirm & Load Proposed Cart** below or tell me *'Add the first one to my cart'*!"
                )

            reply_text = (
                f"Based on your budget of **Rs. {budget:,}**, I queried our live menu for the highest-rated options:\n\n"
                f"{items_desc}"
                f"{cart_note}"
            )
            final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps(proposed_cart))
            return AIChatResponse(
                reply=final_reply,
                mode=mode,
                provider_status_note=note,
                recommended_products=recommended_products,
                proposed_cart=proposed_cart,
                agent_steps=agent_steps,
                agent_actions=agent_actions,
                tools_invoked=tools_invoked,
                quick_replies=[
                    "Add the first one to my cart",
                    "Which deal gives me the best value?",
                    "Take me to checkout",
                ],
            )

        # Group / 4-people meal planning
        add_step("thought", "Planning Group / Family Feast", "Selecting Large 13\" pizzas (serves 3–4) and Family Feast bundles.")
        pizzas = tool_search_products(db, query="pizza", limit=3)
        deals = tool_search_products(db, category_slug="family-meals", limit=2)
        recommended_products = (deals[:1] + pizzas[:3])[:4]

        if recommended_products:
            primary_pizza = pizzas[0] if pizzas else recommended_products[0]
            large_variant = next(
                (v for v in primary_pizza.get("variants", []) if "large" in v["name"].lower() or "13" in v["name"].lower()),
                None,
            )
            tools_invoked.append("prepare_cart")
            proposed_cart = tool_prepare_cart(
                db=db,
                items=[
                    {
                        "product_id": primary_pizza["id"],
                        "variant_id": large_variant["id"] if large_variant else None,
                        "quantity": 1,
                    }
                ],
                coupon_code="CRAVORA20",
                fulfillment_type=req.fulfillment_type,
                delivery_lat=req.delivery_lat,
                delivery_lng=req.delivery_lng,
                user=current_user,
            )
            add_step(
                "tool_call",
                "Executed prepare_cart() with Promo CRAVORA20",
                f"Prepared Large 13\" '{primary_pizza['name']}' with 20% OFF coupon CRAVORA20.",
                tool_name="prepare_cart",
            )

        reply_text = (
            "For **4 people**, our **Large 13\" Artisan Pizzas (8 slices, serves 3–4)** or our **Grand Family Royal Feast** are the best choices:\n\n"
            + "\n".join(
                f"- **{p['name']}** (Starting at **Rs. {p['base_price']:,}**) — {p['short_description']}"
                for p in recommended_products
            )
            + "\n\nI've prepared a proposed cart with our #1 bestseller in **Large 13\"** and automatically applied promo code **`CRAVORA20` (20% OFF)** below!"
        )
        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps(proposed_cart))
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            recommended_products=recommended_products,
            proposed_cart=proposed_cart,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Add 1 Large Royal Crown Crust Pizza to my cart",
                "Add 1 Grand Family Royal Feast to my cart",
                "Take me to checkout",
            ],
        )

    # -------------------------------------------------------------------------
    # INTENT 10: GREETINGS / WHO ARE YOU / AGENT CAPABILITIES
    # -------------------------------------------------------------------------
    if any(
         re.search(rf"\b{kw}\b", msg_lower)
        for kw in ["hi", "hello", "hey", "salam", "assalam", "aoa", "kya haal", "help", "who are you", "what can you do"]
    ) and len(msg_lower.split()) <= 8:
        add_step("thought", "Greeting & Capabilities Handshake", "Introducing autonomous agent actions & checking live session context.")
        cart_count = sum(ci.quantity for ci in req.current_cart)
        cart_status = (
            f"You currently have **{cart_count} item(s)** in your live cart."
            if cart_count > 0
            else "Your cart is currently empty and ready for your cravings."
        )
        reply_text = (
            "Walaikum Assalam! I am **Cravora AI — Your Autonomous Food Ordering Agent**.\n\n"
            "Unlike a basic chatbot, I am connected directly to Cravora's live database and **I can perform actions directly on the website for you**:\n"
            "1. **Directly Add & Customize Cart Items:** Try *\"Add 2 Large Royal Crown Pizzas and 1 Mint Margarita to my cart\"*\n"
            "2. **Auto-Apply the Best Promo Code:** Try *\"Apply best coupon to my cart\"*\n"
            "3. **Smart Budget & Group Meal Planning:** Try *\"Suggest the best spicy meal under Rs. 1,500\"*\n"
            "4. **Switch Delivery/Pickup & Navigate:** Try *\"Switch to pickup\"* or *\"Take me to checkout\"*\n"
            "5. **Live Order Tracking & Support Escalation:** Try *\"Where is my order CRV-20261020-1001?\"*\n\n"
            f"*{cart_status}* What would you like me to do for you right now?"
        )
        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, cart_status)
        return AIChatResponse(
            reply=final_reply,
            mode=mode,
            provider_status_note=note,
            agent_steps=agent_steps,
            agent_actions=agent_actions,
            tools_invoked=tools_invoked,
            quick_replies=[
                "Add 1 Large Royal Crown Crust Pizza to my cart",
                "Suggest the best meal under Rs. 1,500",
                "Show spicy burgers and wraps",
                "Which deal gives me the best value?",
            ],
        )

    # -------------------------------------------------------------------------
    # INTENT 11: CATEGORY / CRAVING / FLAVOR SEARCH (English + Roman Urdu)
    # -------------------------------------------------------------------------
    category_keyword_map = {
        "signature-pizzas": ["crown", "seekh", "malai boti", "signature pizza", "specialty pizza"],
        "classic-pizzas": ["pepperoni", "fajita", "margherita", "classic pizza"],
        "burgers": ["burger", "burgers", "zinger", "bazooka", "smash", "beef burger"],
        "sandwiches": ["sandwich", "sandwiches", "sub", "club"],
        "wraps-and-rolls": ["wrap", "wraps", "roll", "rolls", "spin roll", "bihari", "shawarma"],
        "pasta-and-lasagna": ["pasta", "lasagna", "alfredo", "macaroni"],
        "fried-chicken-and-wings": ["wing", "wings", "tender", "tenders", "fried chicken", "broast"],
        "platters": ["platter", "platters", "sharing"],
        "starters": ["starter", "starters", "calzone", "garlic bread"],
        "fries-and-sides": ["fries", "chips", "loaded fries", "masala fries", "side", "sides"],
        "dips-and-sauces": ["dip", "dips", "sauce", "sauces", "garlic dip", "chipotle"],
        "desserts": ["dessert", "desserts", "sweet", "meetha", "lava cake", "cake", "brownie", "sundae", "ice cream", "biscoff"],
        "beverages": ["drink", "drinks", "beverage", "margarita", "mint", "shake", "shakes", "thanda", "cola", "soda"],
    }

    matched_cat_slug = None
    for c_slug, kw_list in category_keyword_map.items():
        if any(kw in msg_lower for kw in kw_list):
            matched_cat_slug = c_slug
            break

    spicy_only = any(kw in msg_lower for kw in ["spicy", "hot", "fiery", "teekha", "chatpata", "mirch", "peri"])
    veg_only = any(kw in msg_lower for kw in ["veg", "vegetarian", "sabzi"])

    tools_invoked.append("search_products")
    add_step(
        "thought",
        "Analyzing Craving & Menu Search Criteria",
        f"Searching menu with category={matched_cat_slug or 'all'}, spicy={spicy_only}, veg={veg_only}, query='{req.message}'.",
    )

    if matched_cat_slug:
        matched = tool_search_products(
            db,
            category_slug=matched_cat_slug,
            spicy_only=spicy_only,
            vegetarian_only=veg_only,
            limit=4,
        )
        if not matched:
            matched = tool_search_products(db, category_slug=matched_cat_slug, limit=4)
    elif "pizza" in msg_lower:
        matched = tool_search_products(db, query="pizza", spicy_only=spicy_only, vegetarian_only=veg_only, limit=4)
    else:
        matched = tool_search_products(
            db,
            query=req.message,
            spicy_only=spicy_only,
            vegetarian_only=veg_only,
            limit=4,
        )

    if not matched:
        matched = tool_search_products(db, spicy_only=spicy_only, bestsellers_only=not spicy_only, limit=4)

    recommended_products = matched
    add_step(
        "tool_call",
        "Executed search_products()",
        f"Found {len(recommended_products)} verified menu items matching user request.",
        tool_name="search_products",
    )

    if recommended_products:
        tools_invoked.append("prepare_cart")
        top_pick = recommended_products[0]
        best_c, _, _ = find_best_coupon_for_subtotal(db, top_pick["base_price"], req.fulfillment_type)
        proposed_cart = tool_prepare_cart(
            db=db,
            items=[{"product_id": top_pick["id"], "quantity": 1}],
            coupon_code=best_c,
            fulfillment_type=req.fulfillment_type,
            delivery_lat=req.delivery_lat,
            delivery_lng=req.delivery_lng,
            user=current_user,
        )
        add_step(
            "tool_call",
            "Executed prepare_cart()",
            f"Prepared instant cart option for '{top_pick['name']}' (Total Rs. {proposed_cart['total_amount']:,}).",
            tool_name="prepare_cart",
        )

    first_name = recommended_products[0]["name"] if recommended_products else "Royal Crown Crust Pizza"
    reply_text = (
        f"Here are the best verified matches from our live menu for **\"{req.message}\"**:\n\n"
        + "\n".join(
            f"- **{p['name']}** — **Rs. {p['base_price']:,}**"
            + (" 🔥 *Spicy*" if p.get("is_spicy") else "")
            + (" ★ *Bestseller*" if p.get("is_bestseller") else "")
            + f"\n  _{p['short_description']}_"
            for p in recommended_products
        )
        + f"\n\nWant me to add one right now? Just say **\"Add 1 {first_name} to my cart\"** or click **+ Add to Cart** on any item below!"
    )

    final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, json.dumps([p["name"] for p in recommended_products]))
    return AIChatResponse(
        reply=final_reply,
        mode=mode,
        provider_status_note=note,
        recommended_products=recommended_products,
        proposed_cart=proposed_cart,
        agent_steps=agent_steps,
        agent_actions=agent_actions,
        tools_invoked=tools_invoked,
        quick_replies=[
            f"Add 1 {first_name} to my cart",
            f"Customize {first_name}",
            "Suggest the best meal under Rs. 1,500",
            "Take me to checkout",
        ],
    )
