import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  Edit3,
  Headphones,
  Lock,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Tag,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import { apiFetch, formatPKR } from '../api/client';
import { useStore } from '../context/StoreContext';
import { Branch, Category, Coupon, Order, Product, SupportTicket } from '../types';

export const AdminDashboardPage: React.FC = () => {
  const { user, login, addToast } = useStore();
  const [activeTab, setActiveTab] = useState<
    'overview' | 'orders' | 'products' | 'promotions' | 'branches' | 'support_ai'
  >('overview');

  const [overview, setOverview] = useState<any>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [aiSettings, setAiSettings] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Create Product Form State
  const [prodName, setProdName] = useState('');
  const [prodCatId, setProdCatId] = useState<number>(1);
  const [prodPrice, setProdPrice] = useState<number>(1590);
  const [prodDesc, setProdDesc] = useState('');
  const [prodImg, setProdImg] = useState(
    'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80'
  );
  const [prodBestseller, setProdBestseller] = useState(true);
  const [prodSpicy, setProdSpicy] = useState(true);

  // Create Coupon Form State
  const [newCouponCode, setNewCouponCode] = useState('');
  const [newCouponTitle, setNewCouponTitle] = useState('');
  const [newCouponType, setNewCouponType] = useState<'percentage' | 'fixed'>('fixed');
  const [newCouponValue, setNewCouponValue] = useState<number>(350);
  const [newCouponMin, setNewCouponMin] = useState<number>(1500);

  // Create Branch Form State
  const [branchCode, setBranchCode] = useState('ISB-F10');
  const [branchName, setBranchName] = useState('Cravora F-10 Markaz Express');
  const [branchCity, setBranchCity] = useState('Islamabad');
  const [branchArea, setBranchArea] = useState('F-10 Markaz');
  const [branchAddress, setBranchAddress] = useState('Main Double Road, F-10 Markaz, Islamabad');
  const [branchPhone, setBranchPhone] = useState('+92 (51) 210-9900');
  const [branchLat, setBranchLat] = useState(33.6911);
  const [branchLng, setBranchLng] = useState(73.0119);
  const [branchFee, setBranchFee] = useState(140);

  // Admin Ticket Reply State
  const [replyByTicket, setReplyByTicket] = useState<Record<string, string>>({});

  const isAuthorized = user && (user.role === 'admin' || user.role === 'staff');

  const loadAdminData = useCallback(async () => {
    if (!isAuthorized) return;
    setIsLoading(true);
    try {
      const [ov, ords, prods, cats, promos, brs, tkts, aiCfg] = await Promise.all([
        apiFetch<any>('/api/admin/overview'),
        apiFetch<Order[]>('/api/admin/orders'),
        apiFetch<Product[]>('/api/menu/products'),
        apiFetch<Category[]>('/api/menu/categories'),
        apiFetch<{ coupons: Coupon[] }>('/api/promotions'),
        apiFetch<Branch[]>('/api/branches'),
        apiFetch<SupportTicket[]>('/api/admin/support/tickets'),
        user?.role === 'admin'
          ? apiFetch<any>('/api/admin/ai-settings')
          : Promise.resolve(null),
      ]);
      setOverview(ov);
      setOrders(ords);
      setProducts(prods);
      setCategories(cats);
      if (cats.length > 0) setProdCatId(cats[0].id);
      setCoupons(promos.coupons);
      setBranches(brs);
      setTickets(tkts);
      setAiSettings(aiCfg);
    } catch (err: any) {
      addToast('Admin Load Error', err.message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [isAuthorized, user?.role, addToast]);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  if (!isAuthorized) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <div className="bg-white rounded-3xl border border-stone-200 shadow-card p-8 text-center space-y-5">
          <div className="w-14 h-14 rounded-2xl bg-red-50 text-cravora-red flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-700 text-[11px] font-extrabold uppercase">
              Backend RBAC Enforced
            </span>
            <h1 className="font-display text-2xl font-black text-stone-900 pt-1">
              Administrator Access Required
            </h1>
            <p className="text-xs text-stone-500 leading-relaxed">
              The Cravora Operations Dashboard is protected by server-side JWT Role-Based Access Control (`require_admin` / `require_staff_or_admin`).
            </p>
          </div>

          <button
            type="button"
            onClick={() => login('admin@cravora.pk', 'CravoraAdmin!2026')}
            className="w-full py-3.5 px-6 rounded-2xl bg-cravora-red hover:bg-cravora-redDark text-white font-extrabold text-xs shadow-glow transition"
          >
            Sign In as Demo Administrator (admin@cravora.pk)
          </button>
        </div>
      </div>
    );
  }

  const handleUpdateOrderStatus = async (orderRef: string, newStatus: string) => {
    try {
      await apiFetch(`/api/admin/orders/${orderRef}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: newStatus,
          assigned_rider_name: newStatus === 'out_for_delivery' ? 'Kamran Ali (Rider #14)' : undefined,
          assigned_rider_phone: newStatus === 'out_for_delivery' ? '+92 312 9001122' : undefined,
        }),
      });
      addToast('Order Status Updated', `${orderRef} is now ${newStatus.replace(/_/g, ' ')}.`, 'success');
      await loadAdminData();
    } catch (err: any) {
      addToast('Update Failed', err.message, 'error');
    }
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/products', {
        method: 'POST',
        body: JSON.stringify({
          category_id: Number(prodCatId),
          name: prodName,
          short_description: prodDesc,
          image_url: prodImg,
          base_price: Number(prodPrice),
          is_available: true,
          is_bestseller: prodBestseller,
          is_spicy: prodSpicy,
          dietary_tags: ['Halal Certified'],
          allergens: ['Gluten', 'Dairy'],
        }),
      });
      setProdName('');
      setProdDesc('');
      addToast('Product Created!', 'New item is now live on the customer menu.', 'success');
      await loadAdminData();
    } catch (err: any) {
      addToast('Failed to Create Product', err.message, 'error');
    }
  };

  const handleQuickPriceOrStockToggle = async (prod: Product, toggleAvailability: boolean) => {
    try {
      await apiFetch(`/api/admin/products/${prod.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          category_id: prod.category_id,
          name: prod.name,
          short_description: prod.short_description,
          full_description: prod.full_description,
          image_url: prod.image_url,
          base_price: toggleAvailability ? prod.base_price : prod.base_price + 50,
          compare_at_price: prod.compare_at_price,
          is_available: toggleAvailability ? !prod.is_available : prod.is_available,
          is_bestseller: prod.is_bestseller,
          is_featured: prod.is_featured,
          is_new: prod.is_new,
          is_vegetarian: prod.is_vegetarian,
          is_spicy: prod.is_spicy,
          calories: prod.calories,
          prep_time_mins: prod.prep_time_mins,
          stock_qty: prod.stock_qty,
          dietary_tags: prod.dietary_tags,
          allergens: prod.allergens,
        }),
      });
      addToast('Product Updated', `Updated ${prod.name} in database.`, 'success');
      await loadAdminData();
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    }
  };

  const handleDeleteProduct = async (prodId: number) => {
    try {
      await apiFetch(`/api/admin/products/${prodId}`, { method: 'DELETE' });
      addToast('Product Deleted', `Removed product #${prodId}`, 'info');
      await loadAdminData();
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    }
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code: newCouponCode.toUpperCase(),
          title: newCouponTitle,
          description: `${
            newCouponType === 'percentage' ? `${newCouponValue}% OFF` : `Flat Rs. ${newCouponValue} OFF`
          } on orders above Rs. ${newCouponMin}`,
          discount_type: newCouponType,
          discount_value: Number(newCouponValue),
          min_order_amount: Number(newCouponMin),
          is_active: true,
        }),
      });
      setNewCouponCode('');
      setNewCouponTitle('');
      addToast('Promotion Published!', 'Coupon is now live for customers.', 'success');
      await loadAdminData();
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    }
  };

  const handleCreateBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/branches', {
        method: 'POST',
        body: JSON.stringify({
          code: branchCode,
          name: branchName,
          city: branchCity,
          area: branchArea,
          address: branchAddress,
          phone: branchPhone,
          latitude: Number(branchLat),
          longitude: Number(branchLng),
          base_delivery_fee: Number(branchFee),
          per_km_fee: 20,
          min_order_amount: 600,
          radius_km: 7.0,
        }),
      });
      addToast('Branch & Zone Created!', `${branchName} is now active on the map.`, 'success');
      await loadAdminData();
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    }
  };

  const handleAdminReplyTicket = async (ticketRef: string) => {
    const msg = replyByTicket[ticketRef];
    if (!msg || !msg.trim()) return;
    try {
      await apiFetch(`/api/admin/support/tickets/${ticketRef}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: msg }),
      });
      setReplyByTicket((prev) => ({ ...prev, [ticketRef]: '' }));
      addToast('Reply Sent', `Responded to ticket ${ticketRef}`, 'success');
      await loadAdminData();
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Top Admin Header */}
      <div className="bg-cravora-charcoal text-white rounded-3xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cravora-red flex items-center justify-center">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-orange">
              RBAC Protected Operations Center
            </span>
            <h1 className="font-display text-2xl sm:text-3xl font-black">
              Cravora Admin & Kitchen Command
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={loadAdminData}
          className="px-4 py-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-xs font-extrabold flex items-center gap-2 transition"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Operations</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'overview', label: 'Analytics Overview', icon: BarChart3 },
          { id: 'orders', label: `Orders (${orders.length})`, icon: Package },
          { id: 'products', label: `Products (${products.length})`, icon: Edit3 },
          { id: 'promotions', label: `Promotions (${coupons.length})`, icon: Tag },
          { id: 'branches', label: `Branches & Zones (${branches.length})`, icon: MapPin },
          { id: 'support_ai', label: `Support & AI Health (${tickets.length})`, icon: Bot },
        ].map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as any)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition ${
                activeTab === t.id
                  ? 'bg-cravora-red text-white shadow-glow'
                  : 'bg-white border border-stone-200 text-stone-700 hover:border-cravora-red'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="p-5 rounded-3xl bg-white border border-stone-200 shadow-card">
              <div className="text-xs font-bold text-stone-500">Recorded Revenue</div>
              <div className="text-2xl font-black text-cravora-red mt-1">
                {formatPKR(overview.total_revenue_pkr)}
              </div>
            </div>
            <div className="p-5 rounded-3xl bg-white border border-stone-200 shadow-card">
              <div className="text-xs font-bold text-stone-500">Total Orders</div>
              <div className="text-2xl font-black text-stone-900 mt-1">{overview.total_orders}</div>
            </div>
            <div className="p-5 rounded-3xl bg-white border border-stone-200 shadow-card">
              <div className="text-xs font-bold text-stone-500">Average Order Value</div>
              <div className="text-2xl font-black text-stone-900 mt-1">
                {formatPKR(overview.average_order_value_pkr)}
              </div>
            </div>
            <div className="p-5 rounded-3xl bg-white border border-stone-200 shadow-card">
              <div className="text-xs font-bold text-stone-500">Active Menu Products</div>
              <div className="text-2xl font-black text-emerald-700 mt-1">
                {overview.active_products_count}
              </div>
            </div>
            <div className="p-5 rounded-3xl bg-white border border-stone-200 shadow-card">
              <div className="text-xs font-bold text-stone-500">Open Support Tickets</div>
              <div className="text-2xl font-black text-amber-600 mt-1">
                {overview.open_support_tickets}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-card space-y-4">
              <h3 className="text-base font-extrabold text-stone-900">
                Promotion Redemption Performance
              </h3>
              <div className="space-y-2.5">
                {(overview.promotion_performance || []).map((p: any) => (
                  <div
                    key={p.code}
                    className="p-3 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-black text-cravora-red">{p.code}</span>
                      <span className="text-stone-600 ml-2">{p.title}</span>
                    </div>
                    <span className="font-extrabold text-stone-900">
                      {p.used_count} Redemptions
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-card space-y-4">
              <h3 className="text-base font-extrabold text-stone-900">
                Recent Audit Log Events
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {(overview.recent_audit_events || []).map((ev: any) => (
                  <div
                    key={ev.id}
                    className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs"
                  >
                    <span>
                      <strong className="uppercase text-cravora-red">[{ev.actor_role}]</strong>{' '}
                      {ev.action} on {ev.entity_type} #{ev.entity_id}
                    </span>
                    <span className="text-[10px] text-stone-400">
                      {ev.created_at ? new Date(ev.created_at).toLocaleTimeString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ORDERS MANAGEMENT */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {orders.map((ord) => (
            <div
              key={ord.id}
              className="bg-white rounded-3xl border border-stone-200 p-6 shadow-card space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-100">
                <div>
                  <span className="font-mono text-base font-black text-cravora-red">
                    {ord.order_reference}
                  </span>
                  <span className="ml-2 text-xs font-extrabold text-stone-800">
                    {ord.customer_name} ({ord.customer_phone})
                  </span>
                  <div className="text-xs text-stone-500 mt-0.5">
                    {ord.fulfillment_type.toUpperCase()} • {ord.branch_name} • Total:{' '}
                    <strong>{formatPKR(ord.total_amount)}</strong> ({ord.payment_status})
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    'order_placed',
                    'order_confirmed',
                    'preparing',
                    'out_for_delivery',
                    'ready_for_pickup',
                    'delivered',
                    'cancelled',
                  ].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => handleUpdateOrderStatus(ord.order_reference, st)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-extrabold capitalize transition ${
                        ord.status === st
                          ? 'bg-cravora-red text-white shadow'
                          : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                      }`}
                    >
                      {st.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-xs text-stone-600">
                <strong>Items:</strong>{' '}
                {ord.items
                  .map(
                    (i) =>
                      `${i.quantity}x ${i.product_name}${
                        i.variant_name ? ` (${i.variant_name})` : ''
                      }`
                  )
                  .join(' • ')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 3: PRODUCT & MENU MANAGEMENT */}
      {activeTab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Create New Product Form */}
          <form
            onSubmit={handleCreateProduct}
            className="lg:col-span-4 bg-white rounded-3xl border border-stone-200 p-6 shadow-card space-y-3.5"
          >
            <h2 className="text-lg font-extrabold text-stone-900">Create New Menu Product</h2>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Category *</label>
              <select
                value={prodCatId}
                onChange={(e) => setProdCatId(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-xs font-semibold bg-white"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Product Name *</label>
              <input
                type="text"
                required
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="e.g. Karakoram Truffle Tikka Pizza"
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Base Price (PKR) *
              </label>
              <input
                type="number"
                required
                min={50}
                value={prodPrice}
                onChange={(e) => setProdPrice(Number(e.target.value))}
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Short Description *
              </label>
              <textarea
                required
                rows={2}
                value={prodDesc}
                onChange={(e) => setProdDesc(e.target.value)}
                placeholder="Appetizing description of ingredients..."
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Image URL *</label>
              <input
                type="url"
                required
                value={prodImg}
                onChange={(e) => setProdImg(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-xs"
              />
            </div>
            <div className="flex gap-4 text-xs font-bold">
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={prodBestseller}
                  onChange={(e) => setProdBestseller(e.target.checked)}
                />
                Bestseller
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={prodSpicy}
                  onChange={(e) => setProdSpicy(e.target.checked)}
                />
                Spicy
              </label>
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-cravora-red text-white text-xs font-extrabold shadow-glow"
            >
              + Publish Product to Menu
            </button>
          </form>

          {/* Existing Products List */}
          <div className="lg:col-span-8 space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {products.map((p) => (
              <div
                key={p.id}
                className="p-4 rounded-2xl bg-white border border-stone-200 flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={p.image_url}
                    alt={p.name}
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                  />
                  <div>
                    <div className="font-extrabold text-stone-900">{p.name}</div>
                    <div className="text-stone-500">
                      {p.category_name} • <strong>{formatPKR(p.base_price)}</strong> • Stock:{' '}
                      {p.stock_qty}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleQuickPriceOrStockToggle(p, false)}
                    className="px-2.5 py-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 font-bold"
                  >
                    +Rs. 50 Price
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickPriceOrStockToggle(p, true)}
                    className={`px-2.5 py-1.5 rounded-lg font-bold ${
                      p.is_available
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {p.is_available ? 'In Stock' : 'Out of Stock'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteProduct(p.id)}
                    className="p-1.5 text-stone-400 hover:text-red-600"
                    aria-label="Delete product"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: PROMOTIONS & COUPONS */}
      {activeTab === 'promotions' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={handleCreateCoupon}
            className="lg:col-span-5 bg-white rounded-3xl border border-stone-200 p-6 shadow-card space-y-3.5"
          >
            <h2 className="text-lg font-extrabold text-stone-900">Create New Promo Coupon</h2>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Coupon Code *</label>
              <input
                type="text"
                required
                value={newCouponCode}
                onChange={(e) => setNewCouponCode(e.target.value.toUpperCase())}
                placeholder="e.g. WEEKEND350"
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-xs font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Offer Title *</label>
              <input
                type="text"
                required
                value={newCouponTitle}
                onChange={(e) => setNewCouponTitle(e.target.value)}
                placeholder="Weekend Craving Saver"
                className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-xs font-semibold"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Type</label>
                <select
                  value={newCouponType}
                  onChange={(e) => setNewCouponType(e.target.value as any)}
                  className="w-full px-2.5 py-2 rounded-xl border border-stone-300 text-xs bg-white"
                >
                  <option value="fixed">Fixed PKR</option>
                  <option value="percentage">% Off</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Value</label>
                <input
                  type="number"
                  required
                  value={newCouponValue}
                  onChange={(e) => setNewCouponValue(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Min Order</label>
                <input
                  type="number"
                  required
                  value={newCouponMin}
                  onChange={(e) => setNewCouponMin(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-cravora-red text-white text-xs font-extrabold"
            >
              Publish Promotion
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {coupons.map((c) => (
              <div
                key={c.id}
                className="p-4 rounded-2xl bg-white border border-stone-200 flex items-center justify-between text-xs"
              >
                <div>
                  <span className="font-mono font-black text-cravora-red text-sm">{c.code}</span>
                  <div className="font-bold text-stone-900 mt-0.5">{c.title}</div>
                  <div className="text-stone-500">
                    Min Order: {formatPKR(c.min_order_amount)} • Used {c.used_count} times
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-extrabold">
                  Active
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: BRANCHES & DELIVERY ZONES */}
      {activeTab === 'branches' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <form
            onSubmit={handleCreateBranch}
            className="lg:col-span-5 bg-white rounded-3xl border border-stone-200 p-6 shadow-card space-y-3"
          >
            <h2 className="text-lg font-extrabold text-stone-900">
              Add New Branch & Delivery Zone
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Branch Code</label>
                <input
                  type="text"
                  required
                  value={branchCode}
                  onChange={(e) => setBranchCode(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">City</label>
                <input
                  type="text"
                  required
                  value={branchCity}
                  onChange={(e) => setBranchCity(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Branch Name</label>
              <input
                type="text"
                required
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Full Address</label>
              <input
                type="text"
                required
                value={branchAddress}
                onChange={(e) => setBranchAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-300 text-xs"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={branchLat}
                  onChange={(e) => setBranchLat(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={branchLng}
                  onChange={(e) => setBranchLng(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Base Fee</label>
                <input
                  type="number"
                  value={branchFee}
                  onChange={(e) => setBranchFee(Number(e.target.value))}
                  className="w-full px-2.5 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-cravora-red text-white text-xs font-extrabold"
            >
              Create Branch & Delivery Zone
            </button>
          </form>

          <div className="lg:col-span-7 space-y-3">
            {branches.map((b) => (
              <div
                key={b.id}
                className="p-4 rounded-2xl bg-white border border-stone-200 space-y-1.5 text-xs"
              >
                <div className="flex justify-between">
                  <span className="font-extrabold text-stone-900">{b.name}</span>
                  <span className="font-mono text-cravora-red font-bold">{b.code}</span>
                </div>
                <p className="text-stone-500">{b.address}</p>
                <div className="text-[11px] font-semibold text-stone-700">
                  Coords: ({b.latitude}, {b.longitude}) • Zones: {b.delivery_zones.length} active
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 6: CUSTOMER SUPPORT & AI SETTINGS */}
      {activeTab === 'support_ai' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Support Tickets Queue */}
          <div className="lg:col-span-7 space-y-4">
            <h2 className="text-lg font-extrabold text-stone-900">
              Customer Support Tickets ({tickets.length})
            </h2>
            {tickets.map((t) => (
              <div
                key={t.id}
                className="p-5 rounded-3xl bg-white border border-stone-200 shadow-card space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono font-black text-cravora-red">
                      {t.ticket_reference}
                    </span>
                    <span className="ml-2 font-bold text-stone-800">{t.customer_name}</span>
                    {t.escalated_from_ai && (
                      <span className="ml-2 px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-extrabold">
                        Escalated from Cravora AI
                      </span>
                    )}
                  </div>
                  <span className="uppercase font-extrabold text-stone-600">{t.status}</span>
                </div>
                <div className="font-bold text-stone-900">{t.subject}</div>
                <div className="space-y-1.5 bg-stone-50 p-3 rounded-xl">
                  {t.messages.map((m) => (
                    <div key={m.id}>
                      <strong>{m.sender_name}:</strong> {m.message}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={replyByTicket[t.ticket_reference] || ''}
                    onChange={(e) =>
                      setReplyByTicket((prev) => ({
                        ...prev,
                        [t.ticket_reference]: e.target.value,
                      }))
                    }
                    placeholder="Reply as Cravora Support..."
                    className="flex-1 px-3 py-2 rounded-xl border border-stone-300"
                  />
                  <button
                    type="button"
                    onClick={() => handleAdminReplyTicket(t.ticket_reference)}
                    className="px-4 py-2 rounded-xl bg-cravora-red text-white font-bold"
                  >
                    Reply
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* AI Settings & Operational Metrics */}
          <div className="lg:col-span-5 bg-cravora-charcoal text-white rounded-3xl p-6 space-y-4 text-xs">
            <div className="flex items-center gap-2.5">
              <Bot className="w-6 h-6 text-cravora-orange" />
              <h2 className="text-lg font-extrabold">Cravora AI Integration Health</h2>
            </div>

            {aiSettings && (
              <div className="space-y-3">
                <div className="p-3.5 rounded-2xl bg-white/10 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-stone-300">Configured Provider:</span>
                    <span className="font-extrabold uppercase">{aiSettings.provider}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-300">Model Target:</span>
                    <span className="font-mono">{aiSettings.model}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-300">Live External Key Set:</span>
                    <span className="font-bold text-cravora-orange">
                      {aiSettings.live_api_key_configured
                        ? 'Yes (Live External API)'
                        : 'No (Local Tool Concierge Active)'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-white/10 space-y-1.5">
                  <div className="font-extrabold text-cravora-orange uppercase">
                    Safe Operational Metrics
                  </div>
                  <div className="flex justify-between">
                    <span>Total AI Chat Sessions:</span>
                    <span className="font-bold">{aiSettings.metrics?.total_requests || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Verified Backend Tool Calls:</span>
                    <span className="font-bold">{aiSettings.metrics?.tool_calls_count || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Escalation Helpline:</span>
                    <span className="font-bold">{aiSettings.support_escalation_phone}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
