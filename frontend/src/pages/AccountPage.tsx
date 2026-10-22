import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Award,
  Bell,
  Heart,
  KeyRound,
  LogOut,
  MapPin,
  Package,
  RotateCcw,
  Shield,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { apiFetch, formatPKR } from '../api/client';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import { Order, Product, SupportTicket } from '../types';

export const AccountPage: React.FC = () => {
  const {
    user,
    login,
    register,
    logout,
    refreshUser,
    addToCart,
    setIsCartOpen,
    setIsLocationModalOpen,
    addToast,
  } = useStore();

  const navigate = useNavigate();
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+92 333 ');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [devResetHint, setDevResetHint] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Authenticated dashboard tabs
  const [activeSection, setActiveSection] = useState<
    'orders' | 'loyalty' | 'addresses' | 'favorites' | 'notifications'
  >('orders');
  const [orders, setOrders] = useState<Order[]>([]);
  const [favorites, setFavorites] = useState<Product[]>([]);
  const [loyaltyData, setLoyaltyData] = useState<any>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      apiFetch<Order[]>('/api/orders/my'),
      apiFetch<Product[]>('/api/auth/favorites'),
      apiFetch<any>('/api/auth/loyalty'),
      apiFetch<any[]>('/api/auth/notifications'),
      apiFetch<SupportTicket[]>('/api/support/tickets/my'),
    ])
      .then(([ordRes, favRes, loyRes, notifRes, tktRes]) => {
        setOrders(ordRes);
        setFavorites(favRes);
        setLoyaltyData(loyRes);
        setNotifications(notifRes);
        setTickets(tktRes);
      })
      .catch(() => {});
  }, [user]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAuth(true);
    try {
      await login(email, password);
    } catch (err: any) {
      addToast('Sign In Failed', err.message, 'error');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingAuth(true);
    try {
      await register({ email, phone, full_name: fullName, password });
    } catch (err: any) {
      addToast('Registration Failed', err.message, 'error');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handlePasswordResetRequest = async () => {
    if (!email.trim()) {
      addToast('Enter Email', 'Please enter your account email address first.', 'error');
      return;
    }
    try {
      const res = await apiFetch<{ message: string; dev_reset_token?: string }>(
        '/api/auth/password-reset/request',
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        }
      );
      if (res.dev_reset_token) {
        setResetToken(res.dev_reset_token);
        setDevResetHint(`Development Reset Token Generated: ${res.dev_reset_token}`);
      }
      addToast('Reset Token Generated', res.message, 'info');
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    }
  };

  const handlePasswordResetConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/password-reset/confirm', {
        method: 'POST',
        body: JSON.stringify({
          email,
          reset_token: resetToken,
          new_password: newPassword,
        }),
      });
      addToast('Password Updated', res.message, 'success');
      setAuthTab('login');
    } catch (err: any) {
      addToast('Reset Failed', err.message, 'error');
    }
  };

  const handleReorder = (ord: Order) => {
    ord.items.forEach((item) => {
      addToCart({
        product_id: item.product_id,
        product_name: item.product_name,
        product_image:
          item.product_image ||
          'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80',
        variant_id: null,
        variant_name: item.variant_name || null,
        selected_option_ids: [],
        selected_option_labels: (item.customizations || []).map((c) => c.option_name),
        quantity: item.quantity,
        unit_price_preview: item.unit_price,
      });
    });
    setIsCartOpen(true);
  };

  const handleDeleteAddress = async (addrId: number) => {
    try {
      await apiFetch(`/api/auth/addresses/${addrId}`, { method: 'DELETE' });
      await refreshUser();
      addToast('Address Removed', 'Removed from your saved addresses.', 'info');
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    }
  };

  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <div className="bg-white rounded-3xl border border-stone-200 shadow-card p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-2xl bg-cravora-red text-white font-display font-black text-2xl flex items-center justify-center mx-auto shadow-glow">
              C
            </div>
            <h1 className="font-display text-2xl font-black text-stone-900 pt-2">
              Cravora Account & Rewards
            </h1>
            <p className="text-xs text-stone-500">
              Earn 5 Loyalty Points per Rs. 100 spent, save addresses, and reorder in 1 click.
            </p>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-3 rounded-2xl bg-stone-100 p-1 text-xs font-extrabold">
            <button
              type="button"
              onClick={() => setAuthTab('login')}
              className={`py-2 rounded-xl transition ${
                authTab === 'login' ? 'bg-white text-cravora-red shadow-sm' : 'text-stone-600'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setAuthTab('register')}
              className={`py-2 rounded-xl transition ${
                authTab === 'register' ? 'bg-white text-cravora-red shadow-sm' : 'text-stone-600'
              }`}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => setAuthTab('reset')}
              className={`py-2 rounded-xl transition ${
                authTab === 'reset' ? 'bg-white text-cravora-red shadow-sm' : 'text-stone-600'
              }`}
            >
              Reset Pass
            </button>
          </div>

          {authTab === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hamza@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full py-3 rounded-2xl bg-cravora-red hover:bg-cravora-redDark text-white text-xs font-extrabold shadow-glow transition"
              >
                {isSubmittingAuth ? 'Signing In...' : 'Sign In to Cravora'}
              </button>
            </form>
          )}

          {authTab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Sara Raza"
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Email Address *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="sara@example.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Mobile Phone *</label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+92 333 1234567"
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Password (Min 6 chars) *
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
                />
              </div>
              <button
                type="submit"
                disabled={isSubmittingAuth}
                className="w-full py-3 rounded-2xl bg-cravora-red hover:bg-cravora-redDark text-white text-xs font-extrabold shadow-glow transition"
              >
                Create Account & Claim 100 Bonus Points
              </button>
            </form>
          )}

          {authTab === 'reset' && (
            <form onSubmit={handlePasswordResetConfirm} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Account Email</label>
                <div className="flex gap-2">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="hamza@example.com"
                    className="flex-1 px-3.5 py-2 rounded-xl border border-stone-300 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handlePasswordResetRequest}
                    className="px-3 py-2 rounded-xl bg-stone-900 text-white text-xs font-bold"
                  >
                    Get Token
                  </button>
                </div>
              </div>
              {devResetHint && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-mono text-amber-900">
                  {devResetHint}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">Reset Token</label>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="rst_..."
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">New Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-xs"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-cravora-red text-white text-xs font-extrabold"
              >
                Confirm New Password
              </button>
            </form>
          )}

          {/* Quick 1-Click Demo Credentials Box */}
          <div className="pt-4 border-t border-stone-200 space-y-2">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400 text-center">
              1-Click Demo Sign-In (Development Seed Accounts)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => login('hamza@example.com', 'Customer!2026')}
                className="p-2.5 rounded-xl border border-stone-200 hover:border-cravora-red bg-stone-50 text-left transition"
              >
                <div className="text-xs font-extrabold text-stone-900">Hamza (Customer)</div>
                <div className="text-[10px] text-stone-500">450 Points • Past Orders</div>
              </button>
              <button
                type="button"
                onClick={async () => {
                  await login('admin@cravora.pk', 'CravoraAdmin!2026');
                  navigate('/admin');
                }}
                className="p-2.5 rounded-xl border border-stone-200 hover:border-cravora-red bg-stone-50 text-left transition"
              >
                <div className="text-xs font-extrabold text-cravora-red">Zainab (Admin)</div>
                <div className="text-[10px] text-stone-500">Full Dashboard Access</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Top User Banner */}
      <div className="bg-cravora-charcoal text-white rounded-3xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-cravora-red flex items-center justify-center font-display text-2xl font-black text-white">
            {user.full_name.charAt(0)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl sm:text-3xl font-black">{user.full_name}</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-cravora-orange text-[10px] font-extrabold uppercase">
                {user.role}
              </span>
            </div>
            <p className="text-xs text-stone-300 mt-0.5">
              {user.email} • {user.phone}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-5 py-3 rounded-2xl bg-white/10 border border-white/15 flex items-center gap-3">
            <Award className="w-6 h-6 text-amber-400" />
            <div>
              <div className="text-[10px] uppercase tracking-wider text-stone-300 font-bold">
                Cravora Rewards Balance
              </div>
              <div className="text-lg font-black text-white">
                {user.loyalty_points} Points ({formatPKR(user.loyalty_points)} Value)
              </div>
            </div>
          </div>

          {user.role === 'admin' && (
            <Link
              to="/admin"
              className="px-4 py-3 rounded-2xl bg-cravora-orange text-stone-950 text-xs font-extrabold flex items-center gap-1.5"
            >
              <Shield className="w-4 h-4" /> Admin Portal
            </Link>
          )}

          <button
            type="button"
            onClick={logout}
            className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-red-600 text-white text-xs font-extrabold flex items-center gap-1.5 transition"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'orders', label: `Order History (${orders.length})`, icon: Package },
          { id: 'loyalty', label: 'Loyalty & Rewards Ledger', icon: Award },
          { id: 'addresses', label: `Saved Addresses (${user.addresses.length})`, icon: MapPin },
          { id: 'favorites', label: `Saved Favorites (${favorites.length})`, icon: Heart },
          { id: 'notifications', label: `Notifications & Support (${tickets.length})`, icon: Bell },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id as any)}
              className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition ${
                activeSection === tab.id
                  ? 'bg-cravora-red text-white shadow-glow'
                  : 'bg-white border border-stone-200 text-stone-700 hover:border-cravora-red'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Section Content */}
      {activeSection === 'orders' && (
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-white rounded-3xl border border-stone-200 p-8 text-center">
              <p className="text-sm font-bold text-stone-700">No orders placed yet.</p>
              <Link
                to="/menu"
                className="mt-3 inline-block px-5 py-2.5 rounded-xl bg-cravora-red text-white text-xs font-extrabold"
              >
                Explore Menu
              </Link>
            </div>
          ) : (
            orders.map((ord) => (
              <div
                key={ord.id}
                className="bg-white rounded-3xl border border-stone-200 p-6 shadow-card flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-base font-black text-cravora-red">
                      {ord.order_reference}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-800 text-[11px] font-extrabold uppercase">
                      {ord.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs text-stone-400">
                      {new Date(ord.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-stone-700">
                    {ord.items.map((i) => `${i.quantity}x ${i.product_name}`).join(' • ')}
                  </div>
                  <div className="text-xs text-stone-500">
                    Branch: {ord.branch_name} • Total:{' '}
                    <strong className="text-stone-900">{formatPKR(ord.total_amount)}</strong>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleReorder(ord)}
                    className="px-4 py-2.5 rounded-xl border border-stone-300 hover:border-cravora-red text-xs font-extrabold text-stone-800 flex items-center gap-1.5 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-cravora-red" />
                    <span>Reorder Items</span>
                  </button>
                  <Link
                    to={`/track-order?ref=${ord.order_reference}`}
                    className="px-4 py-2.5 rounded-xl bg-cravora-red hover:bg-cravora-redDark text-white text-xs font-extrabold transition"
                  >
                    Live Timeline →
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeSection === 'loyalty' && loyaltyData && (
        <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-card space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-stone-200">
            <div>
              <h2 className="text-xl font-black text-stone-900">Cravora Loyalty Ledger</h2>
              <p className="text-xs text-stone-500">
                {loyaltyData.earning_rule} • {loyaltyData.redemption_rule}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-black text-cravora-red">
                {loyaltyData.loyalty_points} pts
              </div>
              <div className="text-xs font-bold text-stone-500">
                Redeemable for {formatPKR(loyaltyData.pkr_value)}
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {(loyaltyData.transactions || []).map((tx: any) => (
              <div
                key={tx.id}
                className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 flex items-center justify-between text-xs"
              >
                <div>
                  <div className="font-extrabold text-stone-900">{tx.description}</div>
                  <div className="text-[11px] text-stone-400">
                    {tx.created_at ? new Date(tx.created_at).toLocaleString() : ''}
                  </div>
                </div>
                <span
                  className={`font-black text-sm ${
                    tx.points_delta >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {tx.points_delta >= 0 ? `+${tx.points_delta}` : tx.points_delta} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'addresses' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-stone-900">Saved Delivery Addresses</h2>
            <button
              type="button"
              onClick={() => setIsLocationModalOpen(true)}
              className="px-4 py-2 rounded-xl bg-cravora-red text-white text-xs font-extrabold"
            >
              + Add New Pin & Address
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {user.addresses.map((addr) => (
              <div
                key={addr.id}
                className="p-5 rounded-3xl bg-white border border-stone-200 shadow-sm flex items-start justify-between gap-3"
              >
                <div className="space-y-1 text-xs">
                  <span className="px-2.5 py-0.5 rounded bg-red-50 text-cravora-red font-extrabold">
                    {addr.label}
                  </span>
                  <div className="font-extrabold text-stone-900 text-sm pt-1">
                    {addr.formatted_address}
                  </div>
                  <div className="text-stone-500">
                    Coords: {addr.latitude.toFixed(4)}, {addr.longitude.toFixed(4)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteAddress(addr.id)}
                  className="text-stone-400 hover:text-red-600 p-1"
                  aria-label="Delete address"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSection === 'favorites' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {favorites.length === 0 ? (
            <div className="col-span-full bg-white rounded-3xl border border-stone-200 p-8 text-center text-xs text-stone-500">
              You haven't saved any favorite menu items yet.
            </div>
          ) : (
            favorites.map((p) => <ProductCard key={p.id} product={p} />)
          )}
        </div>
      )}

      {activeSection === 'notifications' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-3">
            <h3 className="text-base font-extrabold text-stone-900">Support Tickets</h3>
            {tickets.map((t) => (
              <div key={t.id} className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs space-y-1">
                <div className="flex justify-between font-extrabold">
                  <span className="text-cravora-red">{t.ticket_reference}</span>
                  <span className="uppercase text-stone-600">{t.status}</span>
                </div>
                <div className="font-bold text-stone-900">{t.subject}</div>
                <Link to="/support" className="text-cravora-red font-bold hover:underline block pt-1">
                  Open Conversation →
                </Link>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-3xl border border-stone-200 p-6 space-y-3">
            <h3 className="text-base font-extrabold text-stone-900">
              Recorded Notification Logs
            </h3>
            {notifications.map((n) => (
              <div key={n.id} className="p-3.5 rounded-2xl bg-stone-50 border border-stone-200 text-xs space-y-1">
                <div className="flex justify-between font-bold">
                  <span>{n.subject}</span>
                  <span className="px-2 py-0.5 rounded bg-stone-200 text-[10px]">
                    {n.provider_status}
                  </span>
                </div>
                <p className="text-stone-600">{n.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
