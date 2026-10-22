import React, { useEffect, useState } from 'react';
import { Check, Clock, Copy, Sparkles, Tag, Ticket } from 'lucide-react';
import { apiFetch, formatPKR } from '../api/client';
import { ProductCard } from '../components/ProductCard';
import { useStore } from '../context/StoreContext';
import { Coupon, Product } from '../types';

export const DealsPage: React.FC = () => {
  const { couponCode, setCouponCode, addToast, setIsCartOpen } = useStore();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [bundles, setBundles] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ coupons: Coupon[]; bundles: Product[] }>('/api/promotions')
      .then((res) => {
        setCoupons(res.coupons);
        setBundles(res.bundles);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleApplyCoupon = (code: string) => {
    setCouponCode(code);
    setCopiedCode(code);
    navigator.clipboard?.writeText(code).catch(() => {});
    addToast(
      `Coupon ${code} Activated!`,
      'Applied to your Craving Bag. Eligibility and discount will be verified on the server.',
      'success'
    );
    setTimeout(() => setCopiedCode(null), 3000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-12">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-cravora-charcoal via-stone-900 to-cravora-red text-white rounded-3xl p-6 sm:p-10 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="space-y-2 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-cravora-orange text-xs font-extrabold uppercase">
            <Sparkles className="w-3.5 h-3.5" /> Verified Offers & Bundles
          </span>
          <h1 className="font-display text-3xl sm:text-5xl font-black">
            Cravora Deals, Coupons & Family Bundles
          </h1>
          <p className="text-xs sm:text-sm text-stone-200 leading-relaxed">
            Every coupon code and meal bundle is verified on the server against minimum order rules, fulfillment eligibility, and real expiration dates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="px-6 py-3.5 rounded-2xl bg-white text-cravora-charcoal hover:bg-cravora-orange hover:text-white font-extrabold text-xs sm:text-sm shadow-lg transition"
        >
          Open Cart & Check My Savings
        </button>
      </div>

      {/* Section 1: Active Coupon Codes */}
      <section className="space-y-5">
        <div>
          <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-red">
            Instant Checkout Codes
          </span>
          <h2 className="font-display text-2xl sm:text-3xl font-black text-stone-900">
            Active Promotional Coupons
          </h2>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 rounded-3xl bg-stone-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {coupons.map((c) => {
              const isApplied = couponCode === c.code;
              const expDate = c.end_date ? new Date(c.end_date) : null;
              return (
                <div
                  key={c.id}
                  className={`p-6 rounded-3xl border-2 bg-white shadow-card flex flex-col justify-between gap-4 transition ${
                    isApplied ? 'border-cravora-red bg-red-50/20' : 'border-stone-200'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-cravora-charcoal text-cravora-orange font-mono text-sm font-black">
                        <Ticket className="w-4 h-4" />
                        {c.code}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {c.fulfillment_restriction !== 'all' && (
                          <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-extrabold uppercase">
                            {c.fulfillment_restriction} Only
                          </span>
                        )}
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
                          {c.discount_type === 'percentage'
                            ? `${c.discount_value}% OFF`
                            : `Flat ${formatPKR(c.discount_value)} OFF`}
                        </span>
                      </div>
                    </div>

                    <h3 className="text-lg font-extrabold text-stone-900">{c.title}</h3>
                    <p className="text-xs text-stone-600 leading-relaxed">{c.description}</p>
                  </div>

                  <div className="pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="text-[11px] text-stone-500 space-y-0.5">
                      <div>
                        Min Order: <strong className="text-stone-800">{formatPKR(c.min_order_amount)}</strong>
                        {c.max_discount_amount ? ` • Max Cap: ${formatPKR(c.max_discount_amount)}` : ''}
                      </div>
                      {expDate && (
                        <div className="flex items-center gap-1 text-stone-400">
                          <Clock className="w-3 h-3" />
                          <span>Valid until {expDate.toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleApplyCoupon(c.code)}
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition ${
                        isApplied || copiedCode === c.code
                          ? 'bg-emerald-600 text-white'
                          : 'bg-cravora-red hover:bg-cravora-redDark text-white'
                      }`}
                    >
                      {isApplied || copiedCode === c.code ? (
                        <>
                          <Check className="w-3.5 h-3.5" /> Applied in Cart
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" /> Apply Code
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Customizable Value Combos, Family Meals & Platters */}
      <section className="space-y-5">
        <div>
          <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-red">
            Customize Flavors, Sides & Drinks
          </span>
          <h2 className="font-display text-2xl sm:text-3xl font-black text-stone-900">
            Family Feasts, Duo Combos & Sharing Platters
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {bundles.map((bundle) => (
            <ProductCard key={bundle.id} product={bundle} />
          ))}
        </div>
      </section>
    </div>
  );
};
