import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Flame,
  Mail,
  MapPin,
  Phone,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Tag,
  Truck,
} from 'lucide-react';
import { apiFetch, formatPKR } from '../api/client';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import { Category, Coupon, Product } from '../types';

const SAMPLE_TESTIMONIALS = [
  {
    name: 'Saad Mahmood',
    location: 'F-7/3, Islamabad',
    rating: 5,
    quote:
      'The Royal Crown Crust Pizza and Bihari Spin Rolls arrived piping hot in 28 minutes. The white garlic herb dip is genuinely next level.',
    tag: 'Sample Development Review',
  },
  {
    name: 'Mahnoor Awan',
    location: 'Gulberg III, Lahore',
    rating: 5,
    quote:
      'Asked Cravora AI for a meal for 4 under Rs. 4,500 and it built the exact Family Feast with a Rs. 500 coupon already applied!',
    tag: 'Sample Development Review',
  },
  {
    name: 'Usman Qureshi',
    location: 'Bahria Town Phase 4, Rawalpindi',
    rating: 5,
    quote:
      'Monster Crunch Zinger + Crunchy Oven-Baked Pasta is our household weekend staple. Love the transparent delivery fee breakdown on the map.',
    tag: 'Sample Development Review',
  },
];

const FAQS = [
  {
    q: 'How are delivery charges and minimum order amounts calculated?',
    a: 'Delivery fees are calculated dynamically by our backend coverage engine using your pinned coordinates, the assigned branch’s polygon/radius zone, base fee (Rs. 130–170), and per-kilometer distance rate. Orders above Rs. 3,000 qualify for FREE delivery in standard zones.',
  },
  {
    q: 'Are all menu items 100% Halal certified?',
    a: 'Yes! Every meat, poultry, cheese, and sauce ingredient across all Cravora kitchens in Islamabad, Rawalpindi, Lahore, and Karachi is 100% Halal certified.',
  },
  {
    q: 'How does Cravora AI help me order?',
    a: 'Cravora AI connects directly to our live PostgreSQL/SQLAlchemy menu, pricing, and coverage tools. Tell it your budget (e.g., "Under Rs. 1,500") or group size, and it will prepare a verified cart proposal for you to review and confirm.',
  },
  {
    q: 'Can I customize pizza crusts, stuffed edges, and half-and-half flavors?',
    a: 'Yes! Click "Customize" on any pizza to select Small 8", Regular 10", Large 13", or Party Beast 16", upgrade to Seekh Kebab or Cheddar Crown Stuffed Crust, split Half & Half flavors, and add extra fire-roasted toppings.',
  },
];

export const HomePage: React.FC = () => {
  const {
    fulfillmentType,
    setFulfillmentType,
    deliveryLocation,
    selectedBranch,
    branches,
    setIsLocationModalOpen,
    openAIWithPrompt,
    addToCart,
    setCouponCode,
    addToast,
  } = useStore();

  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Build Your Meal 3-step state
  const [selectedEntreeId, setSelectedEntreeId] = useState<number | null>(null);
  const [selectedSideId, setSelectedSideId] = useState<number | null>(null);
  const [selectedDrinkId, setSelectedDrinkId] = useState<number | null>(null);

  // FAQ state
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0);

  // Newsletter state
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterConsent, setNewsletterConsent] = useState(true);
  const [newsletterStatus, setNewsletterStatus] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<Category[]>('/api/menu/categories'),
      apiFetch<Product[]>('/api/menu/products'),
      apiFetch<{ coupons: Coupon[]; bundles: Product[] }>('/api/promotions'),
    ])
      .then(([cats, prods, promos]) => {
        setCategories(cats);
        setProducts(prods);
        setCoupons(promos.coupons);

        const entrees = prods.filter((p) =>
          ['signature-pizzas', 'classic-pizzas', 'burgers'].includes(p.category_slug || '')
        );
        const sides = prods.filter((p) =>
          ['fries-and-sides', 'starters', 'wraps-and-rolls'].includes(p.category_slug || '')
        );
        const drinks = prods.filter((p) =>
          ['beverages', 'desserts'].includes(p.category_slug || '')
        );
        if (entrees[0]) setSelectedEntreeId(entrees[0].id);
        if (sides[0]) setSelectedSideId(sides[0].id);
        if (drinks[0]) setSelectedDrinkId(drinks[0].id);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const bestsellers = useMemo(
    () => products.filter((p) => p.is_bestseller).slice(0, 8),
    [products]
  );

  const pizzaAndBurgers = useMemo(
    () =>
      products
        .filter((p) =>
          ['signature-pizzas', 'classic-pizzas', 'burgers'].includes(p.category_slug || '')
        )
        .slice(0, 8),
    [products]
  );

  const valueCombos = useMemo(
    () =>
      products
        .filter((p) =>
          ['family-meals', 'value-deals', 'limited-time-promotions', 'platters'].includes(
            p.category_slug || ''
          )
        )
        .slice(0, 4),
    [products]
  );

  const sidesDrinksDesserts = useMemo(
    () =>
      products
        .filter((p) =>
          ['fries-and-sides', 'beverages', 'desserts', 'dips-and-sauces'].includes(
            p.category_slug || ''
          )
        )
        .slice(0, 8),
    [products]
  );

  // Build Your Meal filtered lists
  const builderEntrees = useMemo(
    () =>
      products.filter((p) =>
        ['signature-pizzas', 'classic-pizzas', 'burgers'].includes(p.category_slug || '')
      ),
    [products]
  );
  const builderSides = useMemo(
    () =>
      products.filter((p) =>
        ['fries-and-sides', 'starters', 'wraps-and-rolls'].includes(p.category_slug || '')
      ),
    [products]
  );
  const builderDrinks = useMemo(
    () =>
      products.filter((p) => ['beverages', 'desserts'].includes(p.category_slug || '')),
    [products]
  );

  const chosenEntree = builderEntrees.find((p) => p.id === selectedEntreeId);
  const chosenSide = builderSides.find((p) => p.id === selectedSideId);
  const chosenDrink = builderDrinks.find((p) => p.id === selectedDrinkId);
  const builderTotal =
    (chosenEntree?.base_price || 0) +
    (chosenSide?.base_price || 0) +
    (chosenDrink?.base_price || 0);

  const handleAddBuiltMeal = () => {
    [chosenEntree, chosenSide, chosenDrink].forEach((item) => {
      if (item) {
        addToCart({
          product_id: item.id,
          product_name: item.name,
          product_image: item.image_url,
          variant_id: item.variants?.[0]?.id || null,
          variant_name: item.variants?.[0]?.name || null,
          selected_option_ids: [],
          selected_option_labels: ['Custom Built Meal'],
          quantity: 1,
          unit_price_preview: item.base_price,
        });
      }
    });
    if (builderTotal >= 1500) {
      setCouponCode('CRAVORA20');
    }
  };

  const flashCoupon = coupons.find((c) => c.is_flash_deal && c.end_date);
  const daysRemaining = useMemo(() => {
    if (!flashCoupon?.end_date) return null;
    const diffMs = new Date(flashCoupon.end_date).getTime() - Date.now();
    if (diffMs <= 0) return null;
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
    return { days, hours };
  }, [flashCoupon]);

  const handleNewsletterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string }>('/api/newsletter/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          email: newsletterEmail,
          consent_given: newsletterConsent,
        }),
      });
      setNewsletterStatus(res.message);
      setNewsletterEmail('');
      addToast('Subscribed!', res.message, 'success');
    } catch (err: any) {
      addToast('Subscription Error', err.message, 'error');
    }
  };

  return (
    <div className="space-y-16 pb-16">
      {/* HERO SECTION (Sections 3, 4 & 5: Fulfillment, Cinematic Hero & Location Bar) */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1C0A00 0%, #2D1200 45%, #1C0A00 100%)' }}>
        {/* Background food image with warm overlay */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=1800&q=80"
            alt=""
            aria-hidden="true"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(120deg, rgba(28,10,0,0.95) 0%, rgba(45,18,0,0.80) 50%, rgba(28,10,0,0.60) 100%)' }} />
        </div>
        {/* Warm glow orb */}
        <div className="absolute top-0 right-0 w-[700px] h-[700px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(232,93,4,0.18) 0%, transparent 65%)', transform: 'translate(20%, -20%)' }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(251,146,60,0.12) 0%, transparent 65%)', transform: 'translate(-20%, 20%)' }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-14 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          {/* Left Hero Copy */}
          <div className="lg:col-span-7 space-y-7 text-white">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-extrabold" style={{ background: 'rgba(232,93,4,0.18)', border: '1px solid rgba(251,146,60,0.40)', color: '#FB923C' }}>
              <Flame className="w-4 h-4" style={{ color: '#E85D04' }} />
              <span>STONE-BAKED AT 450°C • 100% HALAL • DELIVERED HOT</span>
            </div>

            {/* Headline */}
            <h1 className="font-display text-5xl sm:text-7xl font-black tracking-tight leading-[1.04]">
              Big Flavour.{' '}
              <span className="block" style={{ backgroundImage: 'linear-gradient(90deg, #FB923C 0%, #E85D04 50%, #F59E0B 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                Bold Cravings.
              </span>
            </h1>

            <p className="text-sm sm:text-lg leading-relaxed max-w-xl" style={{ color: '#FED7AA' }}>
              Pakistan’s most indulgent food-commerce experience — Seekh Kebab Stuffed Crown Pizzas, Monster Crunch Zingers, and Creamy Oven-Baked Alfredo — delivered blazing hot or express pickup ready.
            </p>

            {/* Interactive Location & Fulfillment Bar */}
            <div className="p-3 rounded-3xl shadow-2xl max-w-2xl" style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)' }}>
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-stone-200">
                <div className="inline-flex rounded-xl bg-stone-100 p-1">
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('delivery')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition ${
                      fulfillmentType === 'delivery' ? 'text-white shadow' : 'text-stone-600'
                    }`}
                    style={fulfillmentType === 'delivery' ? { background: 'linear-gradient(135deg,#E85D04,#FB923C)' } : {}}
                  >
                    <Truck className="w-3.5 h-3.5" /> Home Delivery
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentType('pickup')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 transition ${
                      fulfillmentType === 'pickup' ? 'text-white shadow' : 'text-stone-600'
                    }`}
                    style={fulfillmentType === 'pickup' ? { background: 'linear-gradient(135deg,#E85D04,#FB923C)' } : {}}
                  >
                    <Store className="w-3.5 h-3.5" /> Branch Pickup
                  </button>
                </div>

                {deliveryLocation.coverage?.deliverable && fulfillmentType === 'delivery' && (
                  <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                    ✓ Zone Covered ({deliveryLocation.coverage.distance_km} km • Fee{' '}
                    {formatPKR(deliveryLocation.coverage.delivery_fee)})
                  </span>
                )}
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsLocationModalOpen(true)}
                  className="flex-1 px-4 py-3 rounded-2xl bg-stone-100 hover:bg-orange-50 text-left flex items-center gap-3 transition"
                >
                  <MapPin className="w-5 h-5 shrink-0" style={{ color: '#E85D04' }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                      {fulfillmentType === 'delivery' ? 'Selected Delivery Pin & Zone' : 'Selected Pickup Outlet'}
                    </div>
                    <div className="text-xs sm:text-sm font-extrabold text-stone-900 truncate">
                      {fulfillmentType === 'delivery'
                        ? deliveryLocation.formatted_address
                        : selectedBranch?.name || 'Choose a Branch'}
                    </div>
                  </div>
                  <span className="text-xs font-extrabold shrink-0" style={{ color: '#E85D04' }}>Set Pin</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/menu')}
                  className="px-6 py-3.5 rounded-2xl text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition hover:brightness-110 active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #E85D04 0%, #C2410C 100%)', boxShadow: '0 8px 28px -4px rgba(232,93,4,0.60)' }}
                >
                  <span>Order Now</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Secondary CTAs */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {[
                { to: '/menu', label: 'Explore Full Menu' },
                { to: '/deals', label: 'View All Deals' },
                { to: '/branches', label: 'Find a Branch' },
                { to: '/track-order', label: 'Track My Order' },
              ].map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  className="px-5 py-2.5 rounded-2xl text-xs font-extrabold transition hover:brightness-110"
                  style={{ background: 'rgba(232,93,4,0.15)', border: '1px solid rgba(251,146,60,0.35)', color: '#FED7AA' }}
                >
                  {label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => openAIWithPrompt('Suggest the best meal under Rs. 1,500')}
                className="px-5 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-1.5 transition hover:brightness-110"
                style={{ background: 'linear-gradient(135deg, #F59E0B, #E85D04)', color: '#1C0A00', boxShadow: '0 4px 15px -3px rgba(232,93,4,0.45)' }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Ask AI: Meal Under Rs. 1,500</span>
              </button>
            </div>

            {/* Trust Badges */}
            <div className="flex flex-wrap items-center gap-6 pt-2">
              {[
                { icon: <CheckCircle2 className="w-4 h-4" />, text: '100% Halal Certified' },
                { icon: <Clock className="w-4 h-4" />, text: '25–35 min Delivery' },
                { icon: <Star className="w-4 h-4" />, text: '4.8★ Customer Rating' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#FB923C' }}>
                  {icon}<span>{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Hero Showcase Card */}
          <div className="lg:col-span-5">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl group" style={{ border: '2px solid rgba(232,93,4,0.35)' }}>
              <img
                src="https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=1000&q=80"
                alt="Royal Crown Crust Pizza"
                className="w-full h-80 sm:h-[420px] object-cover group-hover:scale-105 transition duration-700"
              />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(28,10,0,0.96) 0%, rgba(45,18,0,0.50) 50%, transparent 100%)' }} />
              <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-white text-xs font-extrabold uppercase shadow-lg" style={{ background: 'linear-gradient(135deg, #E85D04, #C2410C)' }}>
                ★ Signature Creation
              </div>
              <div className="absolute bottom-5 left-5 right-5 space-y-2">
                <div className="text-xs font-extrabold uppercase tracking-wider" style={{ color: '#FB923C' }}>
                  #1 Most Ordered Across Pakistan
                </div>
                <h2 className="text-2xl font-black text-white leading-tight">
                  Royal Crown Crust & Bihari Spin-Roll Feast
                </h2>
                <p className="text-xs" style={{ color: '#FED7AA' }}>
                  Charcoal seekh kebab pockets, molten cheddar crown, freshly whipped garlic herb dip.
                </p>
                <div className="pt-3 flex items-center justify-between">
                  <span className="text-lg font-black text-white">Starting Rs. 1,690</span>
                  <button
                    type="button"
                    onClick={() => navigate('/menu?category=signature-pizzas')}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold transition hover:brightness-110"
                    style={{ background: 'linear-gradient(135deg, #E85D04, #C2410C)', color: '#fff' }}
                  >
                    Customize Crown →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: CATEGORY SHORTCUTS WITH CUSTOM IMAGERY */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-red">
              16 Curated Categories
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-black text-stone-900">
              Explore Our Craving Menu
            </h2>
          </div>
          <Link
            to="/menu"
            className="text-xs font-extrabold text-cravora-red hover:underline flex items-center gap-1"
          >
            <span>View All {categories.length} Categories</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-stone-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3.5">
            {categories.map((cat) => (
              <Link
                key={cat.id}
                to={`/menu?category=${cat.slug}`}
                className="group bg-white rounded-2xl p-2.5 border border-stone-200 hover:border-cravora-red shadow-sm hover:shadow-md transition text-center flex flex-col items-center"
              >
                <div className="w-full h-20 rounded-xl overflow-hidden bg-stone-100 mb-2">
                  <img
                    src={cat.image_url}
                    alt={cat.name}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src =
                        'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80';
                    }}
                    className="w-full h-full object-cover group-hover:scale-110 transition duration-300"
                  />
                </div>
                <span className="text-xs font-extrabold text-stone-800 group-hover:text-cravora-red line-clamp-1">
                  {cat.name}
                </span>
                {cat.product_count !== undefined && (
                  <span className="text-[10px] text-stone-400 font-semibold">
                    {cat.product_count} items
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* SECTION 7: BESTSELLERS & SIGNATURE MEALS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-red">
              Crowd Favorites
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-black text-stone-900">
              Bestsellers & Signature Cravings
            </h2>
          </div>
          <Link
            to="/menu?bestseller=true"
            className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-cravora-red text-white text-xs font-extrabold transition"
          >
            Browse All Bestsellers
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {bestsellers.map((prod) => (
            <ProductCard key={prod.id} product={prod} />
          ))}
        </div>
      </section>

      {/* SECTION 8 & 11 & 12: EXCLUSIVE DEALS, CUSTOMIZABLE COMBOS & FLASH CAMPAIGN COUNTDOWN */}
      <section className="bg-stone-900 text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-10">
          {/* Promotional Campaign Banner with Real Expiration Countdown */}
          <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-cravora-red via-red-700 to-cravora-charcoal border border-white/15 shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/30 text-amber-300 text-xs font-extrabold">
                <Tag className="w-3.5 h-3.5" />
                <span>VERIFIED TIME-LIMITED PROMOTION</span>
              </div>
              <h2 className="font-display text-2xl sm:text-4xl font-black">
                {flashCoupon ? flashCoupon.title : '20% OFF Launch Celebration — Code CRAVORA20'}
              </h2>
              <p className="text-xs sm:text-sm text-red-100">
                {flashCoupon
                  ? flashCoupon.description
                  : 'Save 20% (up to Rs. 600) on orders above Rs. 1,500. Automatically verified at checkout.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {daysRemaining && (
                <div className="flex items-center gap-2 bg-black/35 px-4 py-3 rounded-2xl border border-white/10">
                  <Clock className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-stone-300 font-bold">
                      Offer Expires In
                    </div>
                    <div className="text-sm font-black text-white">
                      {daysRemaining.days}d : {daysRemaining.hours}h remaining
                    </div>
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setCouponCode(flashCoupon?.code || 'CRAVORA20');
                  addToast(
                    `Promo ${flashCoupon?.code || 'CRAVORA20'} Activated!`,
                    'Discount will apply automatically once your cart meets the minimum order.',
                    'success'
                  );
                  navigate('/deals');
                }}
                className="px-6 py-3.5 rounded-2xl bg-white text-cravora-charcoal hover:bg-cravora-orange hover:text-white font-extrabold text-xs sm:text-sm shadow-lg transition"
              >
                Apply {flashCoupon?.code || 'CRAVORA20'} & View Deals
              </button>
            </div>
          </div>

          {/* Customizable Value Combos Grid */}
          <div>
            <div className="flex items-end justify-between mb-6">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-orange">
                  Customizable Value Bundles
                </span>
                <h3 className="font-display text-2xl sm:text-3xl font-black text-white">
                  Exclusive Deals & Family Feasts
                </h3>
              </div>
              <Link
                to="/deals"
                className="text-xs font-extrabold text-cravora-orange hover:underline flex items-center gap-1"
              >
                <span>See All Coupons & Bundles</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-stone-900">
              {valueCombos.map((combo) => (
                <ProductCard key={combo.id} product={combo} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 13: INTERACTIVE "BUILD YOUR MEAL" EXPERIENCE */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-3xl border-2 border-stone-200 shadow-card p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-stone-200">
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-cravora-red">
                <Sparkles className="w-4 h-4" /> Interactive Meal Builder
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-black text-stone-900 mt-0.5">
                Build Your Own Custom Cravora Feast
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                Pick 1 Main Entrée + 1 Oven Side + 1 Drink/Dessert — add all 3 in one click and unlock{' '}
                <strong className="text-cravora-red">CRAVORA20 (20% OFF)</strong> when over Rs. 1,500!
              </p>
            </div>

            <div className="bg-cravora-cream px-5 py-3 rounded-2xl border border-stone-200 flex items-center gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase text-stone-500">
                  3-Item Meal Total
                </div>
                <div className="text-xl font-black text-cravora-red">
                  {formatPKR(builderTotal)}
                </div>
              </div>
              <button
                type="button"
                onClick={handleAddBuiltMeal}
                className="px-5 py-3 rounded-xl bg-cravora-red hover:bg-cravora-redDark text-white text-xs font-extrabold shadow-glow flex items-center gap-2 transition"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Add Complete Meal</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-6">
            {/* Step 1: Entree */}
            <div className="space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
                Step 1 • Choose Main Pizza or Burger
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {builderEntrees.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedEntreeId(item.id)}
                    className={`w-full p-3 rounded-2xl border-2 text-left flex items-center gap-3 transition ${
                      selectedEntreeId === item.id
                        ? 'border-cravora-red bg-red-50/40'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-12 h-12 rounded-xl object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-extrabold text-stone-900 truncate">
                        {item.name}
                      </div>
                      <div className="text-xs font-bold text-cravora-red">
                        {formatPKR(item.base_price)}
                      </div>
                    </div>
                    {selectedEntreeId === item.id && (
                      <CheckCircle2 className="w-5 h-5 text-cravora-red shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: Side */}
            <div className="space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
                Step 2 • Choose Rolls, Calzone or Loaded Fries
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {builderSides.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedSideId(item.id)}
                    className={`w-full p-3 rounded-2xl border-2 text-left flex items-center gap-3 transition ${
                      selectedSideId === item.id
                        ? 'border-cravora-red bg-red-50/40'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-12 h-12 rounded-xl object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-extrabold text-stone-900 truncate">
                        {item.name}
                      </div>
                      <div className="text-xs font-bold text-cravora-red">
                        {formatPKR(item.base_price)}
                      </div>
                    </div>
                    {selectedSideId === item.id && (
                      <CheckCircle2 className="w-5 h-5 text-cravora-red shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 3: Drink or Dessert */}
            <div className="space-y-3">
              <div className="text-xs font-extrabold uppercase tracking-wider text-stone-500">
                Step 3 • Choose Drink or Molten Dessert
              </div>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {builderDrinks.slice(0, 6).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedDrinkId(item.id)}
                    className={`w-full p-3 rounded-2xl border-2 text-left flex items-center gap-3 transition ${
                      selectedDrinkId === item.id
                        ? 'border-cravora-red bg-red-50/40'
                        : 'border-stone-200 hover:border-stone-300'
                    }`}
                  >
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="w-12 h-12 rounded-xl object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-extrabold text-stone-900 truncate">
                        {item.name}
                      </div>
                      <div className="text-xs font-bold text-cravora-red">
                        {formatPKR(item.base_price)}
                      </div>
                    </div>
                    {selectedDrinkId === item.id && (
                      <CheckCircle2 className="w-5 h-5 text-cravora-red shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 9: PIZZA & BURGER HIGHLIGHTS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-red">
              Hand-Stretched & Crispy Fried
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-black text-stone-900">
              Pizza & Burger Spotlights
            </h2>
          </div>
          <Link to="/menu?category=signature-pizzas" className="text-xs font-extrabold text-cravora-red hover:underline">
            Explore All Pizzas & Burgers →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {pizzaAndBurgers.slice(0, 4).map((prod) => (
            <ProductCard key={prod.id} product={prod} />
          ))}
        </div>
      </section>

      {/* SECTION 10: RECOMMENDED SIDES, DRINKS & DESSERTS */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-end justify-between mb-6">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-orange">
              Complete the Table
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-black text-stone-900">
              Sides, Signature Dips, Drinks & Molten Desserts
            </h2>
          </div>
          <Link to="/menu?category=fries-and-sides" className="text-xs font-extrabold text-cravora-red hover:underline">
            View All Sides & Drinks →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {sidesDrinksDesserts.slice(0, 4).map((prod) => (
            <ProductCard key={prod.id} product={prod} />
          ))}
        </div>
      </section>

      {/* SECTION 14: CUSTOMER TESTIMONIALS (Clearly Labeled Sample Data) */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-2 mb-6">
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-red">
              Community Feedback (Sample Development Data)
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-black text-stone-900">
              Loved Across Pakistan
            </h2>
          </div>
          <span className="px-3 py-1 rounded-full bg-stone-200/80 text-stone-600 text-[11px] font-bold">
            Labeled Sample Data for UI Demonstration
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SAMPLE_TESTIMONIALS.map((t, idx) => (
            <div
              key={idx}
              className="p-6 rounded-3xl bg-white border border-stone-200 shadow-card flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-amber-500">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-amber-400" />
                    ))}
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-500">
                    {t.tag}
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-stone-700 leading-relaxed">
                  "{t.quote}"
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-stone-100">
                <div className="text-xs font-extrabold text-stone-900">{t.name}</div>
                <div className="text-[11px] text-stone-500">{t.location}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 15 & 16: FAQ & NEWSLETTER SIGNUP */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* FAQ Accordion */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-card">
          <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-red">
            Got Questions?
          </span>
          <h2 className="font-display text-2xl font-black text-stone-900 mt-1 mb-5">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaqIdx === idx;
              return (
                <div
                  key={idx}
                  className="rounded-2xl border border-stone-200 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaqIdx(isOpen ? null : idx)}
                    className="w-full px-4 py-3.5 text-left flex items-center justify-between gap-2 bg-stone-50/70 hover:bg-stone-100 transition"
                  >
                    <span className="text-xs sm:text-sm font-extrabold text-stone-900">
                      {faq.q}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-stone-500 transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-4 py-3 text-xs text-stone-600 leading-relaxed bg-white border-t border-stone-100">
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Newsletter & Craving Alerts */}
        <div className="lg:col-span-5 bg-cravora-charcoal text-white rounded-3xl p-6 sm:p-8 shadow-xl space-y-5">
          <div className="w-12 h-12 rounded-2xl bg-cravora-red flex items-center justify-center">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-orange">
              Cravora Inner Circle
            </span>
            <h2 className="font-display text-2xl font-black mt-1">
              Get Secret Pizza Drops & Flash Promo Codes
            </h2>
            <p className="text-xs text-stone-300 mt-1.5 leading-relaxed">
              Join our VIP list for late-night flash deals, new branch launches, and exclusive loyalty point multipliers.
            </p>
          </div>

          <form onSubmit={handleNewsletterSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder="Enter your email address (e.g. you@example.com)"
              className="w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-stone-400 text-xs focus:border-cravora-orange focus:outline-none"
            />
            <label className="flex items-start gap-2 text-[11px] text-stone-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newsletterConsent}
                onChange={(e) => setNewsletterConsent(e.target.checked)}
                className="mt-0.5 accent-cravora-red rounded"
              />
              <span>
                I consent to receive promotional offers from Cravora — Pizza & More and agree to the Privacy Policy.
              </span>
            </label>
            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-cravora-red hover:bg-cravora-redDark text-white font-extrabold text-xs shadow-glow transition"
            >
              Subscribe to Craving Alerts
            </button>
          </form>

          {newsletterStatus && (
            <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-xs text-emerald-200 font-semibold">
              {newsletterStatus}
            </div>
          )}
        </div>
      </section>

      {/* SECTION 17: BRANCH & CONTACT INFORMATION PREVIEW */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-card">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-red">
                Operating Lounges & Express Hubs
              </span>
              <h2 className="font-display text-2xl sm:text-3xl font-black text-stone-900">
                Visit or Order From Our Branches
              </h2>
            </div>
            <Link
              to="/branches"
              className="px-5 py-2.5 rounded-2xl bg-cravora-charcoal hover:bg-cravora-red text-white text-xs font-extrabold transition"
            >
              Open Interactive Branch Map →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {branches.slice(0, 3).map((b) => (
              <div
                key={b.id}
                className="p-4 rounded-2xl bg-cravora-cream border border-stone-200 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="px-2.5 py-0.5 rounded bg-cravora-charcoal text-white text-[10px] font-extrabold uppercase">
                    {b.city}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700">
                    Open {b.opening_time} – {b.closing_time}
                  </span>
                </div>
                <h3 className="text-sm font-extrabold text-stone-900">{b.name}</h3>
                <p className="text-xs text-stone-600">{b.address}</p>
                <div className="pt-1 flex items-center justify-between text-xs font-bold text-stone-800">
                  <span className="inline-flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5 text-cravora-red" />
                    {b.phone}
                  </span>
                  <Link to="/branches" className="text-cravora-red hover:underline">
                    View Zone →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
