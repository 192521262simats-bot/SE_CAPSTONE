import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Loader2, SlidersHorizontal } from 'lucide-react';
import {
  INDIAN_LOCATIONS,
  INITIAL_POLLS,
  INITIAL_PRODUCTS,
  INITIAL_SAVERS,
} from './data/catalog';
import type {
  CityLocation,
  CommunityPoll,
  CurrencyCode,
  IndianPlatformId,
  Product,
  SaverProfile,
  ShoppingPriority,
  WatchlistItem,
} from './types/shop';
import { normalizeCityLocation } from './utils/location';
import {
  formatPrice,
  getBestNetPriceInr,
  getMaxSavingsInr,
  getWorthItPercent,
} from './utils/pricing';
import { SmartFinderPanel } from './components/SmartFinderPanel';
import { ProductCard } from './components/ProductCard';
import { ProductDetailModal } from './components/ProductDetailModal';
import { DealDuelView } from './components/DealDuelView';
import { CommunityHubView } from './components/CommunityHubView';
import { WatchlistView } from './components/WatchlistView';
import { AiAssistantView } from './components/AiAssistantView';

type ActiveTab = 'discover' | 'duel' | 'community' | 'watchlist' | 'assistant';
type CategoryFilter = 'All' | Product['category'];
type SortOption = 'biggest-savings' | 'lowest-price' | 'community-score';

const CATEGORIES: CategoryFilter[] = [
  'All',
  'Electronics',
  'Fashion',
  'Home & Kitchen',
  'Beauty & Care',
  'Groceries',
  'Study & Gear',
];

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('discover');
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [priority, setPriority] = useState<ShoppingPriority>('lowest-price');
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);
  const [location, setLocation] = useState<CityLocation>(() => {
    try {
      const saved = localStorage.getItem('savvycart_location_v1');
      if (saved) return normalizeCityLocation(JSON.parse(saved) as Partial<CityLocation>);
    } catch {
      // ignore
    }
    return INDIAN_LOCATIONS[0];
  });
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [selectedPlatform, setSelectedPlatform] = useState<IndianPlatformId | 'all'>('all');

  const [searchQuery, setSearchQuery] = useState('');
  const [maxBudgetInput, setMaxBudgetInput] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('biggest-savings');

  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [dynamicResults, setDynamicResults] = useState<Product[]>([]);
  const [activeSearchLabel, setActiveSearchLabel] = useState<string | null>(null);
  const [searchingLive, setSearchingLive] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [polls, setPolls] = useState<CommunityPoll[]>(INITIAL_POLLS);
  const [savers, setSavers] = useState<SaverProfile[]>(INITIAL_SAVERS);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [duelIds, setDuelIds] = useState<[string, string]>([
    INITIAL_PRODUCTS[0].id,
    INITIAL_PRODUCTS[1].id,
  ]);

  const [watchlist, setWatchlist] = useState<WatchlistItem[]>(() => {
    try {
      const saved = localStorage.getItem('savvycart_watchlist_v2');
      if (saved) return JSON.parse(saved) as WatchlistItem[];
    } catch {
      // ignore
    }
    return [
      {
        productId: INITIAL_PRODUCTS[0].id,
        targetPriceInr: 55000,
        addedAt: 'Today',
      },
    ];
  });

  const [userProductVotes, setUserProductVotes] = useState<
    Record<string, 'worthIt' | 'waitForDrop'>
  >(() => {
    try {
      const saved = localStorage.getItem('savvycart_product_votes');
      return saved ? (JSON.parse(saved) as Record<string, 'worthIt' | 'waitForDrop'>) : {};
    } catch {
      return {};
    }
  });

  const [votedPolls, setVotedPolls] = useState<Record<string, 'A' | 'B'>>(() => {
    try {
      const saved = localStorage.getItem('savvycart_poll_votes');
      return saved ? (JSON.parse(saved) as Record<string, 'A' | 'B'>) : {};
    } catch {
      return {};
    }
  });

  const [userDealIq, setUserDealIq] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('savvycart_deal_iq');
      return saved ? Number(saved) : 120;
    } catch {
      return 120;
    }
  });

  useEffect(() => {
    const onQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  useEffect(() => {
    localStorage.setItem('savvycart_location_v1', JSON.stringify(location));
  }, [location]);

  useEffect(() => {
    localStorage.setItem('savvycart_watchlist_v2', JSON.stringify(watchlist));
  }, [watchlist]);

  useEffect(() => {
    localStorage.setItem('savvycart_product_votes', JSON.stringify(userProductVotes));
  }, [userProductVotes]);

  useEffect(() => {
    localStorage.setItem('savvycart_poll_votes', JSON.stringify(votedPolls));
  }, [votedPolls]);

  useEffect(() => {
    localStorage.setItem('savvycart_deal_iq', String(userDealIq));
  }, [userDealIq]);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const [prodRes, commRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/community'),
        ]);
        if (prodRes.ok) {
          const prodJson = (await prodRes.json()) as { products?: Product[] };
          if (active && Array.isArray(prodJson.products) && prodJson.products.length > 0) {
            setProducts(prodJson.products);
          }
        }
        if (commRes.ok) {
          const commJson = (await commRes.json()) as {
            polls?: CommunityPoll[];
            savers?: SaverProfile[];
          };
          if (active && Array.isArray(commJson.polls)) setPolls(commJson.polls);
          if (active && Array.isArray(commJson.savers)) setSavers(commJson.savers);
        }
      } catch {
        // Keep seeded initial state if offline
      } finally {
        if (active) setLoadingCatalog(false);
      }
    }
    void loadData();
    return () => {
      active = false;
    };
  }, []);

  const allProducts = useMemo(() => {
    const map = new Map<string, Product>();
    for (const p of dynamicResults) map.set(p.id, p);
    for (const p of products) {
      if (!map.has(p.id)) map.set(p.id, p);
    }
    return Array.from(map.values());
  }, [dynamicResults, products]);

  const maxBudgetInrNumeric = useMemo(() => {
    const val = Number(maxBudgetInput);
    if (!val || val <= 0) return null;
    return currency === 'USD' ? Math.round(val * 84) : val;
  }, [maxBudgetInput, currency]);

  const filteredProducts = useMemo(() => {
    const tokens = searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length >= 2);

    const list = allProducts.filter((p) => {
      const matchesCat = categoryFilter === 'All' || p.category === categoryFilter;
      const matchesPlatform =
        selectedPlatform === 'all' ||
        p.offers.some(
          (o) =>
            o.storeId === selectedPlatform &&
            !location.unavailablePlatforms.includes(selectedPlatform) &&
            o.inStock
        );

      const bestNetInr = getBestNetPriceInr(p, location);
      const matchesBudget = maxBudgetInrNumeric === null || bestNetInr <= maxBudgetInrNumeric;

      const haystack = [p.name, p.brand, p.category, p.tagline, ...(p.keywords ?? [])]
        .join(' ')
        .toLowerCase();

      const matchesQuery =
        tokens.length === 0 ||
        p.isDynamicSearch ||
        tokens.every((tok) => haystack.includes(tok));

      return matchesCat && matchesPlatform && matchesBudget && matchesQuery;
    });

    return [...list].sort((a, b) => {
      if (a.isDynamicSearch && !b.isDynamicSearch) return -1;
      if (!a.isDynamicSearch && b.isDynamicSearch) return 1;

      if (sortBy === 'lowest-price') {
        return getBestNetPriceInr(a, location) - getBestNetPriceInr(b, location);
      }
      if (sortBy === 'community-score') {
        return getWorthItPercent(b) - getWorthItPercent(a);
      }
      return getMaxSavingsInr(b, location) - getMaxSavingsInr(a, location);
    });
  }, [
    allProducts,
    categoryFilter,
    selectedPlatform,
    location,
    maxBudgetInrNumeric,
    searchQuery,
    sortBy,
  ]);

  const selectedProduct = useMemo(
    () => allProducts.find((p) => p.id === selectedProductId) ?? null,
    [allProducts, selectedProductId]
  );

  const totalCatalogSavingsInr = useMemo(
    () => products.reduce((sum, p) => sum + getMaxSavingsInr(p, location), 0),
    [products, location]
  );

  function addDealIq(points: number) {
    setUserDealIq((prev) => prev + points);
  }

  async function handleUniversalSearch(queryOverride?: string) {
    const activeQ = (queryOverride ?? searchQuery).trim();
    if (!activeQ) {
      setDynamicResults([]);
      setActiveSearchLabel(null);
      setSearchError(null);
      return;
    }

    setSearchingLive(true);
    setSearchError(null);
    setCategoryFilter('All');

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: activeQ,
          maxBudgetInr: maxBudgetInrNumeric ?? undefined,
          city: location.city,
          pincode: location.pincode,
        }),
      });
      const data = (await res.json()) as { products?: Product[]; error?: string };
      if (!res.ok || !data.products) {
        setSearchError(data.error ?? 'Could not search Indian platforms right now.');
      } else {
        setDynamicResults(data.products);
        setActiveSearchLabel(activeQ);
        setProducts((prev) => {
          const fresh = data.products!;
          const existingIds = new Set(fresh.map((f) => f.id));
          return [...fresh, ...prev.filter((p) => !existingIds.has(p.id) && !p.isDynamicSearch)];
        });
        addDealIq(10);
      }
    } catch {
      setSearchError('Network error while searching Indian platforms.');
    } finally {
      setSearchingLive(false);
    }
  }

  function handleClearSearch() {
    setSearchQuery('');
    setDynamicResults([]);
    setActiveSearchLabel(null);
    setSearchError(null);
  }

  async function handleProductVote(productId: string, voteType: 'worthIt' | 'waitForDrop') {
    if (userProductVotes[productId]) return;
    setUserProductVotes((prev) => ({ ...prev, [productId]: voteType }));
    addDealIq(10);

    try {
      const res = await fetch(`/api/products/${productId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voteType }),
      });
      if (res.ok) {
        const data = (await res.json()) as { product: Product };
        setProducts((prev) => prev.map((p) => (p.id === productId ? data.product : p)));
        setDynamicResults((prev) => prev.map((p) => (p.id === productId ? data.product : p)));
      }
    } catch {
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? { ...p, votes: { ...p.votes, [voteType]: p.votes[voteType] + 1 } }
            : p
        )
      );
    }
  }

  async function handleAddNote(
    productId: string,
    author: string,
    storeName: string,
    text: string
  ): Promise<boolean> {
    if (text.trim().length < 4) return false;
    try {
      const res = await fetch(`/api/products/${productId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, storeName, text }),
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { product: Product };
      setProducts((prev) => prev.map((p) => (p.id === productId ? data.product : p)));
      setDynamicResults((prev) => prev.map((p) => (p.id === productId ? data.product : p)));
      addDealIq(20);
      return true;
    } catch {
      return false;
    }
  }

  async function handleHelpfulNote(productId: string, noteId: string) {
    try {
      const res = await fetch(`/api/products/${productId}/notes/${noteId}/helpful`, {
        method: 'POST',
      });
      if (res.ok) {
        const data = (await res.json()) as { product: Product };
        setProducts((prev) => prev.map((p) => (p.id === productId ? data.product : p)));
        setDynamicResults((prev) => prev.map((p) => (p.id === productId ? data.product : p)));
      }
    } catch {
      // ignore
    }
  }

  async function handleVotePoll(pollId: string, choice: 'A' | 'B') {
    if (votedPolls[pollId]) return;
    setVotedPolls((prev) => ({ ...prev, [pollId]: choice }));
    addDealIq(15);

    try {
      const res = await fetch(`/api/community/polls/${pollId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      });
      if (res.ok) {
        const data = (await res.json()) as { poll: CommunityPoll };
        setPolls((prev) => prev.map((p) => (p.id === pollId ? data.poll : p)));
      }
    } catch {
      setPolls((prev) =>
        prev.map((p) =>
          p.id === pollId
            ? {
                ...p,
                votesA: choice === 'A' ? p.votesA + 1 : p.votesA,
                votesB: choice === 'B' ? p.votesB + 1 : p.votesB,
              }
            : p
        )
      );
    }
  }

  async function handleCreatePoll(
    optionAId: string,
    optionBId: string,
    question: string,
    context: string
  ) {
    try {
      const res = await fetch('/api/community/polls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          optionAId,
          optionBId,
          question,
          context,
          author: 'You',
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as { poll: CommunityPoll };
        setPolls((prev) => [data.poll, ...prev]);
        addDealIq(25);
      }
    } catch {
      // ignore
    }
  }

  function handleToggleDuel(productId: string) {
    setDuelIds(([a, b]) => {
      if (a === productId || b === productId) {
        const fallback = allProducts.find((p) => p.id !== a && p.id !== b)?.id ?? a;
        return a === productId ? [b, fallback] : [a, fallback];
      }
      addDealIq(5);
      return [b, productId];
    });
  }

  function handleStartDuelWith(productAId: string, productBId?: string) {
    const second =
      productBId && productBId !== productAId
        ? productBId
        : (allProducts.find((p) => p.id !== productAId)?.id ?? allProducts[0].id);
    setDuelIds([productAId, second]);
    setActiveTab('duel');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleToggleWatchlist(product: Product) {
    setWatchlist((prev) => {
      const exists = prev.some((item) => item.productId === product.id);
      if (exists) {
        return prev.filter((item) => item.productId !== product.id);
      }
      const best = getBestNetPriceInr(product, location);
      addDealIq(10);
      return [
        {
          productId: product.id,
          targetPriceInr: Math.round(best * 0.95),
          addedAt: 'Just now',
          productSnapshot: product,
        },
        ...prev,
      ];
    });
  }

  function handleSaveWatchTarget(product: Product, targetPriceInr: number) {
    setWatchlist((prev) => {
      const exists = prev.some((w) => w.productId === product.id);
      if (exists) {
        return prev.map((w) =>
          w.productId === product.id ? { ...w, targetPriceInr, productSnapshot: product } : w
        );
      }
      return [
        { productId: product.id, targetPriceInr, addedAt: 'Just now', productSnapshot: product },
        ...prev,
      ];
    });
  }

  function handleFocusSmartFinder() {
    setActiveTab('discover');
    setTimeout(() => {
      const el = document.getElementById('finder-query');
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.focus();
    }, 50);
  }

  const duelProductA = allProducts.find((p) => p.id === duelIds[0]);
  const duelProductB = allProducts.find((p) => p.id === duelIds[1]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* 3-Zone Single-Row Top Bar Contract */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('discover');
            }}
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            SavvyCart
          </a>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            {(
              [
                { id: 'discover', label: 'Discover' },
                { id: 'duel', label: 'Deal Duel' },
                { id: 'community', label: 'Community' },
                { id: 'watchlist', label: `Watchlist (${watchlist.length})` },
                { id: 'assistant', label: 'AI Assistant' },
              ] as const
            ).map((navItem) => {
              const isActive = activeTab === navItem.id;
              return (
                <button
                  key={navItem.id}
                  type="button"
                  onClick={() => setActiveTab(navItem.id)}
                  className={`py-5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'border-blue-600 text-slate-900 font-semibold'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {navItem.label}
                </button>
              );
            })}
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleFocusSmartFinder}
              className="min-h-10 px-4 py-2 bg-slate-900 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Search Deals
            </button>
          </div>
        </div>

        {/* Mobile navigation row (< md) */}
        <nav
          aria-label="Mobile navigation"
          className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center justify-between gap-2 overflow-x-auto"
        >
          {(
            [
              { id: 'discover', label: 'Discover' },
              { id: 'duel', label: 'Deal Duel' },
              { id: 'community', label: 'Community' },
              { id: 'watchlist', label: `Watch (${watchlist.length})` },
              { id: 'assistant', label: 'AI Assistant' },
            ] as const
          ).map((navItem) => (
            <button
              key={navItem.id}
              type="button"
              onClick={() => setActiveTab(navItem.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === navItem.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {navItem.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Main Content */}
      <main id="top" className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Workspace Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-2">
            <span>11 Indian platforms</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums font-medium text-emerald-700">
              {formatPrice(totalCatalogSavingsInr, currency)} total savings spotted around {location.city}
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">Your Deal IQ: {userDealIq} pts</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500">Currency:</span>
            <div className="inline-flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-lg">
              {(['INR', 'USD'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setCurrency(code)}
                  className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-colors cursor-pointer ${
                    currency === code
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {code === 'INR' ? '₹ INR' : '$ USD'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {activeTab === 'discover' && (
          <>
            <SmartFinderPanel
              products={allProducts}
              currency={currency}
              priority={priority}
              location={location}
              searchQuery={searchQuery}
              maxBudgetInput={maxBudgetInput}
              selectedPlatform={selectedPlatform}
              searchingLive={searchingLive}
              searchError={searchError}
              onChangePriority={setPriority}
              onChangeLocation={setLocation}
              onSearchQueryChange={setSearchQuery}
              onMaxBudgetChange={setMaxBudgetInput}
              onSelectPlatform={setSelectedPlatform}
              onTriggerUniversalSearch={handleUniversalSearch}
              onClearSearch={handleClearSearch}
              onOpenProduct={(p) => setSelectedProductId(p.id)}
              onStartDuelWith={handleStartDuelWith}
            />

            {/* Deal Duel Quick Strip */}
            {duelProductA && duelProductB && (
              <div className="bg-white border border-slate-200 rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4">
                <div className="text-sm text-slate-700 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">Ready to Duel:</span>
                  <span>{duelProductA.name}</span>
                  <span className="text-slate-400">vs.</span>
                  <span>{duelProductB.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('duel')}
                  className="min-h-9 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <span>Open Deal Duel</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Catalog Filter & Results */}
            <section id="catalog-results" className="space-y-5 min-h-[420px]">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl overflow-x-auto">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        categoryFilter === cat
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {activeSearchLabel && (
                    <span className="text-xs text-blue-700 font-medium">
                      Live results for &ldquo;{activeSearchLabel}&rdquo;
                    </span>
                  )}
                  {selectedPlatform !== 'all' && (
                    <button
                      type="button"
                      onClick={() => setSelectedPlatform('all')}
                      className="text-xs text-slate-600 hover:text-slate-900 underline cursor-pointer"
                    >
                      Clear platform filter
                    </button>
                  )}
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                      aria-label="Sort products"
                      className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-600"
                    >
                      <option value="biggest-savings">Biggest Savings</option>
                      <option value="lowest-price">Lowest Net Price</option>
                      <option value="community-score">Highest Worth-It %</option>
                    </select>
                  </div>
                </div>
              </div>

              {loadingCatalog ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 flex items-center justify-center gap-3 text-sm text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Loading Indian multi-platform catalog...</span>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
                  <p className="text-base font-semibold text-slate-900">
                    No catalog products matched
                    {searchQuery.trim() ? ` "${searchQuery}"` : ''}
                    {maxBudgetInrNumeric ? ` under ${formatPrice(maxBudgetInrNumeric, currency)}` : ''}
                  </p>
                  <p className="text-sm text-slate-500 max-w-md mx-auto">
                    Click &ldquo;Search Deals&rdquo; above to find live prices across all 11 Indian platforms for any item, or reset your filters.
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    {searchQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => void handleUniversalSearch()}
                        className="px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg cursor-pointer"
                      >
                        Search &ldquo;{searchQuery}&rdquo; Live
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFilter('All');
                        setSelectedPlatform('all');
                        setMaxBudgetInput('');
                        handleClearSearch();
                      }}
                      className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg cursor-pointer"
                    >
                      Reset Filters
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      currency={currency}
                      priority={priority}
                      location={location}
                      inDuel={duelIds.includes(product.id)}
                      inWatchlist={watchlist.some((w) => w.productId === product.id)}
                      hasVoted={Boolean(userProductVotes[product.id])}
                      onOpenDetail={(p) => setSelectedProductId(p.id)}
                      onToggleDuel={handleToggleDuel}
                      onToggleWatchlist={handleToggleWatchlist}
                      onQuickVote={(id) => void handleProductVote(id, 'worthIt')}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}

        {activeTab === 'duel' && (
          <DealDuelView
            products={allProducts}
            duelIds={duelIds}
            currency={currency}
            priority={priority}
            location={location}
            onChangeDuelIds={setDuelIds}
            onOpenProduct={(p) => setSelectedProductId(p.id)}
            onCreatePollFromDuel={async (a, b, q) => {
              await handleCreatePoll(
                a.id,
                b.id,
                q,
                `Comparing ${a.name} vs ${b.name} from Deal Duel.`
              );
            }}
          />
        )}

        {activeTab === 'community' && (
          <CommunityHubView
            products={allProducts}
            polls={polls}
            savers={savers}
            currency={currency}
            location={location}
            userDealIq={userDealIq}
            votedPolls={votedPolls}
            onVotePoll={handleVotePoll}
            onCreatePoll={handleCreatePoll}
            onOpenProduct={(p) => setSelectedProductId(p.id)}
          />
        )}

        {activeTab === 'watchlist' && (
          <WatchlistView
            products={allProducts}
            watchlist={watchlist}
            currency={currency}
            location={location}
            onUpdateTarget={handleSaveWatchTarget}
            onRemoveWatch={(id) =>
              setWatchlist((prev) => prev.filter((item) => item.productId !== id))
            }
            onOpenProduct={(p) => setSelectedProductId(p.id)}
          />
        )}

        {activeTab === 'assistant' && (
          <AiAssistantView
            products={allProducts}
            location={location}
            maxBudgetInr={maxBudgetInrNumeric}
            currency={currency}
            onOpenProduct={(p) => setSelectedProductId(p.id)}
          />
        )}
      </main>

      {/* Clean Editorial Footer */}
      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            <span className="font-semibold text-slate-800">SavvyCart</span> — Multi-Store Product
            Price Comparison &amp; Intelligent Shopping Recommendation System
          </div>
          <div>
            Guided by Charlin Pushpa Latha G · Presented by Padmasree D &amp; Shobana T
          </div>
        </div>
      </footer>

      {/* Multi-Store Comparison & Smart Verdict Modal */}
      {selectedProduct && (
        <ProductDetailModal
          product={selectedProduct}
          currency={currency}
          priority={priority}
          location={location}
          watchItem={watchlist.find((w) => w.productId === selectedProduct.id)}
          userVote={userProductVotes[selectedProduct.id]}
          inDuel={duelIds.includes(selectedProduct.id)}
          onClose={() => setSelectedProductId(null)}
          onVote={handleProductVote}
          onAddNote={handleAddNote}
          onHelpfulNote={handleHelpfulNote}
          onSaveWatchTarget={handleSaveWatchTarget}
          onToggleDuel={handleToggleDuel}
        />
      )}
    </div>
  );
}
