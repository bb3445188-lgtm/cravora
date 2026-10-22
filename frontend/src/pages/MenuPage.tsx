import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Flame,
  Leaf,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
} from 'lucide-react';
import { apiFetch, formatPKR } from '../api/client';
import { ProductCard } from '../components/ProductCard';
import { Category, Product } from '../types';

export const MenuPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCat = searchParams.get('category') || 'all';
  const initialBest = searchParams.get('bestseller') === 'true';

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState<string>(initialCat);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<number>(5000);
  const [sortBy, setSortBy] = useState<'popular' | 'price_asc' | 'price_desc' | 'newest'>('popular');
  const [bestsellerOnly, setBestsellerOnly] = useState<boolean>(initialBest);
  const [vegetarianOnly, setVegetarianOnly] = useState<boolean>(false);
  const [spicyOnly, setSpicyOnly] = useState<boolean>(false);

  useEffect(() => {
    const catParam = searchParams.get('category');
    if (catParam) setSelectedCategory(catParam);
  }, [searchParams]);

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      apiFetch<Category[]>('/api/menu/categories'),
      apiFetch<Product[]>('/api/menu/products'),
    ])
      .then(([cats, prods]) => {
        setCategories(cats);
        setProducts(prods);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const filteredProducts = useMemo(() => {
    let list = [...products];
    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.category_slug === selectedCategory);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.short_description.toLowerCase().includes(q) ||
          (p.category_name && p.category_name.toLowerCase().includes(q))
      );
    }
    list = list.filter((p) => p.base_price <= maxPrice);
    if (bestsellerOnly) list = list.filter((p) => p.is_bestseller);
    if (vegetarianOnly) list = list.filter((p) => p.is_vegetarian);
    if (spicyOnly) list = list.filter((p) => p.is_spicy);

    if (sortBy === 'price_asc') {
      list.sort((a, b) => a.base_price - b.base_price);
    } else if (sortBy === 'price_desc') {
      list.sort((a, b) => b.base_price - a.base_price);
    } else if (sortBy === 'newest') {
      list.sort((a, b) => (b.is_new ? 1 : 0) - (a.is_new ? 1 : 0));
    } else {
      list.sort((a, b) => b.popularity_score - a.popularity_score);
    }
    return list;
  }, [
    products,
    selectedCategory,
    searchQuery,
    maxPrice,
    sortBy,
    bestsellerOnly,
    vegetarianOnly,
    spicyOnly,
  ]);

  const handleResetFilters = () => {
    setSelectedCategory('all');
    setSearchQuery('');
    setMaxPrice(5000);
    setSortBy('popular');
    setBestsellerOnly(false);
    setVegetarianOnly(false);
    setSpicyOnly(false);
    setSearchParams({});
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-cravora-charcoal text-white rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-cravora-orange">
            <Sparkles className="w-4 h-4" /> Complete 16-Category Menu
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-black mt-1">
            Crafted for Bold Pakistani Cravings
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 mt-1 max-w-2xl">
            Every pizza, burger, wrap, pasta, and family combo is customizable with server-validated pricing.
          </p>
        </div>

        {/* Search Input */}
        <div className="w-full md:w-80 relative">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search pizzas, burgers, rolls, pasta..."
            className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white text-stone-900 text-xs font-semibold focus:outline-none"
          />
        </div>
      </div>

      {/* Horizontal Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <button
          type="button"
          onClick={() => {
            setSelectedCategory('all');
            setSearchParams({});
          }}
          className={`shrink-0 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition ${
            selectedCategory === 'all'
              ? 'bg-cravora-red text-white shadow-glow'
              : 'bg-white border border-stone-200 text-stone-700 hover:border-cravora-red'
          }`}
        >
          All Categories ({products.length})
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => {
              setSelectedCategory(cat.slug);
              setSearchParams({ category: cat.slug });
            }}
            className={`shrink-0 px-4 py-2.5 rounded-2xl text-xs font-extrabold transition flex items-center gap-2 ${
              selectedCategory === cat.slug
                ? 'bg-cravora-red text-white shadow-glow'
                : 'bg-white border border-stone-200 text-stone-700 hover:border-cravora-red'
            }`}
          >
            <img
              src={cat.image_url}
              alt={cat.name}
              className="w-5 h-5 rounded-full object-cover"
            />
            <span>{cat.name}</span>
          </button>
        ))}
      </div>

      {/* Filter & Sort Controls Bar */}
      <div className="bg-white rounded-3xl border border-stone-200 p-4 sm:p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-stone-500 flex items-center gap-1 mr-1">
            <SlidersHorizontal className="w-3.5 h-3.5 text-cravora-red" /> Filters:
          </span>

          <button
            type="button"
            onClick={() => setBestsellerOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
              bestsellerOnly
                ? 'bg-cravora-red text-white border-cravora-red'
                : 'bg-stone-50 text-stone-700 border-stone-200'
            }`}
          >
            <Star className="w-3.5 h-3.5" /> Bestsellers
          </button>

          <button
            type="button"
            onClick={() => setVegetarianOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
              vegetarianOnly
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-stone-50 text-stone-700 border-stone-200'
            }`}
          >
            <Leaf className="w-3.5 h-3.5" /> 100% Vegetarian
          </button>

          <button
            type="button"
            onClick={() => setSpicyOnly((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
              spicyOnly
                ? 'bg-orange-500 text-white border-orange-500'
                : 'bg-stone-50 text-stone-700 border-stone-200'
            }`}
          >
            <Flame className="w-3.5 h-3.5" /> Spicy Profile
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          {/* Price Range Slider */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-bold text-stone-600">
              Max Price: <strong className="text-cravora-red">{formatPKR(maxPrice)}</strong>
            </span>
            <input
              type="range"
              min={300}
              max={5000}
              step={100}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-28 accent-cravora-red cursor-pointer"
            />
          </div>

          {/* Sort Select */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 text-xs font-extrabold text-stone-800"
            aria-label="Sort menu items"
          >
            <option value="popular">Sort: Most Popular</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="newest">Newest Additions</option>
          </select>

          <button
            type="button"
            onClick={handleResetFilters}
            className="p-2 rounded-xl border border-stone-200 hover:bg-stone-100 text-stone-600 text-xs font-bold flex items-center gap-1"
            title="Reset all filters"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
        </div>
      </div>

      {/* Product Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-80 rounded-3xl bg-stone-200 animate-pulse" />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-3xl border border-stone-200 p-12 text-center space-y-3">
          <h3 className="text-lg font-extrabold text-stone-900">
            No Menu Items Match Your Current Filters
          </h3>
          <p className="text-xs text-stone-500 max-w-md mx-auto">
            Try increasing the maximum price slider or clearing your search query to see all 16 categories.
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-5 py-2.5 rounded-xl bg-cravora-red text-white text-xs font-extrabold"
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
};
