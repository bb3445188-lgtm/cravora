import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '../api/client';
import {
  Branch,
  CartCalculationResponse,
  CoverageCheckResponse,
  Product,
  SelectedCartItem,
  User,
} from '../types';

export interface DeliveryLocationState {
  latitude: number;
  longitude: number;
  formatted_address: string;
  house_number: string;
  street: string;
  area: string;
  city: string;
  landmark: string;
  delivery_instructions: string;
  coverage?: CoverageCheckResponse | null;
}

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type: 'success' | 'error' | 'info';
}

interface StoreContextValue {
  user: User | null;
  isLoadingAuth: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { email: string; phone: string; full_name: string; password: string }) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;

  fulfillmentType: 'delivery' | 'pickup';
  setFulfillmentType: (type: 'delivery' | 'pickup') => void;
  selectedBranch: Branch | null;
  setSelectedBranch: (branch: Branch | null) => void;
  branches: Branch[];
  deliveryLocation: DeliveryLocationState;
  updateDeliveryLocation: (loc: Partial<DeliveryLocationState>, validateCoverage?: boolean) => Promise<CoverageCheckResponse | null>;
  isLocationModalOpen: boolean;
  setIsLocationModalOpen: (open: boolean) => void;

  cartItems: SelectedCartItem[];
  cartSummary: CartCalculationResponse | null;
  isCalculatingCart: boolean;
  couponCode: string;
  setCouponCode: (code: string) => void;
  redeemLoyaltyPoints: number;
  setRedeemLoyaltyPoints: (pts: number) => void;
  addToCart: (item: Omit<SelectedCartItem, 'cart_item_key'>) => void;
  quickAddProduct: (product: Product) => void;
  updateCartItemQuantity: (key: string, delta: number) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
  loadProposedCartFromAI: (proposed: CartCalculationResponse) => void;

  customizingProduct: Product | null;
  openCustomizeModal: (product: Product) => void;
  closeCustomizeModal: () => void;

  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;

  isAIOpen: boolean;
  setIsAIOpen: (open: boolean) => void;
  aiPendingPrompt: string | null;
  openAIWithPrompt: (prompt?: string) => void;
  clearAIPendingPrompt: () => void;

  toasts: ToastItem[];
  addToast: (title: string, description?: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

const DEFAULT_DELIVERY_LOCATION: DeliveryLocationState = {
  latitude: 33.7215,
  longitude: 73.0571,
  formatted_address: 'Jinnah Super Market, F-7 Markaz, Islamabad',
  house_number: 'House 14-B',
  street: 'Street 28',
  area: 'F-7 Markaz',
  city: 'Islamabad',
  landmark: 'Near Jinnah Super Gol Market',
  delivery_instructions: '',
  coverage: null,
};

const StoreContext = createContext<StoreContextValue | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState<boolean>(true);

  const [fulfillmentType, setFulfillmentTypeState] = useState<'delivery' | 'pickup'>(() => {
    return (localStorage.getItem('cravora_fulfillment') as 'delivery' | 'pickup') || 'delivery';
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [deliveryLocation, setDeliveryLocation] = useState<DeliveryLocationState>(() => {
    try {
      const saved = localStorage.getItem('cravora_location');
      return saved ? { ...DEFAULT_DELIVERY_LOCATION, ...JSON.parse(saved) } : DEFAULT_DELIVERY_LOCATION;
    } catch {
      return DEFAULT_DELIVERY_LOCATION;
    }
  });
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);

  const [cartItems, setCartItems] = useState<SelectedCartItem[]>(() => {
    try {
      const saved = localStorage.getItem('cravora_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [couponCode, setCouponCode] = useState<string>(() => {
    return localStorage.getItem('cravora_coupon') || '';
  });
  const [redeemLoyaltyPoints, setRedeemLoyaltyPoints] = useState<number>(0);
  const [cartSummary, setCartSummary] = useState<CartCalculationResponse | null>(null);
  const [isCalculatingCart, setIsCalculatingCart] = useState<boolean>(false);

  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isAIOpen, setIsAIOpen] = useState<boolean>(false);
  const [aiPendingPrompt, setAiPendingPrompt] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback(
    (title: string, description?: string, type: 'success' | 'error' | 'info' = 'success') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, title, description, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4200);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setIsLoadingAuth(false);
      return;
    }
    try {
      const me = await apiFetch<User>('/api/auth/me');
      setUser(me);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Load branches and initial coverage check
  useEffect(() => {
    apiFetch<Branch[]>('/api/branches')
      .then((list) => {
        setBranches(list);
        if (list.length > 0 && !selectedBranch) {
          setSelectedBranch(list[0]);
        }
      })
      .catch(() => {});
  }, []);

  const updateDeliveryLocation = useCallback(
    async (
      partial: Partial<DeliveryLocationState>,
      validateCoverage: boolean = true
    ): Promise<CoverageCheckResponse | null> => {
      const merged: DeliveryLocationState = {
        ...deliveryLocation,
        ...partial,
      };
      if (validateCoverage) {
        try {
          const cov = await apiFetch<CoverageCheckResponse>('/api/maps/check-coverage', {
            method: 'POST',
            body: JSON.stringify({
              latitude: merged.latitude,
              longitude: merged.longitude,
              subtotal: cartSummary?.subtotal || 1500,
            }),
          });
          merged.coverage = cov;
          if (cov.deliverable && cov.matched_branch) {
            setSelectedBranch(cov.matched_branch);
          }
          setDeliveryLocation(merged);
          localStorage.setItem('cravora_location', JSON.stringify(merged));
          return cov;
        } catch {
          setDeliveryLocation(merged);
          localStorage.setItem('cravora_location', JSON.stringify(merged));
          return null;
        }
      } else {
        setDeliveryLocation(merged);
        localStorage.setItem('cravora_location', JSON.stringify(merged));
        return merged.coverage || null;
      }
    },
    [deliveryLocation, cartSummary?.subtotal]
  );

  // Validate default coordinates on initial mount
  useEffect(() => {
    if (!deliveryLocation.coverage) {
      updateDeliveryLocation({}, true);
    }
  }, []);

  const setFulfillmentType = useCallback((type: 'delivery' | 'pickup') => {
    setFulfillmentTypeState(type);
    localStorage.setItem('cravora_fulfillment', type);
  }, []);

  // Persist cart items & recalculate on server whenever cart, fulfillment, location, or coupon changes
  useEffect(() => {
    localStorage.setItem('cravora_cart', JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    localStorage.setItem('cravora_coupon', couponCode);
  }, [couponCode]);

  useEffect(() => {
    if (cartItems.length === 0) {
      setCartSummary(null);
      return;
    }
    let cancelled = false;
    setIsCalculatingCart(true);

    apiFetch<CartCalculationResponse>('/api/cart/calculate', {
      method: 'POST',
      body: JSON.stringify({
        items: cartItems.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id || null,
          selected_option_ids: i.selected_option_ids,
          half_and_half_product_id: i.half_and_half_product_id || null,
          quantity: i.quantity,
          special_instructions: i.special_instructions || null,
        })),
        fulfillment_type: fulfillmentType,
        branch_id: selectedBranch?.id || null,
        delivery_lat: fulfillmentType === 'delivery' ? deliveryLocation.latitude : null,
        delivery_lng: fulfillmentType === 'delivery' ? deliveryLocation.longitude : null,
        coupon_code: couponCode.trim() || null,
        redeem_loyalty_points: redeemLoyaltyPoints,
      }),
    })
      .then((res) => {
        if (!cancelled) {
          setCartSummary(res);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Cart calculation error:', err);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsCalculatingCart(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    cartItems,
    fulfillmentType,
    selectedBranch?.id,
    deliveryLocation.latitude,
    deliveryLocation.longitude,
    couponCode,
    redeemLoyaltyPoints,
  ]);

  const addToCart = useCallback(
    (item: Omit<SelectedCartItem, 'cart_item_key'>) => {
      const sortedOpts = [...item.selected_option_ids].sort((a, b) => a - b).join('-');
      const key = `${item.product_id}_v${item.variant_id || 0}_o${sortedOpts}_h${item.half_and_half_product_id || 0}`;

      setCartItems((prev) => {
        const existingIdx = prev.findIndex((x) => x.cart_item_key === key);
        if (existingIdx > -1) {
          const updated = [...prev];
          updated[existingIdx] = {
            ...updated[existingIdx],
            quantity: updated[existingIdx].quantity + item.quantity,
          };
          return updated;
        }
        return [...prev, { ...item, cart_item_key: key }];
      });

      addToast(
        `Added ${item.product_name}`,
        item.variant_name
          ? `${item.variant_name} • Qty ${item.quantity} added to your craving bag.`
          : `Qty ${item.quantity} added to your craving bag.`,
        'success'
      );
    },
    [addToast]
  );

  const quickAddProduct = useCallback(
    (product: Product) => {
      if (product.variants.length > 0 || product.customization_groups.length > 0) {
        setCustomizingProduct(product);
        return;
      }
      addToCart({
        product_id: product.id,
        product_name: product.name,
        product_image: product.image_url,
        variant_id: null,
        variant_name: null,
        selected_option_ids: [],
        selected_option_labels: [],
        quantity: 1,
        unit_price_preview: product.base_price,
      });
    },
    [addToCart]
  );

  const updateCartItemQuantity = useCallback((key: string, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item) =>
          item.cart_item_key === key
            ? { ...item, quantity: item.quantity + delta }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }, []);

  const removeFromCart = useCallback((key: string) => {
    setCartItems((prev) => prev.filter((item) => item.cart_item_key !== key));
  }, []);

  const clearCart = useCallback(() => {
    setCartItems([]);
    setCouponCode('');
    setRedeemLoyaltyPoints(0);
    setCartSummary(null);
    localStorage.removeItem('cravora_cart');
  }, []);

  const loadProposedCartFromAI = useCallback(
    (proposed: CartCalculationResponse) => {
      const converted: SelectedCartItem[] = proposed.items.map((vItem) => {
        const optIds = vItem.options.filter((o) => o.option_id > 0).map((o) => o.option_id);
        const optLabels = vItem.options.map((o) => o.option_name);
        const key = `${vItem.product_id}_v${vItem.variant_id || 0}_o${optIds.join('-')}`;
        return {
          cart_item_key: key,
          product_id: vItem.product_id,
          product_name: vItem.product_name,
          product_image: vItem.product_image,
          variant_id: vItem.variant_id || null,
          variant_name: vItem.variant_name || null,
          selected_option_ids: optIds,
          selected_option_labels: optLabels,
          quantity: vItem.quantity,
          unit_price_preview: vItem.unit_price,
          special_instructions: vItem.special_instructions || undefined,
        };
      });
      setCartItems(converted);
      if (proposed.coupon_code && proposed.coupon_valid) {
        setCouponCode(proposed.coupon_code);
      }
      setIsAIOpen(false);
      setIsCartOpen(true);
      addToast(
        'AI Proposed Cart Loaded!',
        'Review your customized items in the cart drawer and proceed to checkout.',
        'success'
      );
    },
    [addToast]
  );

  const login = useCallback(
    async (email: string, password: string): Promise<User> => {
      const res = await apiFetch<{ access_token: string; user: User }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setStoredToken(res.access_token);
      setUser(res.user);
      addToast(`Welcome back, ${res.user.full_name}!`, 'You are now signed in to Cravora.', 'success');
      return res.user;
    },
    [addToast]
  );

  const register = useCallback(
    async (data: { email: string; phone: string; full_name: string; password: string }): Promise<User> => {
      const res = await apiFetch<{ access_token: string; user: User }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      setStoredToken(res.access_token);
      setUser(res.user);
      addToast(
        `Welcome to Cravora, ${res.user.full_name}!`,
        '100 Bonus Loyalty Points have been credited to your account.',
        'success'
      );
      return res.user;
    },
    [addToast]
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
    setRedeemLoyaltyPoints(0);
    addToast('Signed Out', 'You have been logged out safely.', 'info');
  }, [addToast]);

  const openCustomizeModal = useCallback((product: Product) => {
    setCustomizingProduct(product);
  }, []);

  const closeCustomizeModal = useCallback(() => {
    setCustomizingProduct(null);
  }, []);

  const openAIWithPrompt = useCallback((prompt?: string) => {
    if (prompt) {
      setAiPendingPrompt(prompt);
    }
    setIsAIOpen(true);
  }, []);

  const clearAIPendingPrompt = useCallback(() => {
    setAiPendingPrompt(null);
  }, []);

  return (
    <StoreContext.Provider
      value={{
        user,
        isLoadingAuth,
        login,
        register,
        logout,
        refreshUser,
        fulfillmentType,
        setFulfillmentType,
        selectedBranch,
        setSelectedBranch,
        branches,
        deliveryLocation,
        updateDeliveryLocation,
        isLocationModalOpen,
        setIsLocationModalOpen,
        cartItems,
        cartSummary,
        isCalculatingCart,
        couponCode,
        setCouponCode,
        redeemLoyaltyPoints,
        setRedeemLoyaltyPoints,
        addToCart,
        quickAddProduct,
        updateCartItemQuantity,
        removeFromCart,
        clearCart,
        loadProposedCartFromAI,
        customizingProduct,
        openCustomizeModal,
        closeCustomizeModal,
        isCartOpen,
        setIsCartOpen,
        isAIOpen,
        setIsAIOpen,
        aiPendingPrompt,
        openAIWithPrompt,
        clearAIPendingPrompt,
        toasts,
        addToast,
        removeToast,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return ctx;
}
