import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  Search,
  Store,
  Truck,
  Utensils,
} from 'lucide-react';
import { apiFetch, formatPKR } from '../api/client';
import { InteractiveMap } from '../components/InteractiveMap';
import { useStore } from '../context/StoreContext';
import { Branch } from '../types';

export const BranchesPage: React.FC = () => {
  const {
    deliveryLocation,
    selectedBranch,
    setSelectedBranch,
    setFulfillmentType,
    updateDeliveryLocation,
    addToast,
  } = useStore();

  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: deliveryLocation.latitude,
    lng: deliveryLocation.longitude,
  });

  useEffect(() => {
    apiFetch<Branch[]>(
      `/api/branches?lat=${deliveryLocation.latitude}&lng=${deliveryLocation.longitude}`
    )
      .then((res) => setBranches(res))
      .catch(() => {});
  }, [deliveryLocation.latitude, deliveryLocation.longitude]);

  const cities = ['all', 'Islamabad', 'Rawalpindi', 'Lahore', 'Karachi'];

  const filteredBranches = useMemo(() => {
    return branches.filter((b) => {
      const cityMatch =
        selectedCity === 'all' || b.city.toLowerCase() === selectedCity.toLowerCase();
      const searchMatch =
        !searchQuery.trim() ||
        b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.address.toLowerCase().includes(searchQuery.toLowerCase());
      return cityMatch && searchMatch;
    });
  }, [branches, selectedCity, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="bg-cravora-charcoal text-white rounded-3xl p-6 sm:p-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div>
          <span className="text-xs font-extrabold uppercase tracking-wider text-cravora-orange">
            Interactive Outlet & Delivery Zone Explorer
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-black mt-1">
            Find a Cravora Branch Near You
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 mt-1 max-w-2xl">
            Click anywhere on the map to test delivery coverage or select an outlet for Express Self-Pickup.
          </p>
        </div>

        {/* City Filter Pills */}
        <div className="flex flex-wrap gap-2">
          {cities.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                setSelectedCity(c);
                const firstInCity = branches.find(
                  (b) => c === 'all' || b.city.toLowerCase() === c.toLowerCase()
                );
                if (firstInCity) {
                  setMapCenter({ lat: firstInCity.latitude, lng: firstInCity.longitude });
                }
              }}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold capitalize transition ${
                selectedCity === c
                  ? 'bg-cravora-red text-white shadow-glow'
                  : 'bg-white/10 text-stone-200 hover:bg-white/20'
              }`}
            >
              {c === 'all' ? 'All Cities (6)' : c}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Map + Coverage Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 space-y-3">
          <InteractiveMap
            centerLat={mapCenter.lat}
            centerLng={mapCenter.lng}
            zoom={12}
            branches={filteredBranches}
            showDeliveryZones={true}
            interactivePin={true}
            onSelectCoordinates={(lat, lng) => {
              setMapCenter({ lat, lng });
              updateDeliveryLocation({ latitude: lat, longitude: lng }, true);
            }}
            heightClass="h-[460px]"
          />

          {deliveryLocation.coverage && (
            <div
              className={`p-4 rounded-2xl border text-xs ${
                deliveryLocation.coverage.deliverable
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-amber-50 border-amber-300 text-amber-950'
              }`}
            >
              <div className="font-extrabold text-sm">
                {deliveryLocation.coverage.deliverable
                  ? `✓ Pinned Location Deliverable by ${deliveryLocation.coverage.matched_branch?.name}`
                  : 'Pinned Location Outside Delivery Zone'}
              </div>
              <p className="mt-0.5">{deliveryLocation.coverage.message}</p>
              {deliveryLocation.coverage.deliverable && (
                <div className="mt-1.5 font-bold">
                  Fee Formula: {deliveryLocation.coverage.delivery_fee_breakdown} • Min Order:{' '}
                  {formatPKR(deliveryLocation.coverage.min_order_amount)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Branch Cards List */}
        <div className="lg:col-span-5 space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search branch by area, sector, or road..."
              className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-stone-300 bg-white text-xs font-semibold focus:border-cravora-red focus:outline-none"
            />
          </div>

          <div className="space-y-3.5 max-h-[460px] overflow-y-auto pr-1">
            {filteredBranches.map((b) => {
              const isSelected = selectedBranch?.id === b.id;
              return (
                <div
                  key={b.id}
                  onClick={() => setMapCenter({ lat: b.latitude, lng: b.longitude })}
                  className={`cursor-pointer p-5 rounded-3xl border-2 bg-white shadow-sm transition space-y-3 ${
                    isSelected
                      ? 'border-cravora-red bg-red-50/20'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded bg-cravora-charcoal text-white text-[10px] font-extrabold uppercase">
                          {b.city}
                        </span>
                        {b.distance_km != null && (
                          <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 text-[10px] font-bold">
                            {b.distance_km} km from your pin
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-extrabold text-stone-900">{b.name}</h3>
                    </div>
                    {isSelected && <CheckCircle2 className="w-5 h-5 text-cravora-red shrink-0" />}
                  </div>

                  <p className="text-xs text-stone-600 flex items-start gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-cravora-red shrink-0 mt-0.5" />
                    <span>{b.address}</span>
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-stone-700">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-cravora-orange" />
                      {b.opening_time} – {b.closing_time}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-cravora-red" />
                      {b.phone}
                    </span>
                  </div>

                  {/* Service Badges */}
                  <div className="flex flex-wrap gap-1.5 text-[10px] font-extrabold">
                    {b.supports_delivery && (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 inline-flex items-center gap-1">
                        <Truck className="w-3 h-3" /> Delivery (~{b.delivery_time_mins}m)
                      </span>
                    )}
                    {b.supports_pickup && (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-900 inline-flex items-center gap-1">
                        <Store className="w-3 h-3" /> Pickup (~{b.prep_time_mins}m)
                      </span>
                    )}
                    {b.supports_dine_in && (
                      <span className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 inline-flex items-center gap-1">
                        <Utensils className="w-3 h-3" /> Dine-In Lounge
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between gap-2">
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${b.latitude},${b.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs font-extrabold text-stone-600 hover:text-cravora-red"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Get Directions</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBranch(b);
                        setFulfillmentType('pickup');
                        addToast(
                          `Selected ${b.name}`,
                          'Fulfillment set to Branch Pickup. Ordering menu ready!',
                          'success'
                        );
                        navigate('/menu');
                      }}
                      className="px-4 py-2 rounded-xl bg-cravora-red hover:bg-cravora-redDark text-white text-xs font-extrabold transition"
                    >
                      Order Pickup Here
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
