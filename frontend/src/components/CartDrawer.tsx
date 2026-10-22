import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  CheckCircle2,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { formatPKR } from '../api/client';
import { useStore } from '../context/StoreContext';

export const CartDrawer: React.FC = () => {
  const {
    isCartOpen,
    setIsCartOpen,
    cartItems,
    cartSummary,
    isCalculatingCart,
    updateCartItemQuantity,
    removeFromCart,
    clearCart,
    couponCode,
    setCouponCode,
    user,
    redeemLoyaltyPoints,
    setRedeemLoyaltyPoints,
    addToCart,
    fulfillmentType,
    selectedBranch,
    deliveryLocation,
    setIsLocationModalOpen,
  } = useStore();

  const navigate = useNavigate();
  const [couponInput, setCouponInput] = useState(couponCode);

  if (!isCartOpen) return null;

  const totalItemsCount = cartItems.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
    >
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden">
        {/* Top Header */}
        <div className="px-6 py-4 bg-cravora-charcoal text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cravora-red flex items-center justify-center">
              <ShoppingBag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id="cart-drawer-title" className="text-base font-extrabold">
                Your Craving Bag ({totalItemsCount})
              </h2>
              <p className="text-[11px] text-stone-300">
                {fulfillmentType === 'delivery'
                  ? `Delivering to ${deliveryLocation.area}, ${deliveryLocation.city}`
                  : `Pickup at ${selectedBranch?.name || 'Cravora Branch'}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cartItems.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs text-stone-300 hover:text-red-400 px-2 py-1 rounded transition"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsCartOpen(false)}
              className="p-2 rounded-full hover:bg-white/10 text-stone-300 hover:text-white transition"
              aria-label="Close cart drawer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Fulfillment Summary Strip */}
        <div className="px-5 py-2.5 bg-cravora-cream border-b border-stone-200 flex items-center justify-between text-xs">
          <span className="font-semibold text-stone-700 truncate">
            {fulfillmentType === 'delivery'
              ? `📍 ${deliveryLocation.formatted_address}`
              : `🏪 Pickup: ${selectedBranch?.name}`}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsCartOpen(false);
              setIsLocationModalOpen(true);
            }}
            className="text-cravora-red font-extrabold hover:underline shrink-0 ml-2"
          >
            Change
          </button>
        </div>

        {/* Cart Body */}
        {cartItems.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            {/* Custom SVG Empty Cart Illustration */}
            <svg
              className="w-36 h-36 mb-4"
              viewBox="0 0 160 160"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="80" cy="80" r="68" fill="#FEF2F2" />
              <path
                d="M46 62H114L106 118C105.5 122 102 125 98 125H62C58 125 54.5 122 54 118L46 62Z"
                fill="#FFFFFF"
                stroke="#D92B2B"
                strokeWidth="4"
              />
              <path
                d="M64 62V50C64 41.1634 71.1634 34 80 34C88.8366 34 96 41.1634 96 50V62"
                stroke="#18181B"
                strokeWidth="4"
                strokeLinecap="round"
              />
              <path d="M68 85L80 73L92 85" stroke="#F97316" strokeWidth="4" strokeLinecap="round" />
              <circle cx="80" cy="98" r="5" fill="#D92B2B" />
            </svg>
            <h3 className="text-lg font-extrabold text-stone-900">
              Your Craving Bag is Empty
            </h3>
            <p className="text-xs text-stone-500 mt-1 max-w-xs leading-relaxed">
              Explore our Royal Crown Crust pizzas, monster crunch burgers, or ask Cravora AI to build a meal within your budget!
            </p>
            <button
              type="button"
              onClick={() => {
                setIsCartOpen(false);
                navigate('/menu');
              }}
              className="mt-5 px-6 py-3 rounded-2xl bg-cravora-red hover:bg-cravora-redDark text-white text-xs font-extrabold shadow-glow transition"
            >
              Explore Full Menu
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Cart Item List */}
            <div className="space-y-3">
              {cartItems.map((item) => {
                const serverMatched = cartSummary?.items.find(
                  (vi) =>
                    vi.product_id === item.product_id &&
                    (vi.variant_id || null) === (item.variant_id || null)
                );
                const unitPrice = serverMatched ? serverMatched.unit_price : item.unit_price_preview;

                return (
                  <div
                    key={item.cart_item_key}
                    className="p-3.5 rounded-2xl border border-stone-200 bg-white shadow-sm flex gap-3.5"
                  >
                    <img
                      src={item.product_image}
                      alt={item.product_name}
                      className="w-16 h-16 rounded-xl object-cover shrink-0 bg-stone-100"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-xs font-extrabold text-stone-900 truncate">
                          {item.product_name}
                        </h4>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.cart_item_key)}
                          className="text-stone-400 hover:text-red-600 transition"
                          aria-label={`Remove ${item.product_name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {item.variant_name && (
                        <span className="inline-block mt-0.5 px-2 py-0.5 rounded bg-stone-100 text-stone-700 text-[10px] font-bold">
                          {item.variant_name}
                        </span>
                      )}

                      {item.selected_option_labels && item.selected_option_labels.length > 0 && (
                        <p className="text-[11px] text-stone-500 mt-1 line-clamp-2">
                          {item.selected_option_labels.join(' • ')}
                        </p>
                      )}

                      {item.special_instructions && (
                        <p className="text-[10px] italic text-amber-700 mt-0.5">
                          Note: "{item.special_instructions}"
                        </p>
                      )}

                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-xs font-extrabold text-cravora-red">
                          {formatPKR(unitPrice * item.quantity)}
                        </span>
                        <div className="inline-flex items-center rounded-xl border border-stone-200 bg-stone-50">
                          <button
                            type="button"
                            onClick={() => updateCartItemQuantity(item.cart_item_key, -1)}
                            className="w-7 h-7 flex items-center justify-center text-stone-700 hover:text-cravora-red"
                            aria-label="Decrease item quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-extrabold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateCartItemQuantity(item.cart_item_key, 1)}
                            className="w-7 h-7 flex items-center justify-center text-stone-700 hover:text-cravora-red"
                            aria-label="Increase item quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Coupon Code Box */}
            <div className="p-3.5 rounded-2xl bg-cravora-cream border border-stone-200 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-stone-800">
                <Tag className="w-3.5 h-3.5 text-cravora-red" />
                <span>Apply Promo or Coupon Code</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  placeholder="Enter code (e.g. CRAVORA20)"
                  className="flex-1 px-3 py-2 rounded-xl border border-stone-300 text-xs font-bold uppercase focus:border-cravora-red focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setCouponCode(couponInput.trim().toUpperCase())}
                  className="px-4 py-2 rounded-xl bg-cravora-charcoal hover:bg-cravora-red text-white text-xs font-extrabold transition"
                >
                  Apply
                </button>
              </div>
              {/* Quick Apply Chips */}
              <div className="flex flex-wrap gap-1.5">
                {['CRAVORA20', 'CROWN300', 'FAMILY500', 'PICKUP15'].map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => {
                      setCouponInput(code);
                      setCouponCode(code);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold border transition ${
                      couponCode === code
                        ? 'bg-cravora-red text-white border-cravora-red'
                        : 'bg-white text-stone-700 border-stone-200 hover:border-cravora-red'
                    }`}
                  >
                    {code}
                  </button>
                ))}
              </div>
              {cartSummary?.coupon_message && (
                <div
                  className={`text-[11px] font-bold flex items-center gap-1.5 ${
                    cartSummary.coupon_valid ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{cartSummary.coupon_message}</span>
                </div>
              )}
            </div>

            {/* Loyalty Points Redemption (Authenticated Users) */}
            {user && user.loyalty_points > 0 && (
              <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Award className="w-5 h-5 text-amber-600 shrink-0" />
                  <div>
                    <div className="text-xs font-extrabold text-stone-900">
                      Redeem {user.loyalty_points} Cravora Points
                    </div>
                    <div className="text-[11px] text-stone-600">
                      Save up to {formatPKR(user.loyalty_points)} on this order
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={redeemLoyaltyPoints > 0}
                  onChange={(e) =>
                    setRedeemLoyaltyPoints(e.target.checked ? user.loyalty_points : 0)
                  }
                  className="w-4 h-4 accent-cravora-red rounded cursor-pointer"
                />
              </div>
            )}

            {/* Server-Recommended Add-ons */}
            {cartSummary?.recommended_addons && cartSummary.recommended_addons.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 text-xs font-extrabold text-stone-800 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-cravora-orange" />
                  <span>Complete Your Meal (Quick Add)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {cartSummary.recommended_addons.slice(0, 4).map((addon) => (
                    <div
                      key={addon.id}
                      className="p-2 rounded-xl border border-stone-200 bg-stone-50 flex items-center gap-2"
                    >
                      <img
                        src={addon.image_url}
                        alt={addon.name}
                        className="w-10 h-10 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-[11px] font-bold text-stone-900 truncate">
                          {addon.name}
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[10px] font-extrabold text-cravora-red">
                            {formatPKR(addon.base_price)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              addToCart({
                                product_id: addon.id,
                                product_name: addon.name,
                                product_image: addon.image_url,
                                variant_id: null,
                                variant_name: null,
                                selected_option_ids: [],
                                selected_option_labels: [],
                                quantity: 1,
                                unit_price_preview: addon.base_price,
                              })
                            }
                            className="px-2 py-0.5 rounded bg-cravora-charcoal hover:bg-cravora-red text-white text-[10px] font-bold"
                          >
                            + Add
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Sticky Checkout Summary Footer */}
        {cartItems.length > 0 && (
          <div className="p-5 bg-stone-50 border-t border-stone-200 space-y-3">
            {cartSummary ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal</span>
                  <span className="font-bold text-stone-900">{formatPKR(cartSummary.subtotal)}</span>
                </div>
                {cartSummary.discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Promo / Loyalty Savings</span>
                    <span>-{formatPKR(cartSummary.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-600">
                  <span>
                    {fulfillmentType === 'delivery' ? 'Delivery Charge' : 'Store Pickup'}
                  </span>
                  <span className="font-bold text-stone-900">
                    {cartSummary.delivery_fee === 0
                      ? 'FREE'
                      : formatPKR(cartSummary.delivery_fee)}
                  </span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>GST ({cartSummary.tax_rate_percent}%)</span>
                  <span className="font-bold text-stone-900">{formatPKR(cartSummary.tax_amount)}</span>
                </div>
                <div className="flex justify-between text-sm font-extrabold text-stone-900 pt-2 border-t border-stone-200">
                  <span>Grand Total (Verified)</span>
                  <span className="text-cravora-red text-base">
                    {formatPKR(cartSummary.total_amount)}
                  </span>
                </div>
                {!cartSummary.meets_min_order && fulfillmentType === 'delivery' && (
                  <p className="text-[11px] font-bold text-red-600 pt-1">
                    Minimum delivery order for your zone is {formatPKR(cartSummary.min_order_amount)}. Add{' '}
                    {formatPKR(cartSummary.min_order_amount - cartSummary.subtotal)} more or switch to Pickup.
                  </p>
                )}
              </div>
            ) : (
              <div className="text-xs text-stone-500">
                {isCalculatingCart ? 'Calculating verified total...' : 'Updating cart...'}
              </div>
            )}

            <button
              type="button"
              disabled={
                isCalculatingCart ||
                (fulfillmentType === 'delivery' && cartSummary !== null && !cartSummary.meets_min_order)
              }
              onClick={() => {
                setIsCartOpen(false);
                navigate('/checkout');
              }}
              className="w-full py-3.5 px-6 rounded-2xl bg-cravora-red hover:bg-cravora-redDark disabled:bg-stone-300 text-white font-extrabold text-sm shadow-glow flex items-center justify-center gap-2 transition"
            >
              <span>Proceed to Secure Checkout</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
