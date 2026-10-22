import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Headphones,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Send,
  Shield,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useStore } from '../context/StoreContext';
import { SupportTicket } from '../types';

const LEGAL_POLICIES: Record<string, { title: string; content: string[] }> = {
  privacy: {
    title: 'Privacy & Data Protection Policy (Template — Requires Legal Review Before Launch)',
    content: [
      '1. Data Collection: Cravora — Pizza & More collects customer name, phone number, email address, delivery coordinates, and order history strictly for order fulfillment, delivery zone routing, loyalty point accounting, and customer support.',
      '2. AI Assistant Privacy: Messages sent to Cravora AI are processed on the backend to query menu items, calculate cart totals, or verify your order status. Raw card details are never collected in chat or stored on Cravora servers.',
      '3. Data Retention & Security: Passwords are hashed using bcrypt (12 rounds). Order lookups require ownership authentication or phone/token verification.',
    ],
  },
  terms: {
    title: 'Terms of Service (Template — Requires Legal Review Before Launch)',
    content: [
      '1. Pricing & Availability: All menu prices are listed in Pakistani Rupees (PKR) and validated on the server before checkout. Applicable 16% GST and configured delivery fees are itemized transparently.',
      '2. Promotions & Coupons: Promotional codes (such as CRAVORA20 or CROWN300) are subject to minimum order thresholds, validity dates, and per-customer redemption limits enforced by the backend.',
      '3. Account Responsibility: Customers are responsible for maintaining accurate delivery contact numbers and gate instructions.',
    ],
  },
  delivery: {
    title: 'Delivery Coverage & Branch Pickup Policy (Template — Requires Legal Review Before Launch)',
    content: [
      '1. Configured Delivery Zones: Each Cravora branch operates within verified polygon and radius delivery zones. Orders outside supported coverage areas cannot be submitted as delivery orders and will be prompted to switch to Branch Pickup.',
      '2. Delivery Charges: Calculated using the branch base fee plus per-kilometer distance rate. Orders meeting the branch free-delivery threshold (Rs. 3,000+) receive complimentary delivery.',
      '3. Rider Tracking: Rider GPS coordinates are displayed only during active out-for-delivery dispatch when a rider device broadcasts verified telemetry, and are automatically deactivated upon delivery completion.',
    ],
  },
  refunds: {
    title: 'Cancellation & Refund Policy (Template — Requires Legal Review Before Launch)',
    content: [
      '1. Order Cancellation: Customers may self-cancel an order while its status is "Order Placed" or "Order Confirmed". Once the order enters "Preparing" (stone oven stage) or "Out for Delivery", self-cancellation is locked and requires Customer Care assistance.',
      '2. Refunds & Quality Guarantee: If an incorrect, damaged, or incomplete order is delivered, customers can log a support ticket or escalate via Cravora AI for an authorized replacement or recorded refund.',
    ],
  },
};

export const SupportAndLegalPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { user, addToast } = useStore();

  const initialOrderRef = searchParams.get('order') || '';
  const initialPolicy = searchParams.get('policy') || '';

  const [customerName, setCustomerName] = useState(user?.full_name || '');
  const [customerPhone, setCustomerPhone] = useState(user?.phone || '+92 333 5129081');
  const [customerEmail, setCustomerEmail] = useState(user?.email || '');
  const [orderReference, setOrderReference] = useState(initialOrderRef);
  const [category, setCategory] = useState('order_issue');
  const [priority, setPriority] = useState('medium');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [lookupRef, setLookupRef] = useState('TKT-10420');
  const [activeTicket, setActiveTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');

  const [selectedPolicyKey, setSelectedPolicyKey] = useState<string>(
    initialPolicy && LEGAL_POLICIES[initialPolicy] ? initialPolicy : 'privacy'
  );

  useEffect(() => {
    if (initialPolicy && LEGAL_POLICIES[initialPolicy]) {
      setSelectedPolicyKey(initialPolicy);
    }
  }, [initialPolicy]);

  const fetchTicket = async (ref: string) => {
    if (!ref.trim()) return;
    try {
      const t = await apiFetch<SupportTicket>(
        `/api/support/tickets/${encodeURIComponent(ref.trim().toUpperCase())}`
      );
      setActiveTicket(t);
    } catch (err: any) {
      addToast('Ticket Not Found', err.message, 'error');
    }
  };

  useEffect(() => {
    fetchTicket('TKT-10420');
  }, []);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const created = await apiFetch<SupportTicket>('/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail || null,
          order_reference: orderReference || null,
          category,
          priority,
          subject,
          message,
          escalated_from_ai: false,
        }),
      });
      setActiveTicket(created);
      setLookupRef(created.ticket_reference);
      setSubject('');
      setMessage('');
      addToast(
        `Ticket ${created.ticket_reference} Created!`,
        'Our Customer Care team has received your request.',
        'success'
      );
    } catch (err: any) {
      addToast('Submission Failed', err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTicket || !replyText.trim()) return;
    try {
      const updated = await apiFetch<SupportTicket>(
        `/api/support/tickets/${activeTicket.ticket_reference}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({ message: replyText }),
        }
      );
      setActiveTicket(updated);
      setReplyText('');
      addToast('Reply Sent', 'Added to your support ticket thread.', 'success');
    } catch (err: any) {
      addToast('Error', err.message, 'error');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-12">
      {/* Header */}
      <div className="bg-cravora-charcoal text-white rounded-3xl p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-8 space-y-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-cravora-orange">
            <Headphones className="w-4 h-4" /> 24/7 Human Care & Order Resolution
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-black">
            Cravora Customer Support & Policies
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 max-w-2xl">
            Log an order issue, track an existing support ticket reference, or review our transparent delivery and refund policies.
          </p>
        </div>

        <div className="lg:col-span-4 bg-white/10 border border-white/15 rounded-2xl p-4 space-y-2 text-xs">
          <div className="font-extrabold text-cravora-orange uppercase">Direct Care Channels</div>
          <div className="flex items-center gap-2">
            <Phone className="w-4 h-4 text-cravora-red" />
            <span>UAN Helpline: +92 (51) 111-272-867</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-cravora-red" />
            <span>Email: care@cravora.pk</span>
          </div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            <span>WhatsApp Care: +92 300 1112728</span>
          </div>
        </div>
      </div>

      {/* Main Support Grid: Create Ticket + Ticket Thread Lookup */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left 6 Cols: Create Support Ticket Form */}
        <form
          onSubmit={handleCreateTicket}
          className="lg:col-span-6 bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-card space-y-4"
        >
          <h2 className="text-xl font-black text-stone-900">Submit a Support Request</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Your Name *</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Full Name"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Phone Number *</label>
              <input
                type="text"
                required
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+92 300 1234567"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Email Address (Optional)
              </label>
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Order Reference (If applicable)
              </label>
              <input
                type="text"
                value={orderReference}
                onChange={(e) => setOrderReference(e.target.value.toUpperCase())}
                placeholder="e.g. CRV-20261020-1001"
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-mono uppercase"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Issue Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold bg-white"
              >
                <option value="order_issue">Order Quality / Missing Item</option>
                <option value="late_delivery">Late Delivery Inquiry</option>
                <option value="refund_request">Refund / Payment Issue</option>
                <option value="general_inquiry">General Feedback</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold bg-white"
              >
                <option value="medium">Standard</option>
                <option value="high">High (Active Order)</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Subject *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of your request..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">
              Detailed Message *
            </label>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe how our team can help you..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-300 text-xs"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-2xl bg-cravora-red hover:bg-cravora-redDark text-white font-extrabold text-xs shadow-glow transition"
          >
            {isSubmitting ? 'Creating Support Ticket...' : 'Create Support Ticket & Get Reference'}
          </button>
        </form>

        {/* Right 6 Cols: Ticket Lookup & Live Admin Reply Thread */}
        <div className="lg:col-span-6 bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-card space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-black text-stone-900">Track Ticket & Admin Replies</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={lookupRef}
                onChange={(e) => setLookupRef(e.target.value.toUpperCase())}
                placeholder="TKT-10420"
                className="w-32 px-3 py-1.5 rounded-xl border border-stone-300 text-xs font-mono uppercase"
              />
              <button
                type="button"
                onClick={() => fetchTicket(lookupRef)}
                className="px-3.5 py-1.5 rounded-xl bg-stone-900 text-white text-xs font-bold flex items-center gap-1"
              >
                <Search className="w-3.5 h-3.5" /> Lookup
              </button>
            </div>
          </div>

          {activeTicket ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-cravora-cream border border-stone-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-mono font-black text-cravora-red text-sm">
                    {activeTicket.ticket_reference}
                  </span>
                  <h3 className="font-extrabold text-stone-900 mt-0.5">{activeTicket.subject}</h3>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase">
                  Status: {activeTicket.status.replace(/_/g, ' ')}
                </span>
              </div>

              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {activeTicket.messages.map((m) => (
                  <div
                    key={m.id}
                    className={`p-3.5 rounded-2xl text-xs ${
                      m.sender_role === 'admin'
                        ? 'bg-stone-900 text-white ml-6'
                        : 'bg-stone-100 text-stone-800 mr-6'
                    }`}
                  >
                    <div className="flex justify-between text-[10px] opacity-75 mb-1 font-bold">
                      <span>{m.sender_name}</span>
                      <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                    </div>
                    <p className="leading-relaxed">{m.message}</p>
                  </div>
                ))}
              </div>

              <form onSubmit={handleSendReply} className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder="Write a follow-up message on this ticket..."
                  className="flex-1 px-4 py-2.5 rounded-xl border border-stone-300 text-xs"
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-cravora-red text-white text-xs font-extrabold flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" /> Reply
                </button>
              </form>
            </div>
          ) : (
            <p className="text-xs text-stone-500">
              Enter your Ticket Reference (e.g. TKT-10420) above to view status and admin replies.
            </p>
          )}
        </div>
      </div>

      {/* Legal Policy Templates Section */}
      <section className="bg-white rounded-3xl border border-stone-200 p-6 sm:p-8 shadow-card space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-stone-200">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-amber-700">
              <AlertTriangle className="w-4 h-4" /> Editable Legal Policy Templates
            </span>
            <h2 className="font-display text-2xl font-black text-stone-900 mt-0.5">
              Legal, Privacy, Delivery & Refund Policies
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'privacy', label: 'Privacy Policy' },
              { key: 'terms', label: 'Terms of Service' },
              { key: 'delivery', label: 'Delivery Policy' },
              { key: 'refunds', label: 'Cancellation & Refunds' },
            ].map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setSelectedPolicyKey(p.key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition ${
                  selectedPolicyKey === p.key
                    ? 'bg-cravora-red text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-base font-extrabold text-stone-900 flex items-center gap-2">
            <FileText className="w-4 h-4 text-cravora-red" />
            {LEGAL_POLICIES[selectedPolicyKey].title}
          </h3>
          {LEGAL_POLICIES[selectedPolicyKey].content.map((para, i) => (
            <p key={i} className="text-xs sm:text-sm text-stone-600 leading-relaxed">
              {para}
            </p>
          ))}
        </div>
      </section>
    </div>
  );
};
