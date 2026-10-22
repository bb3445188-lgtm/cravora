import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CreditCard,
  Lock,
  MapPin,
  ShieldCheck,
  Store,
  Truck,
  Wallet,
} from 'lucide-react';
import { apiFetch, formatPKR } from '../api/client';
import { InteractiveMap } from '../components/InteractiveMap';
import { useStore } from '../context/StoreContext';
import { Order } from '../types';

const checkoutSchema = z.object({
  customer_name: z.string().min(2, 'Full name is required (at least 2 characters)'),
  customer_phone: z
    .string()
    .min(8, 'Valid Pakistani phone number required (e.g. +92 300 1234567)'),
  customer_email: z.string().email('Enter a valid email').optional().or(z.literal('')),
  house_number: z.string().min(1, 'House / Flat number is required'),
  street: z.string().min(1, 'Street / Block is required'),
  area: z.string().min(1, 'Sector / Area is required'),
  city: z.string().min(2, 'City is required'),
  landmark: z.string().optional(),
  delivery_instructions: z.string().optional(),
  order_notes: z.string().optional(),
  payment_method: z.enum(['cod', 'card_online', 'wallet_jazzcash', 'wallet_easypaisa']),
  accept_terms: z.boolean().refine((v) => v === true, {
    message: 'Please accept the Cravora order & cancellation terms to place your order.',
  }),
});

type CheckoutFormValues = z.infer<typeof checkoutSchema>;

interface PaymentMethodInfo {
  id: 'cod' | 'card_online' | 'wallet_jazzcash' | 'wallet_easypaisa';
  name: string;
  provider: string;
  is_activated: boolean;
  badge: string;
  description: string;
}

export const CheckoutPage: React.FC = () => {
  const {
    user,
    cartItems,
    cartSummary,
    fulfillmentType,
    setFulfillmentType,
    selectedBranch,
    branches,
    deliveryLocation,
    updateDeliveryLocation,
    setIsLocationModalOpen,
    couponCode,
    redeemLoyaltyPoints,
    clearCart,
    refreshUser,
    addToast,
  } = useStore();

  const navigate = useNavigate();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodInfo[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: {
      customer_name: user?.full_name || '',
      customer_phone: user?.phone || '+92 333 5129081',
      customer_email: user?.email || '',
      house_number: deliveryLocation.house_number || 'House 14-B',
      street: deliveryLocation.street || 'Street 28',
      area: deliveryLocation.area || 'F-7 Markaz',
      city: deliveryLocation.city || 'Islamabad',
      landmark: deliveryLocation.landmark || '',
      delivery_instructions: deliveryLocation.delivery_instructions || '',
      order_notes: '',
      payment_method: 'cod',
      accept_terms: true,
    },
  });

  useEffect(() => {
    if (user) {
      setValue('customer_name', user.full_name);
      setValue('customer_phone', user.phone);
      setValue('customer_email', user.email);
    }
  }, [user, setValue]);

  useEffect(() => {
    setValue('house_number', deliveryLocation.house_number || 'House 14-B');
    setValue('street', deliveryLocation.street || 'Street 28');
    setValue('area', deliveryLocation.area || 'F-7 Markaz');
    setValue('city', deliveryLocation.city || 'Islamabad');
  }, [deliveryLocation, setValue]);

  useEffect(() => {
    apiFetch<PaymentMethodInfo[]>('/api/payments/methods')
      .then((res) => setPaymentMethods(res))
      .catch(() => {});
  }, []);

  const selectedPaymentMethod = watch('payment_method');

  if (cartItems.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-3xl font-black text-stone-900">
          Your Craving Bag is Empty
        </h1>
        <p className="text-sm text-stone-600">
          Add pizzas, burgers, or meal deals to your cart before proceeding to checkout.
        </p>
        <Link
          to="/menu"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-cravora-red text-white text-xs font-extrabold"
        >
          <ArrowLeft className="w-4 h-4" /> Browse Menu
        </Link>
      </div>
    );
  }

  const onSubmit = async (values: CheckoutFormValues) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const createdOrder = await apiFetch<Order>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: values.customer_name,
          customer_phone: values.customer_phone,
          customer_email: values.customer_email || null,
          fulfillment_type: fulfillmentType,
          branch_id: selectedBranch?.id || null,
          delivery_address:
            fulfillmentType === 'delivery'
              ? {
                  house_number: values.house_number,
                  street: values.street,
                  area: values.area,
                  city: values.city,
                  landmark: values.landmark || null,
                  delivery_instructions: values.delivery_instructions || null,
                  latitude: deliveryLocation.latitude,
                  longitude: deliveryLocation.longitude,
                  formatted_address: `${values.house_number}, ${values.street}, ${values.area}, ${values.city}`,
                }
              : null,
          items: cartItems.map((i) => ({
            product_id: i.product_id,
            variant_id: i.variant_id || null,
            selected_option_ids: i.selected_option_ids,
            half_and_half_product_id: i.half_and_half_product_id || null,
            quantity: i.quantity,
            special_instructions: i.special_instructions || null,
          })),
          coupon_code: couponCode.trim() || null,
          redeem_loyalty_points: redeemLoyaltyPoints,
          payment_method: values.payment_method,
          order_notes: values.order_notes || null,
        }),
      });

      // Store guest verification token & phone locally so customer can track immediately
      localStorage.setItem('cravora_last_order_ref', createdOrder.order_reference);
      if (createdOrder.guest_verification_token) {
        localStorage.setItem(
          `cravora_order_token_${createdOrder.order_reference}`,
          createdOrder.guest_verification_token
        );
      }
      localStorage.setItem('cravora_last_order_phone', values.customer_phone);

      clearCart();
      if (user) {
        await refreshUser();
      }
      addToast(
        `Order ${createdOrder.order_reference} Confirmed!`,
        `Your order has been sent to ${createdOrder.branch_name}.`,
        'success'
      );
      navigate(
        `/track-order?ref=${createdOrder.order_reference}&token=${
          createdOrder.guest_verification_token || ''
        }`
      );
    } catch (err: any) {
      setSubmitError(err.message || 'Could not place order. Please review your details.');
      addToast('Checkout Error', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const cov = deliveryLocation.coverage;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            to="/menu"
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-stone-600 hover:text-cravora-red mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Menu
          </Link>
          <h1 className="font-display text-3xl sm:text-4xl font-black text-stone-900">
            Secure Order Checkout
          </h1>
        </div>
        <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Server-Validated Pricing & Transactional Order Protection</span>
        </div>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
      >
        {/* Left Column: Customer, Fulfillment, Map & Payment */}
        <div className="lg:col-span-7 space-y-6">
          {/* 1. Fulfillment Method */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-stone-900">
                1. Fulfillment Method & Coverage
              </h2>
              <button
                type="button"
                onClick={() => setIsLocationModalOpen(true)}
                className="text-xs font-extrabold text-cravora-red hover:underline"
              >
                Open Full Map & Zone Selector
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFulfillmentType('delivery')}
                className={`p-4 rounded-2xl border-2 text-left flex items-center gap-3 transition ${
                  fulfillmentType === 'delivery'
                    ? 'border-cravora-red bg-red-50/40'
                    : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <Truck className="w-5 h-5 text-cravora-red shrink-0" />
                <div>
                  <div className="text-sm font-extrabold text-stone-900">Home Delivery</div>
                  <div className="text-[11px] text-stone-500">
                    Hot to your doorstep with zone validation
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFulfillmentType('pickup')}
                className={`p-4 rounded-2xl border-2 text-left flex items-center gap-3 transition ${
                  fulfillmentType === 'pickup'
                    ? 'border-cravora-red bg-red-50/40'
                    : 'border-stone-200 hover:border-stone-300'
                }`}
              >
                <Store className="w-5 h-5 text-cravora-red shrink-0" />
                <div>
                  <div className="text-sm font-extrabold text-stone-900">Branch Pickup</div>
                  <div className="text-[11px] text-stone-500">
                    Zero delivery fee • Ready in ~20 mins
                  </div>
                </div>
              </button>
            </div>

            {fulfillmentType === 'delivery' ? (
              <div className="space-y-4 pt-2">
                <InteractiveMap
                  centerLat={deliveryLocation.latitude}
                  centerLng={deliveryLocation.longitude}
                  zoom={14}
                  branches={branches}
                  showDeliveryZones={true}
                  interactivePin={true}
                  onSelectCoordinates={(lat, lng) =>
                    updateDeliveryLocation({ latitude: lat, longitude: lng }, true)
                  }
                  heightClass="h-56"
                />

                {cov && !cov.deliverable && (
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-900 flex items-start gap-2.5">
                    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-extrabold">Unsupported Delivery Location</div>
                      <p>{cov.message}</p>
                      <button
                        type="button"
                        onClick={() => setFulfillmentType('pickup')}
                        className="mt-1 px-3 py-1.5 rounded-xl bg-cravora-charcoal text-white font-bold"
                      >
                        Switch to Branch Pickup Instead
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      House / Flat / Building No. *
                    </label>
                    <input
                      {...register('house_number')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                    />
                    {errors.house_number && (
                      <p className="text-[11px] text-red-600 mt-1">{errors.house_number.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Street / Road / Block *
                    </label>
                    <input
                      {...register('street')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                    />
                    {errors.street && (
                      <p className="text-[11px] text-red-600 mt-1">{errors.street.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Sector / Area *
                    </label>
                    <input
                      {...register('area')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                    />
                    {errors.area && (
                      <p className="text-[11px] text-red-600 mt-1">{errors.area.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      City *
                    </label>
                    <input
                      {...register('city')}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Nearest Landmark
                    </label>
                    <input
                      {...register('landmark')}
                      placeholder="e.g. Opposite Park"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1">
                      Delivery Instructions
                    </label>
                    <input
                      {...register('delivery_instructions')}
                      placeholder="e.g. Ring bell twice"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-cravora-cream border border-stone-200 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <MapPin className="w-5 h-5 text-cravora-red shrink-0 mt-0.5" />
                  <div className="text-xs">
                    <div className="font-extrabold text-stone-900">
                      Pickup Branch: {selectedBranch?.name}
                    </div>
                    <div className="text-stone-600 mt-0.5">{selectedBranch?.address}</div>
                    <div className="text-stone-500 mt-1">
                      Hours: {selectedBranch?.opening_time} – {selectedBranch?.closing_time} • Est. Ready in ~
                      {selectedBranch?.prep_time_mins || 20} mins
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLocationModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-stone-300 text-xs font-bold shrink-0"
                >
                  Change Branch
                </button>
              </div>
            )}
          </div>

          {/* 2. Customer Contact Details */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-card space-y-4">
            <h2 className="text-lg font-extrabold text-stone-900">
              2. Customer Contact Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Full Name *
                </label>
                <input
                  {...register('customer_name')}
                  placeholder="Your Full Name"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                />
                {errors.customer_name && (
                  <p className="text-[11px] text-red-600 mt-1">{errors.customer_name.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Mobile Number (For Verification) *
                </label>
                <input
                  {...register('customer_phone')}
                  placeholder="+92 300 1234567"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                />
                {errors.customer_phone && (
                  <p className="text-[11px] text-red-600 mt-1">{errors.customer_phone.message}</p>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Email Address (Optional)
                </label>
                <input
                  {...register('customer_email')}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Kitchen / Order Notes (Optional)
              </label>
              <input
                {...register('order_notes')}
                placeholder="Any special requests for the kitchen team (e.g. extra chili flakes, cut into 8 slices)..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs"
              />
            </div>
          </div>

          {/* 3. Payment Method Selection */}
          <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-card space-y-4">
            <h2 className="text-lg font-extrabold text-stone-900">
              3. Payment Method & Provider Status
            </h2>

            <div className="space-y-3">
              {paymentMethods.map((pm) => {
                const isSelected = selectedPaymentMethod === pm.id;
                return (
                  <label
                    key={pm.id}
                    onClick={() => setValue('payment_method', pm.id)}
                    className={`cursor-pointer p-4 rounded-2xl border-2 flex items-start justify-between gap-3 transition ${
                      isSelected
                        ? 'border-cravora-red bg-red-50/30'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        value={pm.id}
                        checked={isSelected}
                        onChange={() => setValue('payment_method', pm.id)}
                        className="mt-1 accent-cravora-red"
                      />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold text-stone-900">{pm.name}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                              pm.is_activated
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {pm.badge}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500 mt-1">{pm.description}</p>
                      </div>
                    </div>
                    {pm.id === 'cod' ? (
                      <Wallet className="w-5 h-5 text-cravora-red shrink-0" />
                    ) : (
                      <CreditCard className="w-5 h-5 text-stone-500 shrink-0" />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Complete Order Summary & Final Confirmation */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-stone-200 p-6 shadow-card space-y-5 sticky top-24">
          <h2 className="text-lg font-extrabold text-stone-900">
            Order Summary ({cartItems.reduce((a, b) => a + b.quantity, 0)} Items)
          </h2>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1 divide-y divide-stone-100">
            {(cartSummary?.items || []).map((item, idx) => (
              <div key={idx} className="pt-3 first:pt-0 flex items-start justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <img
                    src={item.product_image}
                    alt={item.product_name}
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                  />
                  <div>
                    <div className="font-extrabold text-stone-900">
                      {item.quantity}x {item.product_name}
                    </div>
                    {item.variant_name && (
                      <div className="text-[11px] font-bold text-stone-600">{item.variant_name}</div>
                    )}
                    {item.options && item.options.length > 0 && (
                      <div className="text-[10px] text-stone-500">
                        {item.options.map((o) => o.option_name).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
                <span className="font-extrabold text-stone-900 shrink-0">
                  {formatPKR(item.line_total)}
                </span>
              </div>
            ))}
          </div>

          {cartSummary && (
            <div className="p-4 rounded-2xl bg-cravora-cream border border-stone-200 space-y-2 text-xs">
              <div className="flex justify-between text-stone-600">
                <span>Subtotal</span>
                <span className="font-bold text-stone-900">{formatPKR(cartSummary.subtotal)}</span>
              </div>
              {cartSummary.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-700 font-bold">
                  <span>Promo / Loyalty Discount</span>
                  <span>-{formatPKR(cartSummary.discount_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-stone-600">
                <span>{fulfillmentType === 'delivery' ? 'Delivery Charge' : 'Store Pickup'}</span>
                <span className="font-bold text-stone-900">
                  {cartSummary.delivery_fee === 0 ? 'FREE' : formatPKR(cartSummary.delivery_fee)}
                </span>
              </div>
              <div className="text-[10px] text-stone-500">{cartSummary.delivery_fee_explanation}</div>
              <div className="flex justify-between text-stone-600">
                <span>GST ({cartSummary.tax_rate_percent}%)</span>
                <span className="font-bold text-stone-900">{formatPKR(cartSummary.tax_amount)}</span>
              </div>
              <div className="flex justify-between text-base font-black text-stone-900 pt-2 border-t border-stone-200">
                <span>Final Payable Total</span>
                <span className="text-cravora-red">{formatPKR(cartSummary.total_amount)}</span>
              </div>
              {user && cartSummary.estimated_loyalty_points_earned > 0 && (
                <div className="text-[11px] font-bold text-amber-800 pt-1">
                  ★ You will earn +{cartSummary.estimated_loyalty_points_earned} Cravora Loyalty Points from this order!
                </div>
              )}
            </div>
          )}

          {/* Terms & Cancellation Policy Consent */}
          <label className="flex items-start gap-2.5 text-xs text-stone-600 cursor-pointer">
            <input
              type="checkbox"
              {...register('accept_terms')}
              className="mt-0.5 accent-cravora-red rounded"
            />
            <span>
              I confirm my order details and agree to the{' '}
              <Link to="/support?policy=terms" className="text-cravora-red font-bold underline">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/support?policy=refunds" className="text-cravora-red font-bold underline">
                Cancellation Policy
              </Link>{' '}
              (Orders can be self-cancelled prior to kitchen oven preparation).
            </span>
          </label>
          {errors.accept_terms && (
            <p className="text-[11px] text-red-600">{errors.accept_terms.message}</p>
          )}

          {submitError && (
            <div className="p-3.5 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-900 font-bold">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={
              isSubmitting ||
              (fulfillmentType === 'delivery' && cov !== null && cov !== undefined && !cov.deliverable)
            }
            className="w-full py-4 px-6 rounded-2xl bg-cravora-red hover:bg-cravora-redDark disabled:bg-stone-300 text-white font-extrabold text-sm shadow-glow flex items-center justify-center gap-2 transition"
          >
            <Lock className="w-4 h-4" />
            <span>
              {isSubmitting
                ? 'Creating Verified Order...'
                : `Confirm & Place Order • ${formatPKR(cartSummary?.total_amount || 0)}`}
            </span>
          </button>
        </div>
      </form>
    </div>
  );
};
