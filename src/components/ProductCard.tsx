import { useState } from 'react';
import {
  Bell,
  BellRing,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Scale,
  ShoppingBag,
  Tag,
  ThumbsUp,
} from 'lucide-react';
import type { CityLocation, CurrencyCode, Product, ShoppingPriority } from '../types/shop';
import {
  formatPrice,
  getBestOffer,
  getMaxSavingsInr,
  getNetCost,
  getPriceStatus,
  getSavingsPercent,
  getSortedOffers,
  getWorthItPercent,
} from '../utils/pricing';

interface ProductCardProps {
  product: Product;
  currency: CurrencyCode;
  priority: ShoppingPriority;
  location: CityLocation;
  inDuel: boolean;
  inWatchlist: boolean;
  hasVoted: boolean;
  onOpenDetail: (product: Product) => void;
  onToggleDuel: (productId: string) => void;
  onToggleWatchlist: (product: Product) => void;
  onQuickVote: (productId: string) => void;
}

export function ProductCard({
  product,
  currency,
  priority,
  location,
  inDuel,
  inWatchlist,
  hasVoted,
  onOpenDetail,
  onToggleDuel,
  onToggleWatchlist,
  onQuickVote,
}: ProductCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const [showAllStores, setShowAllStores] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const sortedOffers = getSortedOffers(product, priority, location);
  const bestOffer = getBestOffer(product, priority, location);
  const netBest = getNetCost(bestOffer);
  const savingsInr = getMaxSavingsInr(product, location);
  const savingsPct = getSavingsPercent(product, location);
  const priceStatus = getPriceStatus(product);
  const worthItPct = getWorthItPercent(product);
  const inStockCount = sortedOffers.filter((o) => o.inStock).length;
  const visibleOffers = showAllStores ? sortedOffers : sortedOffers.slice(0, 3);

  function handleCopyCoupon(code: string) {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 1600);
  }

  return (
    <article className="group bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col transition-all duration-200 hover:shadow-md">
      {/* 4:3 Studio Image or Clean Product Visual Fallback */}
      <button
        type="button"
        onClick={() => onOpenDetail(product)}
        className="relative aspect-[4/3] w-full bg-slate-100 overflow-hidden text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
      >
        {product.image && !imgFailed ? (
          <img
            src={product.image}
            alt={`${product.name} product preview`}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2.5 bg-gradient-to-br from-slate-100 via-slate-50 to-blue-50 text-slate-700 p-6">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-blue-600">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div className="text-center space-y-0.5">
              <div className="text-xs font-medium text-slate-500">{product.brand}</div>
              <div className="text-sm font-semibold text-slate-900 line-clamp-2">
                {product.name}
              </div>
            </div>
          </div>
        )}
      </button>

      {/* Card Body */}
      <div className="p-5 flex-1 flex flex-col justify-between gap-4">
        <div className="space-y-3">
          {/* Unboxed metadata with typographic separators */}
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-medium text-slate-700">{product.category}</span>
              <span aria-hidden="true">·</span>
              <span>{inStockCount} stores ready</span>
              <span aria-hidden="true">·</span>
              <span className={priceStatus === '30-Day Low' ? 'text-emerald-700 font-medium' : 'text-slate-600'}>
                {priceStatus}
              </span>
            </div>
            <span className="tabular-nums font-medium text-slate-700 shrink-0">
              {product.rating.toFixed(1)} ★
            </span>
          </div>

          <div>
            <button
              type="button"
              onClick={() => onOpenDetail(product)}
              className="text-left block w-full focus-visible:outline-2 focus-visible:outline-blue-600 rounded cursor-pointer"
            >
              <h3 className="text-lg font-semibold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug">
                {product.name}
              </h3>
            </button>
            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mt-1">
              {product.tagline}
            </p>
          </div>

          {/* Best Price Headline */}
          <div className="flex items-baseline justify-between gap-2 pt-1">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                {formatPrice(netBest, currency)}
              </span>
              {savingsInr > 0 && (
                <span className="font-mono text-xs text-slate-400 line-through tabular-nums">
                  {formatPrice(product.msrp, currency)}
                </span>
              )}
            </div>
            <span className="text-xs font-medium text-emerald-700 tabular-nums text-right">
              Best on {bestOffer.storeName} · Save {savingsPct}%
            </span>
          </div>

          {/* Inline All-Platform Prices + Coupons Breakdown */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
              <span>Available stores &amp; coupons</span>
              <span>Final net price</span>
            </div>

            <div className="space-y-1.5">
              {visibleOffers.map((offer, idx) => {
                const net = getNetCost(offer);
                const isBest = idx === 0 && offer.inStock;
                return (
                  <div
                    key={`${product.id}-${offer.storeName}-${idx}`}
                    className={`rounded-lg px-2.5 py-2 border text-xs flex flex-col gap-1 ${
                      isBest
                        ? 'bg-emerald-50/70 border-emerald-200'
                        : offer.inStock
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-100/70 border-slate-200 opacity-60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-900">{offer.storeName}</span>
                        <span className="text-slate-400 mx-1" aria-hidden="true">·</span>
                        <span className="text-slate-600">{offer.deliveryEta}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 tabular-nums">
                        {offer.cashback > 0 && (
                          <span className="font-mono text-[11px] text-slate-400 line-through">
                            {formatPrice(offer.price, currency)}
                          </span>
                        )}
                        <span className="font-mono font-bold text-slate-900">
                          {offer.inStock ? formatPrice(net, currency) : 'N/A'}
                        </span>
                        {offer.inStock && (
                          <a
                            href={offer.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Open ${offer.storeName}`}
                            className="text-blue-600 hover:text-blue-800 p-0.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {offer.inStock && offer.couponCode && offer.cashback > 0 && (
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-emerald-700 flex items-center gap-1 truncate">
                          <Tag className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            Save {formatPrice(offer.cashback, currency)} · {offer.couponText}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyCoupon(offer.couponCode!)}
                          className="font-mono font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5 flex items-center gap-1 shrink-0 cursor-pointer"
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
                    )}
                  </div>
                );
              })}
            </div>

            {sortedOffers.length > 3 && (
              <button
                type="button"
                onClick={() => setShowAllStores((v) => !v)}
                className="w-full py-1 text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center justify-center gap-1 cursor-pointer"
              >
                {showAllStores ? (
                  <>
                    <span>Show fewer platforms</span>
                    <ChevronUp className="w-3.5 h-3.5" />
                  </>
                ) : (
                  <>
                    <span>Show all {sortedOffers.length} platforms</span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onOpenDetail(product)}
            className="flex-1 min-h-10 px-3 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Price Radar &amp; Verdict
          </button>

          <button
            type="button"
            onClick={() => onQuickVote(product.id)}
            disabled={hasVoted}
            title={hasVoted ? 'You voted Worth It' : 'Vote Worth It'}
            className={`min-h-10 px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
              hasVoted
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <ThumbsUp className="w-3.5 h-3.5" />
            <span className="tabular-nums">{worthItPct}%</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleDuel(product.id)}
            title={inDuel ? 'Remove from Deal Duel' : 'Add to Deal Duel'}
            className={`min-h-10 px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer ${
              inDuel
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {inDuel ? <Check className="w-3.5 h-3.5" /> : <Scale className="w-3.5 h-3.5" />}
            <span>Duel</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleWatchlist(product)}
            aria-label={inWatchlist ? `Remove ${product.name} from watchlist` : `Watch ${product.name} price`}
            title={inWatchlist ? 'Watching price' : 'Set price alert'}
            className={`min-h-10 min-w-10 flex items-center justify-center rounded-lg border transition-colors shrink-0 cursor-pointer ${
              inWatchlist
                ? 'bg-amber-50 border-amber-200 text-amber-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {inWatchlist ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </article>
  );
}
