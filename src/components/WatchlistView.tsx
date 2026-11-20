import { useState } from 'react';
import { BellRing, CheckCircle2, RefreshCw, ShoppingBag, Trash2 } from 'lucide-react';
import type { CityLocation, CurrencyCode, Product, WatchlistItem } from '../types/shop';
import { formatPrice, getBestOffer, getNetCost } from '../utils/pricing';

interface WatchlistViewProps {
  products: Product[];
  watchlist: WatchlistItem[];
  currency: CurrencyCode;
  location: CityLocation;
  onUpdateTarget: (product: Product, targetPriceInr: number) => void;
  onRemoveWatch: (productId: string) => void;
  onOpenProduct: (product: Product) => void;
}

export function WatchlistView({
  products,
  watchlist,
  currency,
  location,
  onUpdateTarget,
  onRemoveWatch,
  onOpenProduct,
}: WatchlistViewProps) {
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const watchedEntries = watchlist
    .map((item) => {
      const product = products.find((p) => p.id === item.productId) ?? item.productSnapshot;
      if (!product) return null;
      return { item, product };
    })
    .filter((entry): entry is { item: WatchlistItem; product: Product } => entry !== null);

  function handleCheckNow() {
    setLastChecked(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
  }

  return (
    <section className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-slate-900">Price Watchlist &amp; Alerts</h2>
          <p className="text-sm text-slate-600">
            Track your target prices across Indian platforms. Adjust any slider to fine-tune when to buy.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {lastChecked && (
            <span className="text-xs text-slate-500">Checked at {lastChecked}</span>
          )}
          <button
            type="button"
            onClick={handleCheckNow}
            className="min-h-10 px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Check Store Quotes</span>
          </button>
        </div>
      </div>

      {watchedEntries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <BellRing className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-lg font-semibold text-slate-900">Your price watchlist is empty</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Click the bell icon on any product card or set a custom Price Target slider inside a comparison view.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {watchedEntries.map(({ item, product }) => {
            const bestOffer = getBestOffer(product, 'lowest-price', location);
            const currentNet = getNetCost(bestOffer);
            const targetMet = currentNet <= item.targetPriceInr;
            const diff = currentNet - item.targetPriceInr;
            const minSlider = Math.max(20, Math.round(currentNet * 0.72));
            const maxSlider = Math.max(currentNet + 50, product.msrp);

            return (
              <article
                key={product.id}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-4"
              >
                <div className="flex items-start gap-4">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      referrerPolicy="no-referrer"
                      className="w-24 h-20 rounded-lg object-cover bg-slate-100 shrink-0"
                    />
                  ) : (
                    <div className="w-24 h-20 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-blue-600 shrink-0">
                      <ShoppingBag className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onOpenProduct(product)}
                        className="text-base font-semibold text-slate-900 hover:text-blue-600 truncate text-left cursor-pointer"
                      >
                        {product.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveWatch(product.id)}
                        aria-label={`Remove ${product.name} from watchlist`}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="text-xs text-slate-500">
                      Best now: <strong className="font-mono text-slate-900 tabular-nums">{formatPrice(currentNet, currency)}</strong> on {bestOffer.storeName}
                    </div>

                    <div className="text-xs font-medium flex items-center gap-1.5 pt-1">
                      {targetMet ? (
                        <span className="text-emerald-700 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Target Met — Ready to Buy
                        </span>
                      ) : (
                        <span className="text-amber-700 tabular-nums">
                          Waiting · {formatPrice(diff, currency)} above your target
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-600">Target Alert Price</span>
                    <div className="relative w-28">
                      <span className="absolute left-2 top-1 text-xs font-mono text-slate-500 pointer-events-none">
                        {currency === 'INR' ? '₹' : '$'}
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`Type target price for ${product.name}`}
                        value={
                          currency === 'USD'
                            ? Math.round(item.targetPriceInr / 84)
                            : item.targetPriceInr
                        }
                        onChange={(e) => {
                          const digits = e.target.value.replace(/[^0-9]/g, '');
                          const num = digits ? Number(digits) : 0;
                          onUpdateTarget(product, currency === 'USD' ? num * 84 : num);
                        }}
                        className="w-full h-7 pl-5 pr-2 bg-white border border-slate-200 rounded-md text-xs font-mono font-semibold text-blue-600 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                  <input
                    type="range"
                    min={minSlider}
                    max={maxSlider}
                    value={Math.min(maxSlider, Math.max(minSlider, item.targetPriceInr))}
                    aria-label={`Target price slider for ${product.name}`}
                    onChange={(e) => onUpdateTarget(product, Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">Added {item.addedAt}</span>
                  <button
                    type="button"
                    onClick={() => onOpenProduct(product)}
                    className="min-h-9 px-3 py-1.5 bg-slate-900 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors cursor-pointer"
                  >
                    Compare All Platforms
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
