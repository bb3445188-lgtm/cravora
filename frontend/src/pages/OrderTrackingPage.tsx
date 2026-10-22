import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Headphones,
  MapPin,
  Package,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  Store,
  Truck,
  XCircle,
} from 'lucide-react';
import { apiFetch, formatPKR } from '../api/client';
import { InteractiveMap } from '../components/InteractiveMap';
import { useStore } from '../context/StoreContext';
import { Order } from '../types';

const DELIVERY_STAGES = [
  { key: 'order_placed', label: 'Order Placed', desc: 'Received by Cravora checkout engine' },
  { key: 'order_confirmed', label: 'Order Confirmed', desc: 'Verified by branch operations desk' },
  { key: 'preparing', label: 'Preparing', desc: 'Hand-stretching & stone-baking at 450°C' },
  { key: 'out_for_delivery', label: 'Out for Delivery', desc: 'Dispatched with Cravora rider' },
  { key: 'delivered', label: 'Delivered', desc: 'Enjoy your hot Cravora feast!' },
];

const PICKUP_STAGES = [
  { key: 'order_placed', label: 'Order Placed', desc: 'Received by Cravora checkout engine' },
  { key: 'order_confirmed', label: 'Order Confirmed', desc: 'Verified by branch counter' },
  { key: 'preparing', label: 'Preparing', desc: 'Stone-baking fresh in oven' },
  { key: 'ready_for_pickup', label: 'Ready for Pickup', desc: 'Hot & packed at express counter' },
  { key: 'collected', label: 'Collected', desc: 'Picked up by customer' },
];

export const OrderTrackingPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user, branches, openAIWithPrompt, addToast } = useStore();

  const initialRef =
    searchParams.get('ref') ||
    localStorage.getItem('cravora_last_order_ref') ||
    'CRV-20261020-1001';
  const initialToken =
    searchParams.get('token') ||
    localStorage.getItem(`cravora_order_token_${initialRef}`) ||
    '';
  const initialPhone =
    localStorage.getItem('cravora_last_order_phone') ||
    user?.phone ||
    '+92 333 5129081';

  const [orderRefInput, setOrderRefInput] = useState(initialRef);
  const [phoneInput, setPhoneInput] = useState(initialPhone);
  const [order, setOrder] = useState<Order | null>(null);
  const [myOrders, setMyOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchOrder = useCallback(
    async (refToFetch: string, phoneToUse: string, tokenToUse?: string) => {
      if (!refToFetch.trim()) return;
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const cleanRef = refToFetch.trim().toUpperCase();
        const storedTok =
          tokenToUse || localStorage.getItem(`cravora_order_token_${cleanRef}`) || '';
        const params = new URLSearchParams();
        if (phoneToUse.trim()) params.set('phone', phoneToUse.trim());
        if (storedTok) params.set('token', storedTok);

        const data = await apiFetch<Order>(
          `/api/orders/${encodeURIComponent(cleanRef)}?${params.toString()}`
        );
        setOrder(data);
      } catch (err: any) {
        setErrorMsg(err.message || 'Could not verify or retrieve order.');
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (initialRef) {
      fetchOrder(initialRef, initialPhone, initialToken);
    }
  }, [initialRef, initialPhone, initialToken, fetchOrder]);

  useEffect(() => {
    if (user) {
      apiFetch<Order[]>('/api/orders/my')
        .then((list) => setMyOrders(list))
        .catch(() => {});
    }
  }, [user]);

  // Poll every 10 seconds for live status updates
  useEffect(() => {
    if (!order) return;
    const interval = setInterval(() => {
      fetchOrder(order.order_reference, phoneInput);
    }, 10000);
    return () => clearInterval(interval);
  }, [order?.order_reference, phoneInput, fetchOrder]);

  const handleCancelOrder = async () => {
    if (!order) return;
    try {
      const storedTok =
        localStorage.getItem(`cravora_order_token_${order.order_reference}`) || '';
      const params = new URLSearchParams({
        reason: 'Customer requested cancellation from tracking page',
        phone: phoneInput,
        token: storedTok,
      });
      const updated = await apiFetch<Order>(
        `/api/orders/${order.order_reference}/cancel?${params.toString()}`,
        { method: 'POST' }
      );
      setOrder(updated);
      addToast('Order Cancelled', `Order ${order.order_reference} has been cancelled.`, 'info');
    } catch (err: any) {
      addToast('Cannot Cancel Order', err.message, 'error');
    }
  };

  const stages =
    order?.fulfillment_type === 'pickup' ? PICKUP_STAGES : DELIVERY_STAGES;
  const currentStageIdx = order
    ? stages.findIndex((s) => s.key === order.status)
    : -1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Top Lookup Banner */}
      <div className="bg-cravora-charcoal text-white rounded-3xl p-6 sm:p-8 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-orange">
              Verified Real-Time Order Tracker
            </span>
            <h1 className="font-display text-3xl sm:text-4xl font-black mt-1">
              Track Your Cravora Order
            </h1>
            <p className="text-xs sm:text-sm text-stone-300 mt-1">
              Protected by customer ownership & phone verification so only you can view your order details.
            </p>
          </div>

          {user && myOrders.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {myOrders.slice(0, 3).map((mo) => (
                <button
                  key={mo.id}
                  type="button"
                  onClick={() => {
                    setOrderRefInput(mo.order_reference);
                    setPhoneInput(mo.customer_phone);
                    fetchOrder(mo.order_reference, mo.customer_phone);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-extrabold text-white transition"
                >
                  {mo.order_reference} ({mo.status.replace(/_/g, ' ')})
                </button>
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            fetchOrder(orderRefInput, phoneInput);
          }}
          className="grid grid-cols-1 sm:grid-cols-12 gap-3 bg-white/10 p-3 rounded-2xl border border-white/15"
        >
          <div className="sm:col-span-5">
            <label className="block text-[10px] font-bold uppercase text-stone-300 mb-1">
              Order Reference Number *
            </label>
            <input
              type="text"
              value={orderRefInput}
              onChange={(e) => setOrderRefInput(e.target.value.toUpperCase())}
              placeholder="e.g. CRV-20261020-1001"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white text-stone-900 text-xs font-extrabold uppercase"
            />
          </div>
          <div className="sm:col-span-5">
            <label className="block text-[10px] font-bold uppercase text-stone-300 mb-1">
              Registered Customer Phone (Verification) *
            </label>
            <input
              type="text"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="+92 333 5129081"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white text-stone-900 text-xs font-semibold"
            />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 rounded-xl bg-cravora-red hover:bg-cravora-redDark text-white font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-glow transition"
            >
              <Search className="w-4 h-4" />
              <span>{isLoading ? 'Checking...' : 'Track'}</span>
            </button>
          </div>
        </form>
      </div>

      {errorMsg && (
        <div className="p-6 rounded-3xl bg-red-50 border border-red-200 text-red-950 flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold">Order Verification Notice</h3>
            <p className="text-xs leading-relaxed">{errorMsg}</p>
            <p className="text-[11px] text-red-700 pt-1">
              Sample Order for Demo: Reference <strong>CRV-20261020-1001</strong> with Phone{' '}
              <strong>+92 333 5129081</strong>
            </p>
          </div>
        </div>
      )}

      {order && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left 7 Cols: Live Timeline, Map & Status History */}
          <div className="lg:col-span-7 space-y-6">
            {/* Timeline Card */}
            <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-card space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-200">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg font-black text-cravora-red">
                      {order.order_reference}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-700 text-[11px] font-extrabold uppercase">
                      {order.fulfillment_type}
                    </span>
                  </div>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Placed on {new Date(order.created_at).toLocaleString()} • Branch: {order.branch_name}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => fetchOrder(order.order_reference, phoneInput)}
                  className="px-3.5 py-2 rounded-xl border border-stone-200 hover:bg-stone-50 text-xs font-bold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-cravora-red" /> Refresh Live Status
                </button>
              </div>

              {order.status === 'cancelled' ? (
                <div className="p-5 rounded-2xl bg-red-50 border border-red-200 flex items-center gap-3 text-red-900">
                  <XCircle className="w-7 h-7 text-red-600 shrink-0" />
                  <div>
                    <div className="text-base font-extrabold">This Order Was Cancelled</div>
                    <div className="text-xs mt-0.5">
                      Reason: {order.cancellation_reason || 'Cancelled by request'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                  {stages.map((st, idx) => {
                    const isCompleted = idx <= currentStageIdx;
                    const isCurrent = idx === currentStageIdx;
                    return (
                      <div
                        key={st.key}
                        className={`p-3.5 rounded-2xl border-2 transition ${
                          isCurrent
                            ? 'border-cravora-red bg-red-50/50 shadow-sm'
                            : isCompleted
                            ? 'border-emerald-500/50 bg-emerald-50/30'
                            : 'border-stone-200 bg-stone-50 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-extrabold uppercase text-stone-400">
                            Step {idx + 1}
                          </span>
                          {isCompleted && (
                            <CheckCircle2
                              className={`w-4 h-4 ${
                                isCurrent ? 'text-cravora-red' : 'text-emerald-600'
                              }`}
                            />
                          )}
                        </div>
                        <div className="text-xs font-extrabold text-stone-900">{st.label}</div>
                        <div className="text-[10px] text-stone-500 mt-0.5 leading-snug">
                          {st.desc}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Rider Info & Honest GPS Tracking Disclosure */}
              {order.assigned_rider_name && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <Truck className="w-5 h-5 text-emerald-700" />
                    <div>
                      <div className="font-extrabold text-emerald-950">
                        Assigned Dispatch Rider: {order.assigned_rider_name}
                      </div>
                      <div className="text-emerald-800">
                        Contact: {order.assigned_rider_phone || 'Via Branch Hotline'}
                      </div>
                    </div>
                  </div>
                  {order.latest_rider_location ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold">
                      Verified Rider GPS Active
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-white border border-emerald-200 text-emerald-900 text-[10px] font-bold">
                      Status Timeline Active (Live Rider GPS shown when rider app broadcasts)
                    </span>
                  )}
                </div>
              )}

              {/* Map View */}
              <InteractiveMap
                centerLat={order.delivery_lat || 33.7215}
                centerLng={order.delivery_lng || 73.0571}
                zoom={13}
                branches={branches.filter((b) => b.id === order.branch_id)}
                showDeliveryZones={true}
                interactivePin={false}
                riderLocation={order.latest_rider_location || null}
                heightClass="h-64"
              />

              {/* Audit Status History Log */}
              <div className="space-y-2.5 pt-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
                  Verified Kitchen & Dispatch Timestamps
                </h3>
                <div className="space-y-2">
                  {order.status_history.map((h) => (
                    <div
                      key={h.id}
                      className="p-3 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-cravora-red shrink-0" />
                        <span className="font-extrabold capitalize text-stone-900">
                          {h.status.replace(/_/g, ' ')}:
                        </span>
                        <span className="text-stone-600">{h.note}</span>
                      </div>
                      <span className="text-[10px] text-stone-400 shrink-0">
                        {new Date(h.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right 5 Cols: Order Details, Payment Status & Support Options */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-card space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-stone-900">Order Details & Receipt</h2>
                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 text-[11px] font-extrabold uppercase">
                  Payment: {order.payment_status} ({order.payment_method.toUpperCase()})
                </span>
              </div>

              <div className="divide-y divide-stone-100 space-y-3">
                {order.items.map((item) => (
                  <div key={item.id} className="pt-3 first:pt-0 flex justify-between gap-3 text-xs">
                    <div>
                      <div className="font-extrabold text-stone-900">
                        {item.quantity}x {item.product_name}
                      </div>
                      {item.variant_name && (
                        <div className="text-[11px] text-stone-500">{item.variant_name}</div>
                      )}
                      {item.customizations && item.customizations.length > 0 && (
                        <div className="text-[10px] text-stone-500">
                          {item.customizations.map((c) => c.option_name).join(', ')}
                        </div>
                      )}
                    </div>
                    <span className="font-extrabold text-stone-900">
                      {formatPKR(item.total_price)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-2xl bg-cravora-cream border border-stone-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-stone-600">
                  <span>Subtotal</span>
                  <span className="font-bold">{formatPKR(order.subtotal)}</span>
                </div>
                {order.discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Discount ({order.coupon_code || 'Loyalty'})</span>
                    <span>-{formatPKR(order.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-stone-600">
                  <span>Delivery Fee</span>
                  <span className="font-bold">{formatPKR(order.delivery_fee)}</span>
                </div>
                <div className="flex justify-between text-stone-600">
                  <span>GST (16%)</span>
                  <span className="font-bold">{formatPKR(order.tax_amount)}</span>
                </div>
                <div className="flex justify-between text-sm font-black text-stone-900 pt-2 border-t border-stone-200">
                  <span>Total Amount</span>
                  <span className="text-cravora-red">{formatPKR(order.total_amount)}</span>
                </div>
              </div>

              {/* Support & Self-Cancellation Actions */}
              <div className="space-y-2.5 pt-2">
                {['order_placed', 'order_confirmed'].includes(order.status) && (
                  <button
                    type="button"
                    onClick={handleCancelOrder}
                    className="w-full py-2.5 px-4 rounded-xl border border-red-300 text-red-700 hover:bg-red-50 text-xs font-extrabold transition"
                  >
                    Request Order Cancellation (Before Kitchen Prep)
                  </button>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      openAIWithPrompt(
                        `I want to report a problem with my order ${order.order_reference}`
                      )
                    }
                    className="py-2.5 px-3 rounded-xl bg-stone-900 hover:bg-cravora-red text-white text-xs font-extrabold flex items-center justify-center gap-1.5 transition"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    <span>Escalate via AI</span>
                  </button>
                  <Link
                    to={`/support?order=${order.order_reference}`}
                    className="py-2.5 px-3 rounded-xl border border-stone-300 hover:border-cravora-red text-stone-800 text-xs font-extrabold flex items-center justify-center gap-1.5 transition"
                  >
                    <span>Open Support Ticket</span>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
