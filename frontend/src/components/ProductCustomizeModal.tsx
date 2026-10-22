import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Flame,
  Info,
  Leaf,
  Minus,
  Plus,
  ShoppingBag,
  Sparkles,
  X,
} from 'lucide-react';
import { apiFetch, formatPKR } from '../api/client';
import { useStore } from '../context/StoreContext';
import { Product } from '../types';

export const ProductCustomizeModal: React.FC = () => {
  const { customizingProduct, closeCustomizeModal, addToCart } = useStore();
  const [detailedProduct, setDetailedProduct] = useState<Product | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<number | null>(null);
  const [selectedByGroup, setSelectedByGroup] = useState<Record<number, number[]>>({});
  const [enableHalfAndHalf, setEnableHalfAndHalf] = useState(false);
  const [halfPizzaId, setHalfPizzaId] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [specialInstructions, setSpecialInstructions] = useState('');

  const product = detailedProduct || customizingProduct;

  useEffect(() => {
    if (!customizingProduct) {
      setDetailedProduct(null);
      return;
    }

    // Initialize default variant & default options
    const initDefaults = (p: Product) => {
      if (p.variants && p.variants.length > 0) {
        const defVar = p.variants.find((v) => v.is_default && v.is_available) || p.variants[0];
        setSelectedVariantId(defVar.id);
      } else {
        setSelectedVariantId(null);
      }

      const groupInit: Record<number, number[]> = {};
      (p.customization_groups || []).forEach((g) => {
        const defaults = g.options.filter((o) => o.is_default && o.is_available).map((o) => o.id);
        if (defaults.length > 0) {
          groupInit[g.id] = defaults;
        } else if (g.is_required && g.options.length > 0) {
          groupInit[g.id] = [g.options[0].id];
        } else {
          groupInit[g.id] = [];
        }
      });
      setSelectedByGroup(groupInit);
      setEnableHalfAndHalf(false);
      setHalfPizzaId(null);
      setQuantity(1);
      setSpecialInstructions('');
    };

    initDefaults(customizingProduct);

    apiFetch<Product>(`/api/menu/products/${customizingProduct.slug}`)
      .then((full) => {
        setDetailedProduct(full);
      })
      .catch(() => {});
  }, [customizingProduct]);

  const priceBreakdown = useMemo(() => {
    if (!product) {
      return { baseUnit: 0, optionsTotal: 0, halfCharge: 0, unitPrice: 0, lineTotal: 0, optionLabels: [] as string[] };
    }
    let baseUnit = product.base_price;
    if (product.variants && product.variants.length > 0 && selectedVariantId) {
      const v = product.variants.find((x) => x.id === selectedVariantId);
      if (v) {
        baseUnit = v.absolute_price != null ? v.absolute_price : product.base_price + v.price_modifier;
      }
    }

    let optionsTotal = 0;
    const optionLabels: string[] = [];

    (product.customization_groups || []).forEach((g) => {
      const chosenIds = selectedByGroup[g.id] || [];
      g.options.forEach((opt) => {
        if (chosenIds.includes(opt.id)) {
          optionsTotal += opt.price;
          optionLabels.push(opt.price > 0 ? `${opt.name} (+${formatPKR(opt.price)})` : opt.name);
        }
      });
    });

    let halfCharge = 0;
    if (enableHalfAndHalf && halfPizzaId && product.related_products) {
      const second = product.related_products.find((rp) => rp.id === halfPizzaId);
      if (second) {
        halfCharge = 150;
        optionLabels.push(`Half & Half: ${second.name} (+Rs. 150)`);
      }
    }

    const unitPrice = baseUnit + optionsTotal + halfCharge;
    const lineTotal = unitPrice * quantity;
    return { baseUnit, optionsTotal, halfCharge, unitPrice, lineTotal, optionLabels };
  }, [product, selectedVariantId, selectedByGroup, enableHalfAndHalf, halfPizzaId, quantity]);

  if (!product) return null;

  const isPizza =
    (product.category_slug && product.category_slug.includes('pizza')) ||
    product.name.toLowerCase().includes('pizza');

  const handleToggleOption = (groupId: number, optionId: number, selectionType: 'single' | 'multiple', maxSelections: number) => {
    setSelectedByGroup((prev) => {
      const current = prev[groupId] || [];
      if (selectionType === 'single') {
        const groupObj = product.customization_groups.find((g) => g.id === groupId);
        if (!groupObj?.is_required && current.includes(optionId)) {
          return { ...prev, [groupId]: [] };
        }
        return { ...prev, [groupId]: [optionId] };
      } else {
        if (current.includes(optionId)) {
          return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
        }
        if (current.length >= maxSelections) {
          return prev;
        }
        return { ...prev, [groupId]: [...current, optionId] };
      }
    });
  };

  const handleAddCustomizedToCart = () => {
    const allOptionIds = Object.values(selectedByGroup).flat();
    const chosenVariant = product.variants.find((v) => v.id === selectedVariantId);

    addToCart({
      product_id: product.id,
      product_name: product.name,
      product_image: product.image_url,
      variant_id: chosenVariant ? chosenVariant.id : null,
      variant_name: chosenVariant ? chosenVariant.name : null,
      selected_option_ids: allOptionIds,
      selected_option_labels: priceBreakdown.optionLabels,
      half_and_half_product_id: enableHalfAndHalf && halfPizzaId ? halfPizzaId : null,
      quantity,
      unit_price_preview: priceBreakdown.unitPrice,
      special_instructions: specialInstructions.trim() || undefined,
    });
    closeCustomizeModal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customize-modal-title"
    >
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Top Hero Banner */}
        <div className="relative h-52 sm:h-64 bg-stone-900 shrink-0">
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover opacity-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <button
            type="button"
            onClick={closeCustomizeModal}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-black/50 hover:bg-black/80 text-white transition"
            aria-label="Close customization modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="absolute bottom-4 left-6 right-6 text-white">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              {product.is_bestseller && (
                <span className="px-2.5 py-0.5 rounded-full bg-cravora-red text-white text-[11px] font-extrabold uppercase tracking-wide">
                  #1 Bestseller
                </span>
              )}
              {product.is_spicy && (
                <span className="px-2.5 py-0.5 rounded-full bg-orange-500/90 text-white text-[11px] font-bold inline-flex items-center gap-1">
                  <Flame className="w-3 h-3" /> Spicy Pakistani Profile
                </span>
              )}
              {product.is_vegetarian && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold inline-flex items-center gap-1">
                  <Leaf className="w-3 h-3" /> 100% Vegetarian
                </span>
              )}
              {product.calories && (
                <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur text-white text-[11px] font-semibold">
                  {product.calories} kcal
                </span>
              )}
              <span className="px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur text-white text-[11px] font-semibold inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> ~{product.prep_time_mins} mins bake time
              </span>
            </div>
            <h2 id="customize-modal-title" className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {product.name}
            </h2>
            <p className="text-xs sm:text-sm text-stone-200 line-clamp-2 mt-1">
              {product.full_description || product.short_description}
            </p>
          </div>
        </div>

        {/* Scrollable Customization Controls */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Allergen & Dietary Info Strip */}
          {(product.dietary_tags.length > 0 || product.allergens.length > 0) && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-2xl bg-cravora-cream border border-stone-200 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-bold text-stone-700">Verified Tags:</span>
                {product.dietary_tags.map((t) => (
                  <span key={t} className="px-2 py-0.5 rounded-md bg-white border border-stone-200 font-semibold text-stone-700">
                    {t}
                  </span>
                ))}
              </div>
              {product.allergens.length > 0 && (
                <div className="text-stone-500 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-amber-600" />
                  <span>Allergens: {product.allergens.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* 1. Size / Variant Selector */}
          {product.variants && product.variants.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-base font-extrabold text-stone-900">
                    Choose Size / Portion
                  </h3>
                  <p className="text-xs text-stone-500">Required • Select 1 option</p>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-red-50 text-cravora-red text-[11px] font-extrabold">
                  Required
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {product.variants.map((v) => {
                  const isSelected = selectedVariantId === v.id;
                  const vPrice = v.absolute_price != null ? v.absolute_price : product.base_price + v.price_modifier;
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariantId(v.id)}
                      className={`p-3.5 rounded-2xl border-2 text-left transition flex flex-col justify-between ${
                        isSelected
                          ? 'border-cravora-red bg-red-50/40 shadow-sm'
                          : 'border-stone-200 hover:border-stone-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-extrabold text-sm text-stone-900">{v.name}</span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-cravora-red text-white flex items-center justify-center">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      {v.serves_label && (
                        <span className="text-[11px] text-stone-500 mt-1">{v.serves_label}</span>
                      )}
                      <span className="text-sm font-extrabold text-cravora-red mt-2">
                        {formatPKR(vPrice)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Dynamic Customization Groups */}
          {(product.customization_groups || []).map((group) => {
            const chosenIds = selectedByGroup[group.id] || [];
            return (
              <div key={group.id} className="pt-4 border-t border-stone-200">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-stone-900">{group.name}</h3>
                    <p className="text-xs text-stone-500">
                      {group.selection_type === 'single'
                        ? group.is_required
                          ? 'Select 1 option'
                          : 'Optional • Select up to 1'
                        : `Optional • Select up to ${group.max_selections} options`}
                    </p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${
                      group.is_required
                        ? 'bg-red-50 text-cravora-red'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {group.is_required ? 'Required' : 'Optional'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {group.options.map((opt) => {
                    const isChecked = chosenIds.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          handleToggleOption(
                            group.id,
                            opt.id,
                            group.selection_type,
                            group.max_selections
                          )
                        }
                        className={`p-3.5 rounded-2xl border-2 text-left transition flex items-center justify-between gap-3 ${
                          isChecked
                            ? 'border-cravora-red bg-red-50/40'
                            : 'border-stone-200 hover:border-stone-300 bg-white'
                        }`}
                      >
                        <div>
                          <div className="text-sm font-bold text-stone-900">{opt.name}</div>
                          {opt.description && (
                            <div className="text-xs text-stone-500 mt-0.5">{opt.description}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs font-extrabold text-stone-800">
                            {opt.price > 0 ? `+${formatPKR(opt.price)}` : 'Included'}
                          </span>
                          <span
                            className={`w-5 h-5 rounded-md flex items-center justify-center border ${
                              isChecked
                                ? 'bg-cravora-red border-cravora-red text-white'
                                : 'border-stone-300 bg-white'
                            }`}
                          >
                            {isChecked && <Check className="w-3.5 h-3.5" />}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* 3. Optional Half & Half Pizza Flavor Selector */}
          {isPizza && product.related_products && product.related_products.length > 0 && (
            <div className="pt-4 border-t border-stone-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cravora-orange" />
                  <div>
                    <h3 className="text-sm font-extrabold text-stone-900">
                      Make It Half & Half (Two Flavors in One Pizza)
                    </h3>
                    <p className="text-xs text-stone-500">
                      Split your pizza with a second artisan flavor (+Rs. 150)
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={enableHalfAndHalf}
                  onChange={(e) => {
                    setEnableHalfAndHalf(e.target.checked);
                    if (e.target.checked && product.related_products?.length) {
                      setHalfPizzaId(product.related_products[0].id);
                    }
                  }}
                  className="w-5 h-5 accent-cravora-red rounded cursor-pointer"
                />
              </div>

              {enableHalfAndHalf && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {product.related_products.map((rp) => (
                    <button
                      key={rp.id}
                      type="button"
                      onClick={() => setHalfPizzaId(rp.id)}
                      className={`p-3 rounded-xl border text-left flex items-center gap-3 transition ${
                        halfPizzaId === rp.id
                          ? 'border-cravora-red bg-red-50/40'
                          : 'border-stone-200 bg-stone-50'
                      }`}
                    >
                      <img src={rp.image_url} alt={rp.name} className="w-11 h-11 rounded-lg object-cover" />
                      <div className="text-xs">
                        <div className="font-bold text-stone-900">Half {rp.name}</div>
                        <div className="text-stone-500">+Rs. 150 split flavor</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 4. Special Instructions */}
          <div className="pt-4 border-t border-stone-200">
            <label className="block text-sm font-extrabold text-stone-900 mb-1.5">
              Special Kitchen Instructions (Optional)
            </label>
            <input
              type="text"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="e.g. Well-done crust, cut into 8 slices, light jalapeños..."
              className="w-full px-4 py-2.5 rounded-xl border border-stone-300 text-sm focus:border-cravora-red focus:outline-none"
            />
          </div>

          {/* 5. Recommended Sides Quick-Add */}
          {product.recommended_sides && product.recommended_sides.length > 0 && (
            <div className="pt-4 border-t border-stone-200">
              <h3 className="text-sm font-extrabold text-stone-900 mb-2.5">
                Pairs Best With (1-Click Add to Order)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {product.recommended_sides.slice(0, 4).map((side) => (
                  <div
                    key={side.id}
                    className="p-2.5 rounded-2xl border border-stone-200 bg-stone-50 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={side.image_url}
                        alt={side.name}
                        className="w-12 h-12 rounded-xl object-cover shrink-0"
                      />
                      <div>
                        <div className="text-xs font-bold text-stone-900 line-clamp-1">{side.name}</div>
                        <div className="text-xs font-extrabold text-cravora-red">
                          {formatPKR(side.base_price)}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        addToCart({
                          product_id: side.id,
                          product_name: side.name,
                          product_image: side.image_url,
                          variant_id: null,
                          variant_name: null,
                          selected_option_ids: [],
                          selected_option_labels: [],
                          quantity: 1,
                          unit_price_preview: side.base_price,
                        })
                      }
                      className="px-3 py-1.5 rounded-xl bg-white border border-stone-300 hover:border-cravora-red hover:text-cravora-red text-xs font-bold transition"
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. Live Price Breakdown Summary Box */}
          <div className="p-4 rounded-2xl bg-cravora-cream border border-stone-200 space-y-1.5 text-xs">
            <div className="font-extrabold text-stone-800 uppercase tracking-wider text-[11px]">
              Server-Validated Item Price Breakdown
            </div>
            <div className="flex justify-between text-stone-600">
              <span>Base Size / Portion Price:</span>
              <span className="font-bold text-stone-900">{formatPKR(priceBreakdown.baseUnit)}</span>
            </div>
            {priceBreakdown.optionsTotal > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>Selected Customizations & Upgrades:</span>
                <span className="font-bold text-stone-900">+{formatPKR(priceBreakdown.optionsTotal)}</span>
              </div>
            )}
            {priceBreakdown.halfCharge > 0 && (
              <div className="flex justify-between text-stone-600">
                <span>Half & Half Split Flavor:</span>
                <span className="font-bold text-stone-900">+{formatPKR(priceBreakdown.halfCharge)}</span>
              </div>
            )}
            <div className="flex justify-between text-stone-900 font-extrabold text-sm pt-1.5 border-t border-stone-200">
              <span>Total for {quantity} Item(s):</span>
              <span className="text-cravora-red">{formatPKR(priceBreakdown.lineTotal)}</span>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Action Bar */}
        <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center rounded-2xl border border-stone-300 bg-white p-1">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-9 h-9 rounded-xl hover:bg-stone-100 flex items-center justify-center text-stone-700"
              aria-label="Decrease quantity"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-10 text-center font-extrabold text-sm text-stone-900">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(25, q + 1))}
              className="w-9 h-9 rounded-xl hover:bg-stone-100 flex items-center justify-center text-stone-700"
              aria-label="Increase quantity"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleAddCustomizedToCart}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-3 px-8 py-3.5 rounded-2xl bg-cravora-red hover:bg-cravora-redDark text-white font-extrabold text-sm shadow-glow transition"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Add to Craving Bag • {formatPKR(priceBreakdown.lineTotal)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
