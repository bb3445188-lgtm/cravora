import React from 'react';
import { Flame, Leaf, Plus, SlidersHorizontal, Sparkles } from 'lucide-react';
import { formatPKR } from '../api/client';
import { useStore } from '../context/StoreContext';
import { Product } from '../types';

interface ProductCardProps {
  product: Product;
}

export const ProductCard: React.FC<ProductCardProps> = ({ product }) => {
  const { openCustomizeModal, quickAddProduct } = useStore();
  const hasCustomizations =
    (product.variants && product.variants.length > 0) ||
    (product.customization_groups && product.customization_groups.length > 0);

  return (
    <div className="group bg-white rounded-3xl border border-stone-200/90 shadow-card hover:shadow-cardHover transition-all duration-300 flex flex-col overflow-hidden">
      {/* Image Container */}
      <div
        onClick={() => openCustomizeModal(product)}
        className="relative h-48 sm:h-52 w-full bg-stone-100 overflow-hidden cursor-pointer"
      >
        <img
          src={product.image_url}
          alt={product.name}
          loading="lazy"
          onError={(e) => {
            const target = e.currentTarget;
            target.onerror = null;
            target.src =
              'https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=900&q=80';
          }}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition" />

        {/* Top Left Badges */}
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {product.is_bestseller && (
            <span className="px-2.5 py-1 rounded-full bg-cravora-red text-white text-[10px] font-extrabold uppercase tracking-wide shadow">
              Bestseller
            </span>
          )}
          {product.is_new && (
            <span className="px-2.5 py-1 rounded-full bg-cravora-charcoal text-cravora-orange text-[10px] font-extrabold uppercase tracking-wide shadow inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> New Drop
            </span>
          )}
          {product.compare_at_price && product.compare_at_price > product.base_price && (
            <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold uppercase shadow">
              Save {formatPKR(product.compare_at_price - product.base_price)}
            </span>
          )}
        </div>

        {/* Top Right Dietary Icons */}
        <div className="absolute top-3 right-3 flex items-center gap-1">
          {product.is_spicy && (
            <span
              title="Spicy Pakistani Profile"
              className="w-7 h-7 rounded-full bg-orange-500/95 text-white flex items-center justify-center shadow"
            >
              <Flame className="w-3.5 h-3.5" />
            </span>
          )}
          {product.is_vegetarian && (
            <span
              title="100% Vegetarian"
              className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow"
            >
              <Leaf className="w-3.5 h-3.5" />
            </span>
          )}
        </div>

        {/* Quick View Overlay Pill */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openCustomizeModal(product);
          }}
          className="absolute bottom-3 right-3 px-3 py-1.5 rounded-full bg-white/95 backdrop-blur text-stone-900 text-[11px] font-extrabold shadow-sm opacity-95 group-hover:bg-cravora-charcoal group-hover:text-white transition flex items-center gap-1"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span>{hasCustomizations ? 'Customize' : 'Quick View'}</span>
        </button>
      </div>

      {/* Card Body */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3
              onClick={() => openCustomizeModal(product)}
              className="font-extrabold text-stone-900 text-base leading-snug group-hover:text-cravora-red cursor-pointer transition"
            >
              {product.name}
            </h3>
          </div>
          <p className="text-xs text-stone-500 mt-1.5 line-clamp-2 leading-relaxed">
            {product.short_description}
          </p>
        </div>

        {/* Price & Action Row */}
        <div className="mt-4 pt-3.5 border-t border-stone-100 flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-stone-400">
              {hasCustomizations ? 'Starting From' : 'Price'}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-extrabold text-cravora-charcoal">
                {formatPKR(product.base_price)}
              </span>
              {product.compare_at_price && product.compare_at_price > product.base_price && (
                <span className="text-xs text-stone-400 line-through font-semibold">
                  {formatPKR(product.compare_at_price)}
                </span>
              )}
            </div>
          </div>

          {product.is_available && product.stock_qty > 0 ? (
            <button
              type="button"
              onClick={() => quickAddProduct(product)}
              className="px-4 py-2.5 rounded-2xl bg-cravora-red hover:bg-cravora-redDark text-white text-xs font-extrabold shadow-sm hover:shadow-glow transition inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{hasCustomizations ? 'Select' : 'Add'}</span>
            </button>
          ) : (
            <span className="px-3 py-2 rounded-xl bg-stone-100 text-stone-400 text-xs font-bold">
              Sold Out
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
