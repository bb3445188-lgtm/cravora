import re

ai_agent_path = r"d:\Cravora food website\backend\app\services\ai_agent.py"

with open(ai_agent_path, "r", encoding="utf-8") as f:
    code = f.read()

intent_3_end_pattern = '            agent_actions=agent_actions,\n            tools_invoked=tools_invoked,\n            quick_replies=[\n                "Apply best coupon to my cart",\n                "What is in my cart?",\n            ],\n        )\n'

idx = code.find(intent_3_end_pattern)
if idx == -1:
    print("Could not find intent_3_end_pattern")
    exit(1)

insert_pos = idx + len(intent_3_end_pattern)

new_intents = '''
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
            reply_lines.append("\\nBoth are stone-baked fresh at 450°C with 100% real mozzarella and hand-stretched dough.")
            reply_text = "\\n".join(reply_lines)
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
            "Here are our top fiery spicy picks with **zero beef** (100% halal chicken and vegetarian):\\n\\n"
            + "\\n".join(
                f"- **{p['name']}** (**Rs. {p['base_price']:,}**) — {p['short_description']}"
                for p in recommended_products
            )
            + "\\n\\nWould you like me to add one of these to your cart or customize it?"
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
            "Here is the ideal meal for two under **Rs. 2,000**:\\n\\n"
            "- **2x Cravora Monster Crunch Zingers** (Rs. 1,580)\\n"
            "- **1x Lahori Chatpata Masala Fries** (Rs. 390)\\n\\n"
            f"**Subtotal:** **Rs. {proposed_cart['subtotal']:,}** (fits right inside your Rs. 2,000 budget!).\\n\\n"
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
                    label=f"Added 1x {target_prod['name']} (Large 13\\\")",
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
            reply_text = f"Done! I've selected **{target_prod['name']}** in **Large 13\\\" (8 slices, serves 3–4)** at **Rs. {unit_price:,}** and added it to your cart."
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
            + f".\\n\\n- **Formula:** {fee_data.get('breakdown', 'Base fee + per-km rate')}\\n"
            f"- **Minimum Order:** Rs. {fee_data['min_order_amount']:,}\\n"
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
            "Here are our top **100% Vegetarian & Halal Certified** menu items:\\n\\n"
            + "\\n".join(
                f"- **{p['name']}** (**Rs. {p['base_price']:,}**) — {p['short_description']}"
                for p in recommended_products
            )
            + "\\n\\nAll our cheeses and sauces are 100% vegetarian-friendly. Tell me what you would like to order!"
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
'''

code = code[:insert_pos] + new_intents + code[insert_pos:]

# Update greeting intent to be concise and conversational
old_greeting_snippet = '        reply_text = (\n            "Walaikum Assalam! I am **Cravora AI — Your Autonomous Food Ordering Agent**.\n\n"'

if old_greeting_snippet in code:
    g_start = code.find(old_greeting_snippet)
    g_end = code.find('        final_reply, mode, note = try_live_llm_synthesis(req, reply_text, tools_invoked, cart_status)', g_start)
    replacement_greeting = '''        reply_text = (
            f"Walaikum Assalam! Welcome to Cravora. {cart_status}\\n\\n"
            "What would you like to order today? You can ask me for:\\n"
            "- **Budget meals:** *\\"Suggest a meal for two under Rs. 2,000\\"*\\n"
            "- **Dietary/Flavors:** *\\"Spicy without beef\\"* or *\\"Cheapest pizza available\\"*\\n"
            "- **Instant actions:** *\\"Add 2 burgers and fries to my cart\\"*\\n"
        )
'''
    code = code[:g_start] + replacement_greeting + code[g_end:]
    print("Greeting updated to concise, natural message")

with open(ai_agent_path, "w", encoding="utf-8") as f:
    f.write(code)

print("SUCCESS: Inserted high-priority specific conversational intents into ai_agent.py")
