import { useState } from 'react';
import { ArrowRight, CheckCircle2, MessageSquareShare, ShoppingBag, Trophy } from 'lucide-react';
import type { CityLocation, CurrencyCode, Product, ShoppingPriority } from '../types/shop';
import {
  formatPrice,
  getBestOffer,
  getMaxSavingsInr,
  getNetCost,
  getPriceStatus,
  getSavingsPercent,
  getWorthItPercent,
} from '../utils/pricing';

interface DealDuelViewProps {
  products: Product[];
  duelIds: [string, string];
  currency: CurrencyCode;
  priority: ShoppingPriority;
  location: CityLocation;
  onChangeDuelIds: (next: [string, string]) => void;
  onOpenProduct: (product: Product) => void;
  onCreatePollFromDuel: (productA: Product, productB: Product, question: string) => Promise<void>;
}

export function DealDuelView({
  products,
  duelIds,
  currency,
  priority,
  location,
  onChangeDuelIds,
  onOpenProduct,
  onCreatePollFromDuel,
}: DealDuelViewProps) {
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollPublished, setPollPublished] = useState(false);

  const productA = products.find((p) => p.id === duelIds[0]) ?? products[0];
  const productB =
    products.find((p) => p.id === duelIds[1]) ??
    products.find((p) => p.id !== productA.id) ??
    products[1];

  const offerA = getBestOffer(productA, priority, location);
  const offerB = getBestOffer(productB, priority, location);
  const netA = getNetCost(offerA);
  const netB = getNetCost(offerB);
  const savePctA = getSavingsPercent(productA, location);
  const savePctB = getSavingsPercent(productB, location);
  const worthA = getWorthItPercent(productA);
  const worthB = getWorthItPercent(productB);

  function getWinner(): { winner: Product; reason: string } {
    if (priority === 'lowest-price') {
      if (netA <= netB) {
        return {
          winner: productA,
          reason: `Costs ${formatPrice(netB - netA, currency)} less net on ${offerA.storeName}.`,
        };
      }
      return {
        winner: productB,
        reason: `Costs ${formatPrice(netA - netB, currency)} less net on ${offerB.storeName}.`,
      };
    }

    if (priority === 'fastest-delivery') {
      if (offerA.deliveryDays <= offerB.deliveryDays) {
        return {
          winner: productA,
          reason: `Arrives in ${offerA.deliveryEta} from ${offerA.storeName}.`,
        };
      }
      return {
        winner: productB,
        reason: `Arrives in ${offerB.deliveryEta} from ${offerB.storeName}.`,
      };
    }

    const scoreA = savePctA * 1.4 + worthA * 0.5 + productA.rating * 10;
    const scoreB = savePctB * 1.4 + worthB * 0.5 + productB.rating * 10;
    if (scoreA >= scoreB) {
      return {
        winner: productA,
        reason: `Stronger overall value (${savePctA}% off MRP, ${worthA}% Worth It vote).`,
      };
    }
    return {
      winner: productB,
      reason: `Stronger overall value (${savePctB}% off MRP, ${worthB}% Worth It vote).`,
    };
  }

  const { winner, reason } = getWinner();

  async function handlePublishPoll() {
    const q = pollQuestion.trim() || `Which is the smarter buy: ${productA.name} or ${productB.name}?`;
    await onCreatePollFromDuel(productA, productB, q);
    setPollQuestion('');
    setPollPublished(true);
    setTimeout(() => setPollPublished(false), 3000);
  }

  return (
    <section className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-slate-900">Deal Duel — Head-to-Head Compare</h2>
            <p className="text-sm text-slate-600">
              Compare any two products side-by-side across final coupon price, delivery speed, and community sentiment.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm">
            <Trophy className="w-4 h-4 text-emerald-700 shrink-0" />
            <div>
              <span className="font-semibold text-slate-900">{winner.name} leads: </span>
              <span className="text-emerald-800">{reason}</span>
            </div>
          </div>
        </div>

        {/* Product Pickers */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { slot: 0 as const, item: productA, offer: offerA, net: netA, savePct: savePctA, worth: worthA },
            { slot: 1 as const, item: productB, offer: offerB, net: netB, savePct: savePctB, worth: worthB },
          ].map(({ slot, item, offer, net, savePct, worth }) => {
            const isWin = winner.id === item.id;
            return (
              <div
                key={slot}
                className={`rounded-xl border p-5 space-y-4 ${
                  isWin ? 'bg-slate-50 border-blue-300' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs font-medium text-slate-500" htmlFor={`duel-select-${slot}`}>
                    Contender {slot === 0 ? 'A' : 'B'}
                  </label>
                  {isWin && (
                    <span className="text-xs font-semibold text-blue-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Best Match
                    </span>
                  )}
                </div>

                <select
                  id={`duel-select-${slot}`}
                  value={item.id}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    if (slot === 0) {
                      onChangeDuelIds([nextId, nextId === duelIds[1] ? duelIds[0] : duelIds[1]]);
                    } else {
                      onChangeDuelIds([nextId === duelIds[0] ? duelIds[1] : duelIds[0], nextId]);
                    }
                  }}
                  className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.category})
                    </option>
                  ))}
                </select>

                <div className="aspect-[4/3] rounded-lg overflow-hidden bg-slate-100">
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-blue-50 text-slate-700 p-4 text-center">
                      <ShoppingBag className="w-8 h-8 text-blue-600" />
                      <div className="text-sm font-semibold">{item.name}</div>
                    </div>
                  )}
                </div>

                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <div className="font-mono text-2xl font-bold text-slate-900 tabular-nums">
                      {formatPrice(net, currency)}
                    </div>
                    <div className="text-xs text-slate-500">
                      Best on {offer.storeName} · Save {savePct}% ({formatPrice(getMaxSavingsInr(item, location), currency)})
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenProduct(item)}
                    className="min-h-10 px-3 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
                  >
                    <span>All Platforms</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="text-xs text-slate-600 flex items-center justify-between pt-2 border-t border-slate-200 tabular-nums">
                  <span>{getPriceStatus(item)}</span>
                  <span>{worth}% Worth It</span>
                  <span>{offer.deliveryEta}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Comparison Matrix */}
        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 px-4 font-medium w-1/3">Comparison Metric</th>
                <th className="py-3 px-4 font-semibold text-slate-900 w-1/3">{productA.name}</th>
                <th className="py-3 px-4 font-semibold text-slate-900 w-1/3">{productB.name}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              <tr>
                <td className="py-3 px-4 text-slate-600">Net Price (After Coupon)</td>
                <td className={`py-3 px-4 font-mono font-semibold ${netA <= netB ? 'text-emerald-700' : 'text-slate-900'}`}>
                  {formatPrice(netA, currency)} ({offerA.storeName})
                </td>
                <td className={`py-3 px-4 font-mono font-semibold ${netB < netA ? 'text-emerald-700' : 'text-slate-900'}`}>
                  {formatPrice(netB, currency)} ({offerB.storeName})
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600">Best Coupon Code</td>
                <td className="py-3 px-4 font-mono text-xs text-blue-700">
                  {offerA.couponCode ? `${offerA.couponCode} (-${formatPrice(offerA.cashback, currency)})` : 'Auto applied'}
                </td>
                <td className="py-3 px-4 font-mono text-xs text-blue-700">
                  {offerB.couponCode ? `${offerB.couponCode} (-${formatPrice(offerB.cashback, currency)})` : 'Auto applied'}
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600">Discount vs. MRP</td>
                <td className="py-3 px-4 font-mono">
                  {savePctA}% off ({formatPrice(getMaxSavingsInr(productA, location), currency)})
                </td>
                <td className="py-3 px-4 font-mono">
                  {savePctB}% off ({formatPrice(getMaxSavingsInr(productB, location), currency)})
                </td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600">Delivery ETA</td>
                <td className="py-3 px-4">{offerA.deliveryEta}</td>
                <td className="py-3 px-4">{offerB.deliveryEta}</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-slate-600">Community Worth-It Pulse</td>
                <td className="py-3 px-4 font-medium">
                  {worthA}% Worth It ({productA.votes.worthIt + productA.votes.waitForDrop} votes)
                </td>
                <td className="py-3 px-4 font-medium">
                  {worthB}% Worth It ({productB.votes.worthIt + productB.votes.waitForDrop} votes)
                </td>
              </tr>
              {productA.specs.map((specA, idx) => {
                const specB = productB.specs[idx];
                return (
                  <tr key={specA.label}>
                    <td className="py-3 px-4 text-slate-600">Key Spec {idx + 1}</td>
                    <td className="py-3 px-4">
                      <span className="text-slate-500">{specA.label}:</span>{' '}
                      <span className="font-medium text-slate-900">{specA.value}</span>
                    </td>
                    <td className="py-3 px-4">
                      {specB ? (
                        <>
                          <span className="text-slate-500">{specB.label}:</span>{' '}
                          <span className="font-medium text-slate-900">{specB.value}</span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Social Tie-In */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="flex-1 space-y-1">
            <div className="text-sm font-semibold text-slate-900">
              Still undecided? Ask the community
            </div>
            <input
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder={`Optional question (e.g. "Which one is better value?")`}
              aria-label="Poll question for the community"
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={() => void handlePublishPoll()}
            className="min-h-10 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <MessageSquareShare className="w-4 h-4" />
            <span>{pollPublished ? 'Posted to Community Polls!' : 'Launch Community Poll'}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
