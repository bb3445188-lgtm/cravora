import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Compass,
  MapPin,
  Navigation,
  Search,
  Store,
  Truck,
  AlertTriangle,
  X,
  BookmarkPlus,
} from 'lucide-react';
import { apiFetch, formatPKR } from '../api/client';
import { useStore } from '../context/StoreContext';
import { InteractiveMap } from './InteractiveMap';

interface SearchSuggestion {
  display_name: string;
  area: string;
  city: string;
  latitude: number;
  longitude: number;
}

export const LocationModal: React.FC = () => {
  const {
    isLocationModalOpen,
    setIsLocationModalOpen,
    fulfillmentType,
    setFulfillmentType,
    branches,
    selectedBranch,
    setSelectedBranch,
    deliveryLocation,
    updateDeliveryLocation,
    user,
    refreshUser,
    addToast,
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const [lat, setLat] = useState(deliveryLocation.latitude);
  const [lng, setLng] = useState(deliveryLocation.longitude);
  const [houseNumber, setHouseNumber] = useState(deliveryLocation.house_number);
  const [street, setStreet] = useState(deliveryLocation.street);
  const [area, setArea] = useState(deliveryLocation.area);
  const [city, setCity] = useState(deliveryLocation.city);
  const [landmark, setLandmark] = useState(deliveryLocation.landmark);
  const [instructions, setInstructions] = useState(deliveryLocation.delivery_instructions);
  const [formattedAddr, setFormattedAddr] = useState(deliveryLocation.formatted_address);
  const [addressLabel, setAddressLabel] = useState('Home');
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  useEffect(() => {
    if (isLocationModalOpen) {
      setLat(deliveryLocation.latitude);
      setLng(deliveryLocation.longitude);
      setHouseNumber(deliveryLocation.house_number);
      setStreet(deliveryLocation.street);
      setArea(deliveryLocation.area);
      setCity(deliveryLocation.city);
      setLandmark(deliveryLocation.landmark);
      setInstructions(deliveryLocation.delivery_instructions);
      setFormattedAddr(deliveryLocation.formatted_address);
    }
  }, [isLocationModalOpen, deliveryLocation]);

  useEffect(() => {
    if (!isLocationModalOpen) return;
    const timer = setTimeout(() => {
      setIsSearching(true);
      apiFetch<SearchSuggestion[]>(`/api/maps/geocode/search?q=${encodeURIComponent(searchQuery)}`)
        .then((res) => setSuggestions(res))
        .catch(() => {})
        .finally(() => setIsSearching(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [searchQuery, isLocationModalOpen]);

  if (!isLocationModalOpen) return null;

  const handlePinMove = async (newLat: number, newLng: number) => {
    setLat(newLat);
    setLng(newLng);
    try {
      const rev = await apiFetch<{
        formatted_address: string;
        area: string;
        city: string;
      }>(`/api/maps/geocode/reverse?lat=${newLat}&lng=${newLng}`);
      setFormattedAddr(rev.formatted_address);
      setArea(rev.area);
      setCity(rev.city);
      await updateDeliveryLocation(
        {
          latitude: newLat,
          longitude: newLng,
          formatted_address: rev.formatted_address,
          area: rev.area,
          city: rev.city,
        },
        true
      );
    } catch {
      await updateDeliveryLocation({ latitude: newLat, longitude: newLng }, true);
    }
  };

  const handleSelectSuggestion = async (s: SearchSuggestion) => {
    setLat(s.latitude);
    setLng(s.longitude);
    setArea(s.area);
    setCity(s.city);
    setFormattedAddr(s.display_name);
    setSearchQuery('');
    await updateDeliveryLocation(
      {
        latitude: s.latitude,
        longitude: s.longitude,
        area: s.area,
        city: s.city,
        formatted_address: s.display_name,
      },
      true
    );
  };

  const handleDetectCurrentLocation = () => {
    if (!navigator.geolocation) {
      addToast(
        'Geolocation Unavailable',
        'Your browser does not support automatic location detection. You can search or move the map pin manually.',
        'info'
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handlePinMove(
          Number(pos.coords.latitude.toFixed(5)),
          Number(pos.coords.longitude.toFixed(5))
        );
        addToast('Location Detected', 'Map pin moved to your current coordinates.', 'success');
      },
      () => {
        addToast(
          'Location Permission Denied',
          'No problem! Please select your area below or drag the pin on the map.',
          'info'
        );
      },
      { timeout: 6000 }
    );
  };

  const handleConfirmDeliveryLocation = async () => {
    const cov = await updateDeliveryLocation(
      {
        latitude: lat,
        longitude: lng,
        house_number: houseNumber || 'House 1',
        street: street || 'Main Street',
        area: area || 'F-7 Markaz',
        city: city || 'Islamabad',
        landmark,
        delivery_instructions: instructions,
        formatted_address:
          formattedAddr || `${houseNumber}, ${street}, ${area}, ${city}`,
      },
      true
    );
    if (cov && !cov.deliverable) {
      addToast(
        'Outside Delivery Coverage Zone',
        'Please move the pin inside an active city zone or switch to Branch Pickup.',
        'error'
      );
      return;
    }
    addToast(
      'Delivery Location Confirmed',
      `Delivering from ${cov?.matched_branch?.name || selectedBranch?.name}`,
      'success'
    );
    setIsLocationModalOpen(false);
  };

  const handleSaveAddressToAccount = async () => {
    if (!user) return;
    setIsSavingAddress(true);
    try {
      await apiFetch('/api/auth/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: addressLabel || 'Home',
          recipient_name: user.full_name,
          phone: user.phone,
          house_number: houseNumber || 'House 1',
          street: street || 'Main Street',
          area: area || 'F-7 Markaz',
          city: city || 'Islamabad',
          landmark,
          delivery_instructions: instructions,
          latitude: lat,
          longitude: lng,
          formatted_address: `${houseNumber}, ${street}, ${area}, ${city}`,
          is_default: true,
        }),
      });
      await refreshUser();
      addToast('Address Saved', `Saved "${addressLabel}" to your account address book.`, 'success');
    } catch (err: any) {
      addToast('Could Not Save Address', err.message, 'error');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const cov = deliveryLocation.coverage;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="location-modal-title"
    >
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Top Header */}
        <div className="px-6 py-4 bg-cravora-charcoal text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cravora-red flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 id="location-modal-title" className="text-lg font-extrabold tracking-tight">
                Select Order Fulfillment & Coverage Zone
              </h2>
              <p className="text-xs text-stone-300">
                Real-time delivery polygon validation & branch distance calculator
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsLocationModalOpen(false)}
            className="p-2 rounded-full hover:bg-white/10 text-stone-300 hover:text-white transition"
            aria-label="Close location modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Fulfillment Toggle */}
        <div className="px-6 pt-4 pb-3 bg-cravora-cream border-b border-stone-200 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-2xl bg-stone-200/80 p-1">
            <button
              type="button"
              onClick={() => setFulfillmentType('delivery')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${
                fulfillmentType === 'delivery'
                  ? 'bg-cravora-red text-white shadow-sm'
                  : 'text-stone-700 hover:text-stone-900'
              }`}
            >
              <Truck className="w-4 h-4" />
              Home Delivery
            </button>
            <button
              type="button"
              onClick={() => setFulfillmentType('pickup')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition ${
                fulfillmentType === 'pickup'
                  ? 'bg-cravora-red text-white shadow-sm'
                  : 'text-stone-700 hover:text-stone-900'
              }`}
            >
              <Store className="w-4 h-4" />
              Branch Self-Pickup (15% OFF with PICKUP15)
            </button>
          </div>

          {fulfillmentType === 'delivery' && (
            <button
              type="button"
              onClick={handleDetectCurrentLocation}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-stone-300 text-xs font-bold text-cravora-charcoal hover:border-cravora-red hover:text-cravora-red transition"
            >
              <Compass className="w-4 h-4 text-cravora-red" />
              Detect My GPS Location
            </button>
          )}
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {fulfillmentType === 'delivery' ? (
            <>
              {/* Saved Addresses for Logged-in Users */}
              {user && user.addresses && user.addresses.length > 0 && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
                    Your Saved Delivery Addresses
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {user.addresses.map((addr) => (
                      <button
                        key={addr.id}
                        type="button"
                        onClick={() => {
                          setHouseNumber(addr.house_number);
                          setStreet(addr.street);
                          setArea(addr.area);
                          setCity(addr.city);
                          setLandmark(addr.landmark || '');
                          setInstructions(addr.delivery_instructions || '');
                          handlePinMove(addr.latitude, addr.longitude);
                        }}
                        className="px-3.5 py-2 rounded-xl border border-stone-200 bg-stone-50 hover:border-cravora-red hover:bg-red-50/40 text-left transition"
                      >
                        <div className="text-xs font-extrabold text-cravora-charcoal flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-cravora-red" />
                          {addr.label} — {addr.area}, {addr.city}
                        </div>
                        <div className="text-[11px] text-stone-500 truncate max-w-xs">
                          {addr.formatted_address}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Bar & Quick Area Presets */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                <div className="lg:col-span-6 space-y-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                      Search Pakistani Sector, Area, or Landmark
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Try 'F-7 Markaz', 'I-8', 'Saddar', 'Gulberg', 'Clifton', or 'Taxila'..."
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-stone-300 text-sm focus:border-cravora-red focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Quick Suggestions List */}
                  <div className="bg-stone-50 rounded-2xl p-2.5 border border-stone-200 max-h-48 overflow-y-auto space-y-1">
                    <div className="text-[11px] font-bold text-stone-400 px-2 pb-1">
                      {isSearching ? 'Searching locations...' : 'Verified Areas & Test Coordinates (Click to Pin)'}
                    </div>
                    {suggestions.map((s, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectSuggestion(s)}
                        className="w-full text-left px-3 py-2 rounded-xl hover:bg-white hover:shadow-sm flex items-start gap-2.5 transition group"
                      >
                        <Navigation className="w-4 h-4 text-cravora-red mt-0.5 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-stone-800 group-hover:text-cravora-red">
                            {s.display_name}
                          </div>
                          <div className="text-[11px] text-stone-500">
                            {s.area}, {s.city} ({s.latitude.toFixed(4)}, {s.longitude.toFixed(4)})
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Coverage Validation Result Card */}
                  {cov && (
                    <div
                      className={`p-4 rounded-2xl border ${
                        cov.deliverable
                          ? 'bg-emerald-50/90 border-emerald-200 text-emerald-950'
                          : 'bg-amber-50 border-amber-300 text-amber-950'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {cov.deliverable ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                        )}
                        <div className="space-y-1 text-xs">
                          <div className="font-extrabold text-sm">
                            {cov.deliverable
                              ? `Covered by ${cov.matched_branch?.name}`
                              : 'Address Outside Delivery Coverage Zone'}
                          </div>
                          <p className="leading-relaxed">{cov.message}</p>
                          {cov.deliverable && (
                            <div className="pt-1.5 flex flex-wrap gap-2 text-[11px] font-bold">
                              <span className="px-2.5 py-1 rounded-full bg-white border border-emerald-200">
                                Delivery Fee: {formatPKR(cov.delivery_fee)} ({cov.delivery_fee_breakdown})
                              </span>
                              <span className="px-2.5 py-1 rounded-full bg-white border border-emerald-200">
                                Min Order: {formatPKR(cov.min_order_amount)}
                              </span>
                              {cov.estimated_delivery_mins && (
                                <span className="px-2.5 py-1 rounded-full bg-white border border-emerald-200">
                                  Est. {cov.estimated_delivery_mins} mins
                                </span>
                              )}
                            </div>
                          )}
                          {!cov.deliverable && cov.nearest_pickup_branch && (
                            <div className="pt-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setFulfillmentType('pickup');
                                  setSelectedBranch(cov.nearest_pickup_branch!);
                                }}
                                className="px-3.5 py-1.5 rounded-xl bg-cravora-charcoal text-white font-bold text-xs hover:bg-cravora-red transition"
                              >
                                Switch to Pickup at {cov.nearest_pickup_branch.name}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Interactive Map Column */}
                <div className="lg:col-span-6">
                  <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 mb-1.5">
                    Interactive Map — Click or Drag Pin to Your Building Entrance
                  </label>
                  <InteractiveMap
                    centerLat={lat}
                    centerLng={lng}
                    zoom={13}
                    branches={branches}
                    showDeliveryZones={true}
                    interactivePin={true}
                    onSelectCoordinates={handlePinMove}
                    heightClass="h-80"
                  />
                </div>
              </div>

              {/* Detailed Pakistani Address Input Form */}
              <div className="pt-2 border-t border-stone-200">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-stone-600 mb-3">
                  Complete Delivery Address Details
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      House / Flat / Plot No. *
                    </label>
                    <input
                      type="text"
                      value={houseNumber}
                      onChange={(e) => setHouseNumber(e.target.value)}
                      placeholder="e.g. House 14-B"
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Street / Block / Road *
                    </label>
                    <input
                      type="text"
                      value={street}
                      onChange={(e) => setStreet(e.target.value)}
                      placeholder="e.g. Street 28"
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Sector / Area *
                    </label>
                    <input
                      type="text"
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      placeholder="e.g. F-7/2"
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      City *
                    </label>
                    <input
                      type="text"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      placeholder="Islamabad"
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Nearest Landmark (Optional)
                    </label>
                    <input
                      type="text"
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      placeholder="e.g. Opposite Jinnah Super Park"
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1">
                      Rider Instructions (Optional)
                    </label>
                    <input
                      type="text"
                      value={instructions}
                      onChange={(e) => setInstructions(e.target.value)}
                      placeholder="e.g. Ring bell twice"
                      className="w-full px-3.5 py-2 rounded-xl border border-stone-300 text-sm"
                    />
                  </div>
                </div>

                {user && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={addressLabel}
                      onChange={(e) => setAddressLabel(e.target.value)}
                      placeholder="Label (Home, Office)"
                      className="w-36 px-3 py-1.5 rounded-xl border border-stone-300 text-xs"
                    />
                    <button
                      type="button"
                      disabled={isSavingAddress}
                      onClick={handleSaveAddressToAccount}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-xs font-bold text-stone-800 transition"
                    >
                      <BookmarkPlus className="w-3.5 h-3.5 text-cravora-red" />
                      {isSavingAddress ? 'Saving...' : 'Save to My Address Book'}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Pickup Branch Selection */
            <div className="space-y-4">
              <p className="text-sm text-stone-600">
                Choose an operating Cravora branch for self-pickup. Use code{' '}
                <span className="font-extrabold text-cravora-red">PICKUP15</span> at checkout for 15% OFF!
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {branches.map((branch) => {
                  const isSelected = selectedBranch?.id === branch.id;
                  return (
                    <div
                      key={branch.id}
                      onClick={() => setSelectedBranch(branch)}
                      className={`cursor-pointer p-4 rounded-2xl border-2 transition ${
                        isSelected
                          ? 'border-cravora-red bg-red-50/40 shadow-sm'
                          : 'border-stone-200 hover:border-stone-300 bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded-md bg-cravora-charcoal text-white text-[10px] font-bold uppercase mb-1">
                            {branch.city}
                          </span>
                          <h4 className="font-extrabold text-stone-900 text-sm">{branch.name}</h4>
                        </div>
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-cravora-red shrink-0" />}
                      </div>
                      <p className="text-xs text-stone-600 mt-1">{branch.address}</p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-stone-700">
                        <span>Hours: {branch.opening_time} – {branch.closing_time}</span>
                        <span>Prep Time: ~{branch.prep_time_mins} mins</span>
                        <span>Tel: {branch.phone}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-stone-50 border-t border-stone-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsLocationModalOpen(false)}
            className="px-5 py-2.5 rounded-xl border border-stone-300 text-sm font-bold text-stone-700 hover:bg-stone-100 transition"
          >
            Cancel
          </button>

          {fulfillmentType === 'delivery' ? (
            <button
              type="button"
              onClick={handleConfirmDeliveryLocation}
              className="px-6 py-2.5 rounded-xl bg-cravora-red hover:bg-cravora-redDark text-white text-sm font-extrabold shadow-glow transition"
            >
              Confirm Delivery Location & Zone
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                addToast(
                  'Pickup Branch Selected',
                  `Ready for pickup at ${selectedBranch?.name}`,
                  'success'
                );
                setIsLocationModalOpen(false);
              }}
              className="px-6 py-2.5 rounded-xl bg-cravora-red hover:bg-cravora-redDark text-white text-sm font-extrabold shadow-glow transition"
            >
              Confirm Pickup at {selectedBranch?.name || 'Selected Branch'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
