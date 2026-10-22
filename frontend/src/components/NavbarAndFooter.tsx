import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Award,
  CheckCircle2,
  ChevronDown,
  AlertCircle,
  Info,
  MapPin,
  Menu as MenuIcon,
  PhoneCall,
  Shield,
  ShoppingBag,
  Sparkles,
  Store,
  Truck,
  User as UserIcon,
  X,
} from 'lucide-react';
import { formatPKR } from '../api/client';
import { useStore } from '../context/StoreContext';

export const Navbar: React.FC = () => {
  const {
    fulfillmentType,
    setFulfillmentType,
    selectedBranch,
    deliveryLocation,
    setIsLocationModalOpen,
    cartItems,
    cartSummary,
    setIsCartOpen,
    setIsAIOpen,
    user,
    setCouponCode,
    addToast,
  } = useStore();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const displayTotal = cartSummary
    ? cartSummary.total_amount
    : cartItems.reduce((sum, i) => sum + i.unit_price_preview * i.quantity, 0);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-2 rounded-xl text-xs font-extrabold transition ${
      isActive
        ? 'bg-red-50 text-cravora-red'
        : 'text-stone-700 hover:text-cravora-red hover:bg-stone-100/70'
    }`;

  return (
    <>
      {/* 1. Slim Promotional Announcement Bar */}
      <div className="bg-cravora-charcoal text-white text-[11px] py-2 px-4 border-b border-stone-800">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-cravora-red text-white font-extrabold uppercase text-[10px]">
              Hot Promo
            </span>
            <span className="font-medium text-stone-200">
              Get <strong className="text-cravora-orange">20% OFF</strong> orders above Rs. 1,500 with code{' '}
              <button
                type="button"
                onClick={() => {
                  setCouponCode('CRAVORA20');
                  addToast('Coupon CRAVORA20 Applied!', '20% discount will be calculated in your cart.', 'success');
                }}
                className="underline font-extrabold text-white hover:text-cravora-orange"
              >
                CRAVORA20
              </button>{' '}
              • Free Delivery above Rs. 3,000!
            </span>
          </div>
          <div className="hidden md:flex items-center gap-4 text-stone-300">
            <span className="inline-flex items-center gap-1 text-[10px] bg-white/10 px-2.5 py-0.5 rounded-full">
              <Info className="w-3 h-3 text-cravora-orange" />
              Sample Menu & Development Data — Editable in Admin
            </span>
            <a href="tel:+9251111272867" className="inline-flex items-center gap-1 font-bold hover:text-white">
              <PhoneCall className="w-3 h-3 text-cravora-red" />
              UAN: 111-CRAVORA
            </a>
          </div>
        </div>
      </div>

      {/* 2. Sticky Main Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200/90 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between gap-3">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="w-11 h-11 rounded-2xl bg-cravora-red flex items-center justify-center shadow-glow group-hover:scale-105 transition">
                <svg className="w-7 h-7" viewBox="0 0 120 120" fill="none">
                  <path d="M60 18L96 88C83 96 71 99 60 99C49 99 37 96 24 88L60 18Z" fill="#FFFBF5" />
                  <path d="M60 30L87 82C77 88 68 90 60 90C52 90 43 88 33 82L60 30Z" fill="#F97316" />
                  <circle cx="60" cy="58" r="7" fill="#D92B2B" />
                  <circle cx="49" cy="73" r="6" fill="#D92B2B" />
                  <circle cx="71" cy="72" r="6" fill="#D92B2B" />
                </svg>
              </div>
              <div>
                <span className="font-display text-2xl font-black tracking-tight text-cravora-charcoal block leading-none">
                  CRAVORA
                </span>
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-cravora-red block mt-0.5">
                  Pizza & More
                </span>
              </div>
            </Link>

            {/* Fulfillment & Location Selector Pill */}
            <div className="hidden lg:flex items-center bg-cravora-cream border border-stone-200 rounded-2xl p-1 ml-2">
              <button
                type="button"
                onClick={() => setFulfillmentType('delivery')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 transition ${
                  fulfillmentType === 'delivery'
                    ? 'bg-cravora-red text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                Delivery
              </button>
              <button
                type="button"
                onClick={() => setFulfillmentType('pickup')}
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1 transition ${
                  fulfillmentType === 'pickup'
                    ? 'bg-cravora-red text-white shadow-sm'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                Pickup
              </button>
              <button
                type="button"
                onClick={() => setIsLocationModalOpen(true)}
                className="pl-3 pr-2.5 py-1 text-left flex items-center gap-1.5 max-w-[210px] hover:text-cravora-red transition"
              >
                <MapPin className="w-3.5 h-3.5 text-cravora-red shrink-0" />
                <div className="truncate">
                  <div className="text-[10px] font-bold text-stone-400 leading-none">
                    {fulfillmentType === 'delivery' ? 'Delivering To' : 'Pickup Branch'}
                  </div>
                  <div className="text-xs font-extrabold text-stone-800 truncate">
                    {fulfillmentType === 'delivery'
                      ? `${deliveryLocation.area}, ${deliveryLocation.city}`
                      : selectedBranch?.name || 'Select Branch'}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-stone-400 shrink-0" />
              </button>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden xl:flex items-center gap-1" aria-label="Main navigation">
            <NavLink to="/" end className={navLinkClass}>
              Home
            </NavLink>
            <NavLink to="/menu" className={navLinkClass}>
              Menu
            </NavLink>
            <NavLink to="/deals" className={navLinkClass}>
              Deals & Combos
            </NavLink>
            <NavLink to="/branches" className={navLinkClass}>
              Branches & Map
            </NavLink>
            <NavLink to="/track-order" className={navLinkClass}>
              Track Order
            </NavLink>
            <NavLink to="/support" className={navLinkClass}>
              Support
            </NavLink>
            <NavLink to="/admin" className={navLinkClass}>
              Admin
            </NavLink>
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center gap-2">
            {/* AI Assistant Quick Button */}
            <button
              type="button"
              onClick={() => setIsAIOpen(true)}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-stone-900 text-xs font-extrabold transition"
            >
              <Sparkles className="w-3.5 h-3.5 text-cravora-orange" />
              <span>AI Assistant</span>
            </button>

            {/* Account / Loyalty Link */}
            <Link
              to="/account"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl border border-stone-200 hover:border-cravora-red bg-white text-xs font-extrabold text-stone-800 transition"
            >
              <UserIcon className="w-4 h-4 text-cravora-red" />
              <span className="hidden md:inline">
                {user ? user.full_name.split(' ')[0] : 'Sign In'}
              </span>
              {user && user.loyalty_points > 0 && (
                <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px] font-extrabold">
                  <Award className="w-3 h-3 text-amber-600" />
                  {user.loyalty_points}
                </span>
              )}
            </Link>

            {/* Cart Drawer Trigger */}
            <button
              type="button"
              onClick={() => setIsCartOpen(true)}
              className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-cravora-red hover:bg-cravora-redDark text-white text-xs font-extrabold shadow-glow transition"
              aria-label="Open shopping cart"
            >
              <div className="relative">
                <ShoppingBag className="w-4 h-4" />
                {totalItems > 0 && (
                  <span className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-cravora-charcoal text-white text-[10px] font-extrabold flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </div>
              <span className="hidden sm:inline">
                {totalItems > 0 ? formatPKR(displayTotal) : 'Cart'}
              </span>
            </button>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="xl:hidden p-2.5 rounded-2xl border border-stone-200 text-stone-700 hover:bg-stone-100"
              aria-label="Toggle mobile navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Location Strip */}
        <div className="lg:hidden px-4 py-2 bg-cravora-cream border-t border-stone-200 flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => setIsLocationModalOpen(true)}
            className="flex items-center gap-1.5 font-bold text-stone-800 truncate"
          >
            <MapPin className="w-3.5 h-3.5 text-cravora-red shrink-0" />
            <span className="truncate">
              {fulfillmentType === 'delivery'
                ? `Delivery: ${deliveryLocation.area}, ${deliveryLocation.city}`
                : `Pickup: ${selectedBranch?.name || 'Select Branch'}`}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setIsLocationModalOpen(true)}
            className="text-cravora-red font-extrabold shrink-0 ml-2"
          >
            Change Location
          </button>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="xl:hidden bg-white border-t border-stone-200 px-4 py-4 space-y-2 shadow-xl">
            <div className="grid grid-cols-2 gap-2 pb-2">
              <button
                type="button"
                onClick={() => {
                  setFulfillmentType('delivery');
                  setMobileMenuOpen(false);
                }}
                className={`py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 ${
                  fulfillmentType === 'delivery'
                    ? 'bg-cravora-red text-white'
                    : 'bg-stone-100 text-stone-700'
                }`}
              >
                <Truck className="w-3.5 h-3.5" /> Delivery
              </button>
              <button
                type="button"
                onClick={() => {
                  setFulfillmentType('pickup');
                  setMobileMenuOpen(false);
                }}
                className={`py-2 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 ${
                  fulfillmentType === 'pickup'
                    ? 'bg-cravora-red text-white'
                    : 'bg-stone-100 text-stone-700'
                }`}
              >
                <Store className="w-3.5 h-3.5" /> Pickup
              </button>
            </div>
            {[
              { to: '/', label: 'Home' },
              { to: '/menu', label: 'Full Menu (16 Categories)' },
              { to: '/deals', label: 'Exclusive Deals & Bundles' },
              { to: '/branches', label: 'Branch Locator & Coverage Map' },
              { to: '/track-order', label: 'Track My Order' },
              { to: '/account', label: 'My Account & Loyalty Rewards' },
              { to: '/support', label: 'Customer Care & Policies' },
              { to: '/admin', label: 'Admin & Operations Dashboard' },
            ].map((item) => (
              <button
                key={item.to}
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  navigate(item.to);
                }}
                className="w-full text-left px-4 py-2.5 rounded-xl hover:bg-stone-100 text-sm font-bold text-stone-800 block"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </header>
    </>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts, removeToast } = useStore();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-24 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto p-4 rounded-2xl shadow-xl border flex items-start gap-3 transition-all ${
            t.type === 'error'
              ? 'bg-red-950 text-white border-red-800'
              : t.type === 'info'
              ? 'bg-cravora-charcoal text-white border-stone-700'
              : 'bg-cravora-charcoal text-white border-emerald-500/50'
          }`}
        >
          {t.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs">
            <div className="font-extrabold">{t.title}</div>
            {t.description && <div className="text-stone-300 mt-0.5">{t.description}</div>}
          </div>
          <button
            type="button"
            onClick={() => removeToast(t.id)}
            className="text-stone-400 hover:text-white"
            aria-label="Dismiss notification"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

export const Footer: React.FC = () => {
  return (
    <footer className="bg-cravora-charcoal text-stone-300 pt-16 pb-12 border-t border-stone-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10">
        {/* Column 1: Brand Story */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cravora-red flex items-center justify-center font-display font-black text-white text-xl">
              C
            </div>
            <div>
              <span className="font-display text-2xl font-black text-white block leading-none">
                CRAVORA
              </span>
              <span className="text-[11px] font-bold uppercase tracking-widest text-cravora-orange">
                Big Flavour. Bold Cravings.
              </span>
            </div>
          </div>
          <p className="text-xs text-stone-400 leading-relaxed max-w-md">
            Crafted for modern Pakistani food culture. From our Seekh Kebab Crown Crust Pizzas and Monster Crunch Zingers to our oven-bubbling Alfredo Pastas and Icy Hill-Station Mint Margaritas, every order is stone-baked fresh.
          </p>
          <div className="flex flex-wrap gap-3 text-xs font-bold text-white">
            <span className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
              100% Halal Certified Kitchens
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
              Islamabad • Rawalpindi • Lahore • Karachi
            </span>
          </div>
        </div>

        {/* Column 2: Explore Menu */}
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-white mb-4">
            Menu Highlights
          </h3>
          <ul className="space-y-2.5 text-xs">
            <li><Link to="/menu?category=signature-pizzas" className="hover:text-cravora-orange transition">Signature Crown Pizzas</Link></li>
            <li><Link to="/menu?category=burgers" className="hover:text-cravora-orange transition">Monster Crunch Burgers</Link></li>
            <li><Link to="/menu?category=wraps-and-rolls" className="hover:text-cravora-orange transition">Bihari Spin Rolls & Wraps</Link></li>
            <li><Link to="/menu?category=pasta-and-lasagna" className="hover:text-cravora-orange transition">Oven-Baked Pasta & Lasagna</Link></li>
            <li><Link to="/menu?category=platters" className="hover:text-cravora-orange transition">Grand Sharing Platters</Link></li>
            <li><Link to="/deals" className="hover:text-cravora-orange transition">Family Feasts & Value Deals</Link></li>
          </ul>
        </div>

        {/* Column 3: Customer Convenience */}
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-white mb-4">
            Customer Care
          </h3>
          <ul className="space-y-2.5 text-xs">
            <li><Link to="/track-order" className="hover:text-cravora-orange transition">Live Order Tracker</Link></li>
            <li><Link to="/branches" className="hover:text-cravora-orange transition">Branch Locator & Coverage Map</Link></li>
            <li><Link to="/account" className="hover:text-cravora-orange transition">Cravora Loyalty Rewards</Link></li>
            <li><Link to="/support" className="hover:text-cravora-orange transition">Log a Support Ticket</Link></li>
            <li><Link to="/admin" className="hover:text-cravora-orange transition">Admin Operations Portal</Link></li>
          </ul>
        </div>

        {/* Column 4: Legal Policies & Contact */}
        <div>
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-white mb-4">
            Legal & Contact
          </h3>
          <ul className="space-y-2.5 text-xs">
            <li><Link to="/support?policy=privacy" className="hover:text-cravora-orange transition">Privacy & Data Policy</Link></li>
            <li><Link to="/support?policy=terms" className="hover:text-cravora-orange transition">Terms of Service</Link></li>
            <li><Link to="/support?policy=delivery" className="hover:text-cravora-orange transition">Delivery Coverage Policy</Link></li>
            <li><Link to="/support?policy=refunds" className="hover:text-cravora-orange transition">Cancellation & Refund Policy</Link></li>
            <li className="pt-2 text-stone-400">
              <strong className="text-white block">24/7 Care Helpline:</strong>
              +92 (51) 111-272-867<br />
              care@cravora.pk
            </li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 mt-12 pt-6 border-t border-stone-800/80 flex flex-wrap items-center justify-between gap-4 text-[11px] text-stone-500">
        <p>© {new Date().getFullYear()} CRAVORA — Pizza & More. Original Brand & Full-Stack Food Commerce Platform.</p>
        <p className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-cravora-red" />
          <span>All prices in PKR • Server-Validated Checkout & RBAC Protected</span>
        </p>
      </div>
    </footer>
  );
};
