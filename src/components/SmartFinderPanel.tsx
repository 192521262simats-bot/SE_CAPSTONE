import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  MapPin,
  Search,
  Sparkles,
  Scale,
  X,
} from 'lucide-react';
import { INDIAN_PLATFORMS } from '../data/catalog';
import type {
  CityLocation,
  CurrencyCode,
  IndianPlatformId,
  Product,
  ShoppingPriority,
  SmartRecommendationResponse,
} from '../types/shop';
import { formatPrice, getBestOffer, getNetCost } from '../utils/pricing';
import { HeroMotionScene, SearchingMotionLoader } from './FunMotion';
import { LocationMapPicker } from './LocationMapPicker';

interface SmartFinderPanelProps {
  products: Product[];
  currency: CurrencyCode;
  priority: ShoppingPriority;
  location: CityLocation;
  searchQuery: string;
  maxBudgetInput: string;
  selectedPlatform: IndianPlatformId | 'all';
  searchingLive: boolean;
  searchError: string | null;
  onChangePriority: (priority: ShoppingPriority) => void;
  onChangeLocation: (location: CityLocation) => void;
  onSearchQueryChange: (q: string) => void;
  onMaxBudgetChange: (val: string) => void;
  onSelectPlatform: (platformId: IndianPlatformId | 'all') => void;
  onTriggerUniversalSearch: (queryOverride?: string) => Promise<void>;
  onClearSearch: () => void;
  onOpenProduct: (product: Product) => void;
  onStartDuelWith: (productAId: string, productBId?: string) => void;
}

const QUICK_SEARCH_EXAMPLES = [
  'iPhone 15',
  'Nike running shoes',
  'Philips air fryer',
  'MacBook Air',
  'Sunscreen SPF 50',
  'Amul Butter',
];

export function SmartFinderPanel({
  products,
  currency,
  priority,
  location,
  searchQuery,
  maxBudgetInput,
  selectedPlatform,
  searchingLive,
  searchError,
  onChangePriority,
  onChangeLocation,
  onSearchQueryChange,
  onMaxBudgetChange,
  onSelectPlatform,
  onTriggerUniversalSearch,
  onClearSearch,
  onOpenProduct,
  onStartDuelWith,
}: SmartFinderPanelProps) {
  const [locationEditorOpen, setLocationEditorOpen] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState(maxBudgetInput);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<SmartRecommendationResponse | null>(null);

  useEffect(() => {
    const draftDigits = budgetDraft.replace(/[^0-9]/g, '');
    if (maxBudgetInput !== draftDigits) {
      setBudgetDraft(maxBudgetInput);
    }
  }, [maxBudgetInput, budgetDraft]);

  async function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim() && maxBudgetInput) {
      document.getElementById('catalog-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    await onTriggerUniversalSearch();
  }

  async function handleAskRecommender() {
    const q = searchQuery.trim() || 'Best value deal right now across platforms';
    setAiLoading(true);
    setAiError(null);
    try {
      const parsedBudget = Number(maxBudgetInput);
      const budgetInr =
        parsedBudget > 0
          ? currency === 'USD'
            ? Math.round(parsedBudget * 84)
            : parsedBudget
          : undefined;

      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'finder',
          query: q,
          priority,
          budgetInr,
        }),
      });
      const data = (await res.json()) as {
        recommendation?: SmartRecommendationResponse;
        error?: string;
      };
      if (!res.ok || !data.recommendation) {
        setAiError(data.error ?? 'Could not generate recommendation.');
        setAiResult(null);
      } else {
        setAiResult(data.recommendation);
      }
    } catch {
      setAiError('Network error reaching recommendation service.');
      setAiResult(null);
    } finally {
      setAiLoading(false);
    }
  }

  const matchedProduct = aiResult
    ? products.find((p) => p.id === aiResult.recommendedProductId)
    : undefined;
  const altProduct = aiResult?.alternativeProductId
    ? products.find((p) => p.id === aiResult.alternativeProductId)
    : undefined;

  return (
    <section
      id="smart-finder"
      className="bg-white border border-slate-200 rounded-2xl p-6 md:p-8 space-y-6"
    >
      {/* Top Hero Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-7 space-y-3">
          <div className="text-xs font-medium text-blue-600 tracking-wide">
            All-Category Indian Price Comparison · Electronics, Fashion, Home, Beauty &amp; Groceries
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight leading-tight text-balance">
            Shop everything in one place. See prices &amp; coupons around you.
          </h1>
          <p className="text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
            Set your city or PIN, type your manual budget, and search any product—mobiles, laptops, shoes, kitchen gear, skincare, or daily essentials—to compare every Indian platform.
          </p>
        </div>

        <div className="lg:col-span-5">
          <HeroMotionScene />
        </div>
      </div>

      {/* Location Picker + Search + Manual Budget Bar */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          {/* Location Selector Button */}
          <div className="md:col-span-3 min-w-0 space-y-1">
            <span className="block text-[11px] font-medium text-slate-600">
              Delivery Pin &amp; Nearby Map
            </span>
            <button
              type="button"
              onClick={() => setLocationEditorOpen((v) => !v)}
              className="w-full h-11 px-3 bg-white border border-slate-300 hover:border-blue-500 rounded-lg text-sm font-medium text-slate-900 flex items-center justify-between gap-2 transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2 truncate">
                <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">
                  {location.city} ({location.pincode})
                </span>
              </span>
              <span className="text-xs text-blue-600 shrink-0">
                {locationEditorOpen ? 'Hide Map' : 'Map'}
              </span>
            </button>
          </div>

          {/* Search Input */}
          <div className="md:col-span-4 min-w-0 space-y-1">
            <label htmlFor="finder-query" className="block text-[11px] font-medium text-slate-600">
              Search Any Product (Everything)
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
              <input
                id="finder-query"
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                placeholder="iPhone, shoes, air fryer, milk, bag..."
                className="w-full h-11 pl-10 pr-9 bg-white border border-slate-300 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={onClearSearch}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Manual Max Budget Input */}
          <div className="md:col-span-3 min-w-0 space-y-1">
            <label htmlFor="manual-budget-input" className="block text-[11px] font-medium text-slate-600">
              Enter Max Budget ({currency === 'INR' ? '₹' : '$'})
            </label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-sm font-mono font-semibold text-slate-500 pointer-events-none select-none z-10">
                {currency === 'INR' ? '₹' : '$'}
              </span>
              <input
                id="manual-budget-input"
                name="maxBudget"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                value={budgetDraft}
                onChange={(e) => {
                  const raw = e.target.value;
                  const cleanDisplay = raw.replace(/[^0-9,]/g, '');
                  const digits = raw.replace(/[^0-9]/g, '');
                  setBudgetDraft(cleanDisplay);
                  onMaxBudgetChange(digits);
                }}
                placeholder="Type number e.g. 2500"
                className="w-full h-11 pl-8 pr-9 bg-white border border-slate-300 rounded-lg text-sm font-mono tabular-nums text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
              {budgetDraft && (
                <button
                  type="button"
                  onClick={() => {
                    setBudgetDraft('');
                    onMaxBudgetChange('');
                  }}
                  aria-label="Clear manual budget"
                  className="absolute right-2.5 top-3 z-10 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Search CTA */}
          <div className="md:col-span-2 min-w-0">
            <button
              type="submit"
              disabled={searchingLive}
              className="w-full h-11 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <span>{searchingLive ? 'Searching...' : 'Search Deals'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Interactive Google Maps Delivery Pin Picker & Nearby Stores */}
        {locationEditorOpen && (
          <LocationMapPicker
            location={location}
            onChangeLocation={onChangeLocation}
            onClose={() => setLocationEditorOpen(false)}
          />
        )}

        {/* Quick Search Chips & Quick Budget Shortcuts */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 mr-1">Popular searches:</span>
            {QUICK_SEARCH_EXAMPLES.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => {
                  onSearchQueryChange(sample);
                  void onTriggerUniversalSearch(sample);
                }}
                className="text-xs text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-md px-2.5 py-1 transition-colors cursor-pointer"
              >
                {sample}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500 mr-1">Quick budget:</span>
            {(currency === 'INR'
              ? [500, 2000, 10000, 25000, 60000]
              : [10, 30, 150, 300, 750]
            ).map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => {
                  setBudgetDraft(String(amt));
                  onMaxBudgetChange(String(amt));
                }}
                className={`text-[11px] font-mono tabular-nums px-2 py-1 rounded-md border transition-colors cursor-pointer ${
                  maxBudgetInput === String(amt)
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {currency === 'INR' ? `₹${amt.toLocaleString('en-IN')}` : `$${amt}`}
              </button>
            ))}
            {maxBudgetInput && Number(maxBudgetInput) > 0 && (
              <span className="text-xs font-medium text-emerald-700 tabular-nums ml-1">
                Active max: {currency === 'INR' ? '₹' : '$'}
                {Number(maxBudgetInput).toLocaleString('en-IN')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 11 Indian Platforms Live Availability Strip */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            Platforms delivering around{' '}
            <strong className="text-slate-900">
              {location.city} ({location.pincode})
            </strong>{' '}
            — click a platform to filter
          </span>
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'lowest-price', label: 'Lowest Net Price' },
                { id: 'fastest-delivery', label: 'Fastest Delivery' },
                { id: 'best-value', label: 'Best Value' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangePriority(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  priority === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-2">
          {INDIAN_PLATFORMS.map((plat) => {
            const isUnavailable = location.unavailablePlatforms.includes(plat.id);
            const isSelected = selectedPlatform === plat.id;
            return (
              <button
                key={plat.id}
                type="button"
                disabled={isUnavailable}
                onClick={() => onSelectPlatform(isSelected ? 'all' : plat.id)}
                style={
                  isUnavailable
                    ? undefined
                    : { backgroundColor: plat.bgHex, color: plat.textHex }
                }
                className={`rounded-xl px-2.5 py-2 text-left transition-transform cursor-pointer ${
                  isUnavailable
                    ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                    : isSelected
                      ? 'ring-2 ring-offset-2 ring-slate-900 -translate-y-0.5 shadow-sm'
                      : 'hover:-translate-y-0.5 shadow-xs'
                }`}
              >
                <div className="text-xs font-bold truncate">{plat.name}</div>
                <div className="text-[10px] opacity-90 truncate">
                  {isUnavailable ? 'Unavailable' : plat.defaultEta}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Fun Searching & Waiting Animation */}
      {(searchingLive || aiLoading) && (
        <SearchingMotionLoader query={searchQuery || 'best Indian deals'} />
      )}

      {/* Search or AI Errors */}
      {(searchError || aiError) && (
        <div
          role="alert"
          className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-4"
        >
          <span>{searchError ?? aiError}</span>
          <button
            type="button"
            onClick={() => setAiError(null)}
            className="text-xs font-medium text-rose-700 hover:underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Intelligent Recommendation Trigger */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
        <span className="text-xs text-slate-600">
          Want the single smartest pick for your budget and priority?
        </span>
        <button
          type="button"
          onClick={() => void handleAskRecommender()}
          disabled={aiLoading}
          className="min-h-9 px-4 py-1.5 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-400 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{aiLoading ? 'Thinking...' : 'Get Smart Recommendation'}</span>
        </button>
      </div>

      {/* Intelligent Recommendation Result */}
      {aiResult && matchedProduct && !aiLoading && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
          <div className="md:col-span-9 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
              <span className="text-emerald-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {aiResult.verdict}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="text-slate-700">Best on {aiResult.bestStoreName}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono text-slate-900 tabular-nums">
                {formatPrice(getNetCost(getBestOffer(matchedProduct, priority, location)), currency)} net
              </span>
            </div>

            <h2 className="text-lg font-bold text-slate-900">{aiResult.headline}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{aiResult.reasoning}</p>

            <ul className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {aiResult.highlights.slice(0, 3).map((item, idx) => (
                <li
                  key={idx}
                  className="text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-3 py-2"
                >
                  {item}
                </li>
              ))}
            </ul>

            {altProduct && aiResult.alternativeReason && (
              <p className="text-xs text-slate-500 pt-1">
                Runner-up: <strong className="text-slate-700">{altProduct.name}</strong> —{' '}
                {aiResult.alternativeReason}
              </p>
            )}
          </div>

          <div className="md:col-span-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => onOpenProduct(matchedProduct)}
              className="w-full min-h-10 px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              Compare All Platforms
            </button>
            <button
              type="button"
              onClick={() => onStartDuelWith(matchedProduct.id, altProduct?.id)}
              className="w-full min-h-10 px-4 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-800 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Duel Runner-Up</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
