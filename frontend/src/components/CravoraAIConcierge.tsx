import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bot,
  CheckCircle2,
  Headphones,
  Loader2,
  Package,
  RefreshCw,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import { apiFetch, formatPKR } from '../api/client';
import { useStore } from '../context/StoreContext';
import { AIChatResponse, Product } from '../types';

interface ChatTurn {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  aiPayload?: AIChatResponse;
  isError?: boolean;
  retryPrompt?: string;
}

const INITIAL_SUGGESTIONS = [
  'Add 1 Large Royal Crown Crust Pizza to my cart',
  'Suggest the best meal under Rs. 1,500',
  'I need a pizza for four people',
  'Apply best coupon to my cart',
  'Switch to pickup',
  'Where is my order CRV-20261020-1001?',
  'I want to report a problem with my order',
];

function renderRichText(text: string): React.ReactNode {
  // Render **bold**, `code` and _italic_ without injecting HTML
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1 rounded bg-stone-100 text-cravora-red font-mono text-[11px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part.replace(/\*([^*]+)\*/g, '$1')}</React.Fragment>;
  });
}

export const CravoraAIConcierge: React.FC = () => {
  const {
    isAIOpen,
    setIsAIOpen,
    aiPendingPrompt,
    clearAIPendingPrompt,
    fulfillmentType,
    selectedBranch,
    deliveryLocation,
    openCustomizeModal,
    quickAddProduct,
    loadProposedCartFromAI,
    cartItems,
    couponCode,
    addToCart,
    setCouponCode,
    clearCart,
    setFulfillmentType,
    setIsCartOpen,
  } = useStore();

  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [providerStatusNote, setProviderStatusNote] = useState<string>(
    'Connected to live database tools (Menu, Pricing, Coverage, Orders & Support).'
  );
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: 'welcome-1',
      sender: 'ai',
      text: "Assalam-o-Alaikum! I'm **Cravora AI — Your Personal Food Assistant**.\n\nI can recommend meals within your exact budget, compare our Crown Crust pizzas and deals, check delivery coverage & fees for your pin, prepare a proposed cart for your confirmation, track your verified orders, or escalate any issue to our Human Care team.",
    },
  ]);

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, isLoading, isAIOpen]);

  const sendMessage = async (promptText: string) => {
    const trimmed = promptText.trim();
    if (!trimmed || isLoading) return;

    const userTurn: ChatTurn = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: trimmed,
    };
    setTurns((prev) => [...prev, userTurn]);
    setInput('');
    setIsLoading(true);

    try {
      const history = turns
        .filter((t) => !t.isError)
        .slice(-8)
        .map((t) => ({ role: t.sender === 'user' ? 'user' : 'assistant', content: t.text }));
      const res = await apiFetch<AIChatResponse>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: trimmed,
          history,
          current_cart: cartItems.map((i) => ({
            product_id: i.product_id,
            variant_id: i.variant_id || null,
            selected_option_ids: i.selected_option_ids,
            quantity: i.quantity,
          })),
          current_coupon: couponCode || null,
          fulfillment_type: fulfillmentType,
          branch_id: selectedBranch?.id || null,
          delivery_lat: deliveryLocation.latitude,
          delivery_lng: deliveryLocation.longitude,
        }),
      });
      setProviderStatusNote(res.provider_status_note);

      // Execute autonomous agent actions directly on the website
      let openedCart = false;
      for (const action of res.agent_actions || []) {
        if (!action.auto_execute) continue;
        const p = action.payload || {};
        switch (action.action_type) {
          case 'ADD_TO_CART':
            addToCart({
              product_id: p.product_id,
              product_name: p.product_name,
              product_image: p.product_image,
              variant_id: p.variant_id ?? null,
              variant_name: p.variant_name ?? null,
              selected_option_ids: p.selected_option_ids || [],
              selected_option_labels: p.selected_option_labels || [],
              quantity: p.quantity || 1,
              unit_price_preview: p.unit_price_preview || 0,
            });
            openedCart = true;
            break;
          case 'APPLY_COUPON':
            if (p.coupon_code) setCouponCode(p.coupon_code);
            break;
          case 'CLEAR_CART':
            clearCart();
            break;
          case 'SET_FULFILLMENT':
            if (p.fulfillment_type) setFulfillmentType(p.fulfillment_type);
            break;
          case 'OPEN_CUSTOMIZER':
            if (p.product) openCustomizeModal(p.product);
            break;
          case 'NAVIGATE':
            if (p.path) {
              setIsAIOpen(false);
              navigate(p.path);
            }
            break;
        }
      }
      if (openedCart) setIsCartOpen(true);
      setTurns((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: res.reply,
          aiPayload: res,
        },
      ]);
    } catch (err: any) {
      setTurns((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: err.message || 'Could not reach Cravora AI service. Please try again.',
          isError: true,
          retryPrompt: trimmed,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAIOpen && aiPendingPrompt) {
      const p = aiPendingPrompt;
      clearAIPendingPrompt();
      sendMessage(p);
    }
  }, [isAIOpen, aiPendingPrompt]);

  return (
    <>
      {/* Floating Launcher Button */}
      {!isAIOpen && (
        <button
          type="button"
          onClick={() => setIsAIOpen(true)}
          className="fixed bottom-5 right-5 z-40 group flex items-center gap-3 pl-4 pr-5 py-3.5 rounded-full bg-cravora-charcoal hover:bg-cravora-red text-white shadow-2xl border-2 border-cravora-orange/80 transition-all duration-200"
          aria-label="Open Cravora AI Food Assistant"
        >
          <div className="relative w-9 h-9 rounded-full bg-cravora-red group-hover:bg-white group-hover:text-cravora-red flex items-center justify-center transition">
            <Sparkles className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-cravora-charcoal" />
          </div>
          <div className="text-left">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-cravora-orange group-hover:text-amber-200">
              AI Food Concierge
            </div>
            <div className="text-xs font-extrabold leading-tight">Ask Cravora AI</div>
          </div>
        </button>
      )}

      {/* Chat Panel */}
      {isAIOpen && (
        <div
          className="fixed inset-y-0 right-0 sm:inset-auto sm:bottom-5 sm:right-5 z-50 w-full sm:w-[440px] sm:h-[680px] sm:max-h-[88vh] bg-white sm:rounded-3xl shadow-2xl border border-stone-200 flex flex-col overflow-hidden"
          role="dialog"
          aria-label="Cravora AI Personal Food Assistant"
        >
          {/* Header */}
          <div className="px-5 py-4 bg-cravora-charcoal text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cravora-red to-cravora-orange flex items-center justify-center shadow-md">
                <Bot className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold">Cravora AI</h2>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                    Autonomous Agent
                  </span>
                </div>
                <p className="text-[11px] text-stone-300">
                  Your Personal Food Concierge & Order Assistant
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => sendMessage('I want to report a problem with my order')}
                title="Escalate to Human Support"
                className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold text-stone-200 flex items-center gap-1 transition"
              >
                <Headphones className="w-3.5 h-3.5 text-cravora-orange" />
                <span>Human Care</span>
              </button>
              <button
                type="button"
                onClick={() => setIsAIOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-stone-300 hover:text-white transition"
                aria-label="Close Cravora AI"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Transparent Mode & Privacy Disclosure Bar */}
          <div className="px-4 py-2 bg-stone-100 border-b border-stone-200 text-[10px] text-stone-600 flex items-start gap-2">
            <ShieldCheck className="w-3.5 h-3.5 text-cravora-red shrink-0 mt-0.5" />
            <div className="leading-snug">
              <span className="font-bold text-stone-800">Verified Source of Truth:</span>{' '}
              {providerStatusNote} Orders are never placed without your explicit confirmation.
            </div>
          </div>

          {/* Conversation Scroll Area */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-cravora-cream/50">
            {turns.map((turn) => (
              <div
                key={turn.id}
                className={`flex flex-col ${
                  turn.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                    turn.sender === 'user'
                      ? 'bg-cravora-red text-white font-semibold rounded-br-sm'
                      : turn.isError
                      ? 'bg-red-50 border border-red-200 text-red-900'
                      : 'bg-white border border-stone-200 text-stone-800 rounded-bl-sm'
                  }`}
                >
                  <div className="whitespace-pre-line">{renderRichText(turn.text)}</div>

                  {/* Agent reasoning trace */}
                  {turn.aiPayload?.agent_steps && turn.aiPayload.agent_steps.length > 0 && (
                    <details className="mt-2.5 pt-2 border-t border-stone-100">
                      <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-wider text-stone-500">
                        Agent reasoning ({turn.aiPayload.agent_steps.length} steps)
                      </summary>
                      <ol className="mt-1.5 space-y-1">
                        {turn.aiPayload.agent_steps.map((s, i) => (
                          <li key={i} className="text-[10px] text-stone-600 leading-snug">
                            <span className="font-bold text-stone-800">
                              {i + 1}. [{s.step_type}] {s.title}
                            </span>{' '}
                            — {s.detail}
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}

                  {/* Executed website actions */}
                  {turn.aiPayload?.agent_actions && turn.aiPayload.agent_actions.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {turn.aiPayload.agent_actions.map((a, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-800"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Action done: {a.label}
                        </div>
                      ))}
                    </div>
                  )}

                  {turn.isError && turn.retryPrompt && (
                    <button
                      type="button"
                      onClick={() => sendMessage(turn.retryPrompt!)}
                      className="mt-2 inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-red-600 text-white text-[11px] font-bold"
                    >
                      <RefreshCw className="w-3 h-3" /> Retry Request
                    </button>
                  )}

                  {/* Tool execution badges */}
                  {turn.aiPayload?.tools_invoked && turn.aiPayload.tools_invoked.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-stone-100 flex flex-wrap items-center gap-1">
                      <Wrench className="w-3 h-3 text-stone-400 mr-0.5" />
                      {turn.aiPayload.tools_invoked.map((toolName) => (
                        <span
                          key={toolName}
                          className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 text-[9px] font-mono font-bold"
                        >
                          {toolName}()
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recommended Products Cards */}
                {turn.aiPayload?.recommended_products &&
                  turn.aiPayload.recommended_products.length > 0 && (
                    <div className="w-full mt-2.5 space-y-2">
                      {turn.aiPayload.recommended_products.map((prod: Product) => (
                        <div
                          key={prod.id}
                          className="p-2.5 rounded-2xl bg-white border border-stone-200 shadow-sm flex items-center gap-3"
                        >
                          <img
                            src={prod.image_url}
                            alt={prod.name}
                            className="w-14 h-14 rounded-xl object-cover shrink-0 bg-stone-100"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <h4 className="text-xs font-extrabold text-stone-900 truncate">
                                {prod.name}
                              </h4>
                              <span className="text-xs font-extrabold text-cravora-red shrink-0">
                                {formatPKR(prod.base_price)}
                              </span>
                            </div>
                            <p className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
                              {prod.short_description}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  openCustomizeModal(prod);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-800 text-[10px] font-bold transition"
                              >
                                Customize
                              </button>
                              <button
                                type="button"
                                onClick={() => quickAddProduct(prod)}
                                className="px-2.5 py-1 rounded-lg bg-cravora-red hover:bg-cravora-redDark text-white text-[10px] font-extrabold transition"
                              >
                                + Add to Cart
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                {/* Proposed Cart Confirmation Card */}
                {turn.aiPayload?.proposed_cart && (
                  <div className="w-full mt-3 p-4 rounded-2xl bg-gradient-to-br from-stone-900 to-cravora-charcoal text-white shadow-lg border border-stone-700 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-cravora-orange flex items-center gap-1.5">
                        <ShoppingBag className="w-3.5 h-3.5" />
                        AI Prepared Cart Proposal
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] font-bold">
                        Awaiting Your Confirmation
                      </span>
                    </div>

                    <div className="space-y-1 text-xs border-y border-white/10 py-2">
                      {turn.aiPayload.proposed_cart.items.map((vi, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span className="text-stone-200">
                            {vi.quantity}x {vi.product_name}{' '}
                            {vi.variant_name ? `(${vi.variant_name})` : ''}
                          </span>
                          <span className="font-bold">{formatPKR(vi.line_total)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-1 text-[11px] text-stone-300">
                      <div className="flex justify-between">
                        <span>Subtotal:</span>
                        <span>{formatPKR(turn.aiPayload.proposed_cart.subtotal)}</span>
                      </div>
                      {turn.aiPayload.proposed_cart.discount_amount > 0 && (
                        <div className="flex justify-between text-emerald-400 font-bold">
                          <span>Promo Discount ({turn.aiPayload.proposed_cart.coupon_code}):</span>
                          <span>-{formatPKR(turn.aiPayload.proposed_cart.discount_amount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Delivery Fee:</span>
                        <span>{formatPKR(turn.aiPayload.proposed_cart.delivery_fee)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>GST (16%):</span>
                        <span>{formatPKR(turn.aiPayload.proposed_cart.tax_amount)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-extrabold text-white pt-1 border-t border-white/10">
                        <span>Verified Total:</span>
                        <span className="text-cravora-orange">
                          {formatPKR(turn.aiPayload.proposed_cart.total_amount)}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => loadProposedCartFromAI(turn.aiPayload!.proposed_cart!)}
                      className="w-full py-2.5 px-4 rounded-xl bg-cravora-red hover:bg-cravora-redDark text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-glow transition"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm & Load Proposed Cart</span>
                    </button>
                  </div>
                )}

                {/* Verified Order Status Card */}
                {turn.aiPayload?.order_status_card && (
                  <div className="w-full mt-2.5 p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-emerald-950 flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-emerald-700" />
                        {turn.aiPayload.order_status_card.order_reference}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-extrabold uppercase">
                        {turn.aiPayload.order_status_card.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="text-[11px] text-emerald-900">
                      Branch: {turn.aiPayload.order_status_card.branch_name} • Total:{' '}
                      {formatPKR(turn.aiPayload.order_status_card.total_amount)}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAIOpen(false);
                        navigate(
                          `/track-order?ref=${turn.aiPayload!.order_status_card!.order_reference}`
                        );
                      }}
                      className="w-full py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs transition"
                    >
                      Open Live Order Timeline
                    </button>
                  </div>
                )}

                {/* Support Ticket Escalation Card */}
                {turn.aiPayload?.support_ticket_card && (
                  <div className="w-full mt-2.5 p-3.5 rounded-2xl bg-amber-50 border border-amber-300 text-xs space-y-1.5">
                    <div className="font-extrabold text-amber-950 flex items-center justify-between">
                      <span>Ticket: {turn.aiPayload.support_ticket_card.ticket_reference}</span>
                      <span className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] uppercase">
                        Escalated
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-900">
                      {turn.aiPayload.support_ticket_card.message}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAIOpen(false);
                        navigate('/support');
                      }}
                      className="w-full mt-1 py-1.5 rounded-xl bg-cravora-charcoal text-white font-bold text-[11px]"
                    >
                      View in Support Center
                    </button>
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-xs text-stone-500 bg-white px-4 py-3 rounded-2xl border border-stone-200 w-fit">
                <Loader2 className="w-4 h-4 animate-spin text-cravora-red" />
                <span>Cravora AI is querying menu & pricing tools...</span>
              </div>
            )}
          </div>

          {/* Quick Suggestion Chips */}
          <div className="px-4 py-2 bg-white border-t border-stone-200 flex gap-1.5 overflow-x-auto no-scrollbar">
            {(
              [...turns].reverse().find((t) => t.aiPayload?.quick_replies?.length)?.aiPayload
                ?.quick_replies || INITIAL_SUGGESTIONS
            ).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => sendMessage(s)}
                className="shrink-0 px-3 py-1.5 rounded-full bg-stone-100 hover:bg-red-50 hover:text-cravora-red border border-stone-200 text-[11px] font-bold text-stone-700 transition"
              >
                {s}
              </button>
            ))}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input);
            }}
            className="p-3.5 bg-white border-t border-stone-200 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask for meal recommendations, budget deals, or order status..."
              className="flex-1 px-4 py-2.5 rounded-2xl border border-stone-300 text-xs focus:border-cravora-red focus:outline-none"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="p-2.5 rounded-2xl bg-cravora-red hover:bg-cravora-redDark disabled:bg-stone-300 text-white transition"
              aria-label="Send message to Cravora AI"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
};
