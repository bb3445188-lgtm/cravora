import hashlib
import hmac
import json
import secrets
from typing import Any, Dict, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.models import Order, OrderStatusHistory, Payment


def get_payment_methods_status() -> List[Dict[str, Any]]:
    """Return available payment methods and their honest activation status."""
    card_activated = bool(settings.SAFEPAY_MERCHANT_KEY.strip())
    jazzcash_activated = bool(settings.JAZZCASH_MERCHANT_ID.strip())
    easypaisa_activated = bool(settings.EASYPAISA_STORE_ID.strip())

    return [
        {
            "id": "cod",
            "name": "Cash on Delivery / Pay at Counter",
            "provider": "cod",
            "is_activated": True,
            "badge": "Available Now",
            "description": "Pay in Pakistani Rupees (PKR) upon delivery or branch collection.",
        },
        {
            "id": "card_online",
            "name": "Visa / Mastercard (Safepay / Stripe Adapter)",
            "provider": "safepay_card",
            "is_activated": card_activated,
            "badge": "Live Activated" if card_activated else "Sandbox / Pending Merchant Key",
            "description": (
                "Secure 3D-Secure online card checkout."
                if card_activated
                else "Integration architecture & HMAC webhook verifier ready. Set SAFEPAY_MERCHANT_KEY in .env to enable live card charging."
            ),
        },
        {
            "id": "wallet_jazzcash",
            "name": "JazzCash Mobile Account",
            "provider": "jazzcash_wallet",
            "is_activated": jazzcash_activated,
            "badge": "Live Activated" if jazzcash_activated else "Not Yet Activated (Requires Merchant ID)",
            "description": (
                "Instant mobile wallet payment via JazzCash MPIN."
                if jazzcash_activated
                else "Adapter ready. Configure JAZZCASH_MERCHANT_ID in .env to activate live wallet prompts."
            ),
        },
        {
            "id": "wallet_easypaisa",
            "name": "Easypaisa Digital Wallet",
            "provider": "easypaisa_wallet",
            "is_activated": easypaisa_activated,
            "badge": "Live Activated" if easypaisa_activated else "Not Yet Activated (Requires Store ID)",
            "description": (
                "Direct payment from your Easypaisa mobile account."
                if easypaisa_activated
                else "Adapter ready. Configure EASYPAISA_STORE_ID in .env to activate live wallet prompts."
            ),
        },
    ]


def compute_webhook_signature(payload_bytes: bytes) -> str:
    return hmac.new(
        settings.SAFEPAY_WEBHOOK_SECRET.encode("utf-8"),
        payload_bytes,
        hashlib.sha256,
    ).hexdigest()


def verify_webhook_signature(payload_bytes: bytes, provided_signature: str) -> bool:
    if not provided_signature:
        return False
    expected = compute_webhook_signature(payload_bytes)
    return hmac.compare_digest(expected, provided_signature.strip())


def initialize_order_payment(db: Session, order: Order) -> Payment:
    provider_map = {
        "cod": "cod",
        "card_online": "safepay_card",
        "wallet_jazzcash": "jazzcash_wallet",
        "wallet_easypaisa": "easypaisa_wallet",
    }
    provider = provider_map.get(order.payment_method, "cod")
    tx_ref = f"PAY-{order.order_reference}-{secrets.token_hex(3).upper()}"
    session_id = f"sess_{secrets.token_urlsafe(12)}" if provider != "cod" else None

    initial_status = "pending_cod" if provider == "cod" else "initiated"
    payment = Payment(
        order_id=order.id,
        provider=provider,
        transaction_reference=tx_ref,
        session_id=session_id,
        amount=order.total_amount,
        currency="PKR",
        status=initial_status,
        signature_verified=(provider == "cod"),
        raw_response_json=json.dumps({
            "provider": provider,
            "mode": "cod" if provider == "cod" else "adapter_session",
            "note": (
                "Pay cash upon delivery/collection"
                if provider == "cod"
                else "Awaiting signed provider webhook callback verification"
            ),
        }),
    )
    db.add(payment)
    return payment


def process_verified_payment_webhook(
    db: Session,
    payload_bytes: bytes,
    signature_header: str,
) -> Dict[str, Any]:
    if not verify_webhook_signature(payload_bytes, signature_header):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid payment webhook HMAC signature. Callback rejected.",
        )

    try:
        data = json.loads(payload_bytes.decode("utf-8"))
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Malformed JSON webhook payload.",
        )

    tx_ref = data.get("transaction_reference")
    event_status = data.get("status")  # 'paid', 'failed', 'cancelled', 'refunded'

    if not tx_ref or event_status not in ("paid", "failed", "cancelled", "refunded"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing transaction_reference or unsupported payment status.",
        )

    payment = db.query(Payment).filter(Payment.transaction_reference == tx_ref).first()
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Payment transaction '{tx_ref}' not found.",
        )

    # Idempotency guard: prevent duplicate payment processing
    if payment.status == "paid" and event_status == "paid":
        return {
            "status": "already_processed",
            "transaction_reference": payment.transaction_reference,
            "order_reference": payment.order.order_reference,
            "payment_status": payment.order.payment_status,
        }

    payment.status = event_status
    payment.signature_verified = True
    payment.raw_response_json = json.dumps(data)

    order = payment.order
    if event_status == "paid":
        order.payment_status = "paid"
        if order.status == "order_placed":
            order.status = "order_confirmed"
            db.add(
                OrderStatusHistory(
                    order_id=order.id,
                    status="order_confirmed",
                    note=f"Online payment verified via signed webhook ({tx_ref}).",
                )
            )
    elif event_status in ("failed", "cancelled"):
        order.payment_status = "failed"
    elif event_status == "refunded":
        order.payment_status = "refunded"

    db.commit()
    db.refresh(payment)
    return {
        "status": "processed",
        "transaction_reference": payment.transaction_reference,
        "order_reference": order.order_reference,
        "payment_status": order.payment_status,
        "order_status": order.status,
    }
