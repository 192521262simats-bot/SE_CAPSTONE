import { useEffect, useState, type FormEvent } from 'react';
import {
  BellRing,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  MessageSquarePlus,
  Scale,
  ShoppingBag,
  ThumbsDown,
  ThumbsUp,
  X,
} from 'lucide-react';
import type {
  CityLocation,
  CurrencyCode,
  Product,
  ProductVerdictResponse,
  ShoppingPriority,
  WatchlistItem,
} from '../types/shop';
import {
  formatPrice,
  getBestNetPriceInr,
  getNetCost,
  getSortedOffers,
  getWorthItPercent,
} from '../utils/pricing';
import { PriceSparkline } from './PriceSparkline';

interface ProductDetailModalProps {
  product: Product;
  currency: CurrencyCode;
  priority: ShoppingPriority;
  location: CityLocation;
  watchItem?: WatchlistItem;
  userVote?: 'worthIt' | 'waitForDrop';
  inDuel: boolean;
  onClose: () => void;
  onVote: (productId: string, voteType: 'worthIt' | 'waitForDrop') => Promise<void>;
  onAddNote: (productId: string, author: string, storeName: string, text: string) => Promise<boolean>;
  onHelpfulNote: (productId: string, noteId: string) => Promise<void>;
  onSaveWatchTarget: (product: Product, targetPriceInr: number) => void;
  onToggleDuel: (productId: string) => void;
}

export function ProductDetailModal({
  product,
  currency,
  priority,
  location,
  watchItem,
  userVote,
  inDuel,
  onClose,
  onVote,
  onAddNote,
  onHelpfulNote,
  onSaveWatchTarget,
  onToggleDuel,
}: ProductDetailModalProps) {
  const bestNetInr = getBestNetPriceInr(product, location);
  const minSliderInr = Math.max(20, Math.round(bestNetInr * 0.72));
  const maxSliderInr = Math.max(bestNetInr + 50, product.msrp);

  const [targetInr, setTargetInr] = useState<number>(
    watchItem?.targetPriceInr ?? Math.round(bestNetInr * 0.95)
  );
  const [targetSavedFeedback, setTargetSavedFeedback] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const [verdictLoading, setVerdictLoading] = useState(false);
  const [verdictError, setVerdictError] = useState<string | null>(null);
  const [verdictData, setVerdictData] = useState<ProductVerdictResponse | null>(null);

  const [noteAuthor, setNoteAuthor] = useState('');
  const [noteStore, setNoteStore] = useState(product.offers[0]?.storeName ?? 'Flipkart');
  const [noteText, setNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const sortedOffers = getSortedOffers(product, priority, location);
  const worthItPct = getWorthItPercent(product);
  const totalVotes = product.votes.worthIt + product.votes.waitForDrop;
  const targetAlreadyMet = bestNetInr <= targetInr;

  function handleCopyCoupon(code: string) {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1600);
  }

  async function handleAnalyzeVerdict() {
    setVerdictLoading(true);
    setVerdictError(null);
    try {
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'verdict',
          productId: product.id,
          priority,
        }),
      });
      const data = (await res.json()) as {
        verdict?: ProductVerdictResponse;
        error?: string;
      };
      if (!res.ok || !data.verdict) {
        setVerdictError(data.error ?? 'Could not analyze buy timing.');
      } else {
        setVerdictData(data.verdict);
      }
    } catch {
      setVerdictError('Network error reaching recommendation service.');
    } finally {
      setVerdictLoading(false);
    }
  }

  async function handleSubmitNote(e: FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setNoteSubmitting(true);
    setNoteError(null);
    const ok = await onAddNote(product.id, noteAuthor, noteStore, noteText);
    setNoteSubmitting(false);
    if (ok) {
      setNoteText('');
    } else {
      setNoteError('Please enter at least 4 characters for your shopping tip.');
    }
  }

  function handleSaveTarget() {
    onSaveWatchTarget(product, targetInr);
    setTargetSavedFeedback(true);
    setTimeout(() => setTargetSavedFeedback(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-product-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto shadow-xl">
        {/* Sticky Modal Header */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <span>{product.brand}</span>
              <span aria-hidden="true">·</span>
              <span>{product.category}</span>
              <span aria-hidden="true">·</span>
              <span>{location.city} ({location.pincode})</span>
            </div>
            <h2 id="modal-product-title" className="text-xl font-bold text-slate-900 truncate">
              {product.name}
            </h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onToggleDuel(product.id)}
              className={`min-h-10 px-3 py-2 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                inDuel
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>{inDuel ? 'In Deal Duel' : 'Add to Duel'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close comparison dialog"
              className="min-h-10 min-w-10 flex items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="aspect-[4/3] bg-slate-100 rounded-xl overflow-hidden">
              {product.image ? (
                <img
                  src={product.image}
                  alt={product.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-100 to-blue-50 p-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-blue-600">
                    <ShoppingBag className="w-7 h-7" />
                  </div>
                  <div className="font-semibold text-slate-900">{product.name}</div>
                </div>
              )}
            </div>

            <PriceSparkline history={product.history30d} currency={currency} />

            {/* Specs Grid */}
            <div className="grid grid-cols-2 gap-2">
              {product.specs.map((spec) => (
                <div
                  key={spec.label}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                >
                  <div className="text-xs text-slate-500">{spec.label}</div>
                  <div className="text-sm font-semibold text-slate-900">{spec.value}</div>
                </div>
              ))}
            </div>

            {/* Interactive Price Target Input + Slider */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="target-direct-input" className="text-sm font-semibold text-slate-900">
                  Price Target Alert
                </label>
                <div className="relative w-32">
                  <span className="absolute left-2.5 top-1.5 text-xs font-mono text-slate-500 pointer-events-none">
                    {currency === 'INR' ? '₹' : '$'}
                  </span>
                  <input
                    id="target-direct-input"
                    type="text"
                    inputMode="numeric"
                    value={currency === 'USD' ? Math.round(targetInr / 84) : targetInr}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^0-9]/g, '');
                      const num = digits ? Number(digits) : 0;
                      setTargetInr(currency === 'USD' ? num * 84 : num);
                    }}
                    className="w-full h-8 pl-6 pr-2 bg-white border border-slate-200 rounded-md text-xs font-mono font-semibold text-blue-600 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                </div>
              </div>

              <input
                id="target-slider"
                type="range"
                min={minSliderInr}
                max={maxSliderInr}
                step={1}
                value={Math.min(maxSliderInr, Math.max(minSliderInr, targetInr))}
                aria-label="Adjust price target alert"
                onChange={(e) => setTargetInr(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />

              <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                <span>{formatPrice(minSliderInr, currency)}</span>
                <span>
                  {targetAlreadyMet
                    ? 'Current best meets target!'
                    : `${formatPrice(bestNetInr - targetInr, currency)} away`}
                </span>
                <span>{formatPrice(maxSliderInr, currency)}</span>
              </div>

              <button
                type="button"
                onClick={handleSaveTarget}
                className="w-full min-h-10 px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                <BellRing className="w-3.5 h-3.5" />
                <span>
                  {targetSavedFeedback
                    ? `Saved Alert (${formatPrice(targetInr, currency)})`
                    : watchItem
                      ? 'Update Watchlist Target'
                      : 'Save Price Alert'}
                </span>
              </button>
            </div>

            {/* Community Worth-It Vote */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-900">Community Deal Pulse</span>
                <span className="text-xs text-slate-500 tabular-nums">{totalVotes} votes</span>
              </div>

              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                <div
                  className="bg-emerald-600 transition-all duration-300"
                  style={{ width: `${worthItPct}%` }}
                />
                <div
                  className="bg-amber-500 transition-all duration-300"
                  style={{ width: `${100 - worthItPct}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-slate-600 tabular-nums">
                <span className="font-medium text-emerald-700">{worthItPct}% Worth It Now</span>
                <span>{100 - worthItPct}% Wait for Drop</span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  disabled={Boolean(userVote)}
                  onClick={() => void onVote(product.id, 'worthIt')}
                  className={`min-h-10 px-3 py-2 text-xs font-medium rounded-lg border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    userVote === 'worthIt'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60'
                  }`}
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                  <span>Worth It ({product.votes.worthIt})</span>
                </button>
                <button
                  type="button"
                  disabled={Boolean(userVote)}
                  onClick={() => void onVote(product.id, 'waitForDrop')}
                  className={`min-h-10 px-3 py-2 text-xs font-medium rounded-lg border transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                    userVote === 'waitForDrop'
                      ? 'bg-amber-50 border-amber-200 text-amber-800'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-60'
                  }`}
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                  <span>Wait ({product.votes.waitForDrop})</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column */}
          <div className="lg:col-span-7 space-y-6">
            {/* Intelligent Buy Timing Verdict */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Intelligent Shopping Verdict
                  </h3>
                  <p className="text-xs text-slate-500">
                    Weighs coupon savings, 30-day low, delivery ETA, and store reliability
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleAnalyzeVerdict()}
                  disabled={verdictLoading}
                  className="min-h-10 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {verdictLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <span>{verdictData ? 'Refresh Verdict' : 'Analyze Buy Timing'}</span>
                  )}
                </button>
              </div>

              {verdictError && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {verdictError}
                </div>
              )}

              {verdictData && (
                <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span
                      className={`flex items-center gap-1 ${
                        verdictData.verdict === 'Buy Now' ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {verdictData.verdict === 'Buy Now' ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <Clock className="w-4 h-4" />
                      )}
                      {verdictData.verdict}
                    </span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-slate-700">{verdictData.confidenceLabel}</span>
                    <span className="text-slate-300" aria-hidden="true">·</span>
                    <span className="text-blue-600">Recommended: {verdictData.bestStoreName}</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{verdictData.summary}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                    <div className="bg-slate-50 rounded-md p-2.5 text-slate-600">
                      <strong className="text-slate-800 block mb-0.5">Watch out:</strong>
                      {verdictData.watchOut}
                    </div>
                    <div className="bg-slate-50 rounded-md p-2.5 text-slate-600">
                      <strong className="text-slate-800 block mb-0.5">Coupon tip:</strong>
                      {verdictData.tip}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Platform Comparison Table with Coupons */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">
                  All Indian Platforms &amp; Coupons
                </h3>
                <span className="text-xs text-slate-500">
                  Sorted by {priority.replace('-', ' ')}
                </span>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                      <th className="py-3 px-4 font-medium">Platform</th>
                      <th className="py-3 px-3 font-medium text-right">Sticker</th>
                      <th className="py-3 px-3 font-medium">Coupon / Offer</th>
                      <th className="py-3 px-3 font-medium text-right">Net Total</th>
                      <th className="py-3 px-4 font-medium text-right">Shop</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedOffers.map((offer, idx) => {
                      const netCost = getNetCost(offer);
                      const isWinner = idx === 0 && offer.inStock;
                      return (
                        <tr
                          key={`${offer.storeName}-${idx}`}
                          className={
                            isWinner
                              ? 'bg-emerald-50/50'
                              : !offer.inStock
                                ? 'bg-slate-50/60 opacity-60'
                                : 'bg-white'
                          }
                        >
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{offer.storeName}</span>
                              {isWinner && (
                                <span className="text-xs font-medium text-emerald-700">
                                  · Best Pick
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              {offer.deliveryEta} · {offer.perk}
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                            {formatPrice(offer.price, currency)}
                          </td>
                          <td className="py-3 px-3 text-xs">
                            {offer.cashback > 0 && offer.couponCode ? (
                              <div className="space-y-1">
                                <div className="text-emerald-700 font-medium tabular-nums">
                                  -{formatPrice(offer.cashback, currency)} off
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCoupon(offer.couponCode!)}
                                  className="font-mono text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  {copiedCode === offer.couponCode ? (
                                    <>
                                      <Check className="w-2.5 h-2.5" />
                                      <span>Copied</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-2.5 h-2.5" />
                                      <span>{offer.couponCode}</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400">No coupon needed</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-slate-900">
                            {offer.inStock ? formatPrice(netCost, currency) : '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {offer.inStock ? (
                              <a
                                href={offer.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                                  isWinner
                                    ? 'bg-slate-900 hover:bg-blue-600 text-white'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                                }`}
                              >
                                <span>Visit</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-slate-500">Unavailable</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Community Shopper Notes */}
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-slate-900">
                Shopper Notes &amp; Coupon Tips ({product.notes.length})
              </h3>

              <form onSubmit={handleSubmitNote} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={noteAuthor}
                    onChange={(e) => setNoteAuthor(e.target.value)}
                    placeholder="Your name (optional)"
                    aria-label="Your name"
                    className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <select
                    value={noteStore}
                    onChange={(e) => setNoteStore(e.target.value)}
                    aria-label="Store tip applies to"
                    className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  >
                    {product.offers.map((o, idx) => (
                      <option key={`${o.storeName}-${idx}`} value={o.storeName}>
                        Tip for {o.storeName}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Share a working coupon, bank card hack, or delivery tip..."
                    aria-label="Share a shopping tip"
                    className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                  />
                  <button
                    type="submit"
                    disabled={noteSubmitting}
                    className="min-h-10 px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    <span>Post Tip</span>
                  </button>
                </div>
                {noteError && <p className="text-xs text-rose-700">{noteError}</p>}
              </form>

              <div className="space-y-2">
                {product.notes.map((note) => (
                  <div
                    key={note.id}
                    className="bg-white border border-slate-200 rounded-xl p-3.5 flex items-start justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="text-xs text-slate-500 flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900">{note.author}</span>
                        <span>{note.handle}</span>
                        {note.storeName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-blue-600 font-medium">{note.storeName}</span>
                          </>
                        )}
                        <span aria-hidden="true">·</span>
                        <span>{note.createdAt}</span>
                      </div>
                      <p className="text-sm text-slate-700">{note.text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onHelpfulNote(product.id, note.id)}
                      className="min-h-9 px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg flex items-center gap-1 shrink-0 tabular-nums cursor-pointer"
                    >
                      <ThumbsUp className="w-3 h-3" />
                      <span>{note.helpfulCount}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
