import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel, Type } from '@google/genai';
import { WebSocketServer, type WebSocket } from 'ws';
import { INITIAL_POLLS, INITIAL_PRODUCTS, INITIAL_SAVERS } from './src/data/catalog';
import type {
  ChatRouteLabel,
  CommunityPoll,
  NearbyStorePlace,
  Product,
  ProductCategory,
  ShoppingPriority,
} from './src/types/shop';

const PORT = 3000;
const STATE_FILE = path.resolve(process.cwd(), '.savvycart-state.json');
const STATE_VERSION = 3;

interface PersistedState {
  version: number;
  products: Product[];
  polls: CommunityPoll[];
}

function loadState(): PersistedState {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as PersistedState;
      if (
        parsed.version === STATE_VERSION &&
        Array.isArray(parsed.products) &&
        Array.isArray(parsed.polls)
      ) {
        return parsed;
      }
    }
  } catch {
    // Fall back to fresh seed data if unreadable or outdated version
  }
  return {
    version: STATE_VERSION,
    products: structuredClone(INITIAL_PRODUCTS),
    polls: structuredClone(INITIAL_POLLS),
  };
}

function saveState(state: PersistedState): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Non-fatal in read-only environments
  }
}

let state: PersistedState = loadState();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getMapsApiKey(): string {
  const key =
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.MAPS_API_KEY ||
    '';
  if (!key || key === 'MY_GOOGLE_MAPS_API_KEY') return '';
  return key;
}

function selectChatRoute(prompt: string): {
  model: string;
  thinkingLevel: ThinkingLevel;
  routeLabel: ChatRouteLabel;
} {
  const lower = prompt.toLowerCase();
  const wordCount = prompt.trim().split(/\s+/).filter(Boolean).length;

  const deepKeywords = [
    'compare',
    'comparison',
    'vs',
    'versus',
    'pros and cons',
    'worth it',
    'wait for drop',
    '30-day',
    'analyze',
    'analysis',
    'long-term',
    'value for money',
    'breakdown',
    'difference between',
  ];
  if (deepKeywords.some((k) => lower.includes(k)) || wordCount >= 26) {
    return {
      model: 'gemini-4-hydrogen',
      thinkingLevel: ThinkingLevel.MEDIUM,
      routeLabel: 'Deep Analysis',
    };
  }

  const plannerKeywords = [
    'budget',
    'combo',
    'bundle',
    'under ',
    'within ',
    'gift',
    'list',
    'setup',
    'multiple',
    'plan',
    'recommend a few',
  ];
  if (plannerKeywords.some((k) => lower.includes(k)) || wordCount >= 14) {
    return {
      model: 'gemini-4-hydrogen',
      thinkingLevel: ThinkingLevel.LOW,
      routeLabel: 'Smart Planner',
    };
  }

  const quickKeywords = ['coupon', 'code', 'eta', 'delivery', 'stock', 'price of', 'how much'];
  if (wordCount <= 8 || quickKeywords.some((k) => lower.includes(k))) {
    return {
      model: 'gemini-3.1-flash-lite',
      thinkingLevel: ThinkingLevel.MINIMAL,
      routeLabel: 'Quick Deal Reply',
    };
  }

  return {
    model: 'gemini-4-hydrogen',
    thinkingLevel: ThinkingLevel.LOW,
    routeLabel: 'General Advisor',
  };
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function extractCityAndPinFromComponents(
  components: Array<{ longText?: string; shortText?: string; types?: string[] }> = [],
  formattedAddress = ''
): { city: string; neighborhood: string; pincode: string } {
  let city = '';
  let neighborhood = '';
  let pincode = '';

  for (const comp of components) {
    const types = comp.types ?? [];
    if (!pincode && types.includes('postal_code')) {
      pincode = comp.longText || comp.shortText || '';
    }
    if (!city && types.includes('locality')) {
      city = comp.longText || comp.shortText || '';
    }
    if (
      !neighborhood &&
      (types.includes('sublocality_level_1') ||
        types.includes('sublocality') ||
        types.includes('neighborhood'))
    ) {
      neighborhood = comp.longText || comp.shortText || '';
    }
    if (!city && types.includes('administrative_area_level_2')) {
      city = comp.longText || comp.shortText || '';
    }
  }

  if (!pincode) {
    const m = formattedAddress.match(/\b([1-8]\d{5})\b/);
    if (m) pincode = m[1];
  }

  return { city: city || neighborhood || 'Selected Location', neighborhood, pincode };
}

async function generateWithRetry(
  ai: GoogleGenAI,
  params: {
    contents: string;
    systemInstruction: string;
    responseSchema: Record<string, unknown>;
  }
): Promise<string> {
  const models: Array<{ name: string; level: ThinkingLevel }> = [
    { name: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL },
    { name: 'gemini-4-hydrogen', level: ThinkingLevel.LOW },
  ];

  let lastError: unknown;
  for (let i = 0; i < models.length; i++) {
    const attempt = models[i];
    try {
      const response = await ai.models.generateContent({
        model: attempt.name,
        contents: params.contents,
        config: {
          systemInstruction: params.systemInstruction,
          thinkingConfig: { thinkingLevel: attempt.level },
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema,
        },
      });
      if (response.text) {
        return response.text;
      }
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isTransient =
        msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('429');
      if (!isTransient && i === 0) {
        throw err;
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Gemini model temporarily unavailable.');
}

function formatCatalogContext(products: Product[]): string {
  return products
    .slice(0, 14)
    .map((p) => {
      const inStockOffers = p.offers.filter((o) => o.inStock);
      const sorted = [...inStockOffers].sort(
        (a, b) => a.price + a.shipping - a.cashback - (b.price + b.shipping - b.cashback)
      );
      const best = sorted[0];
      const netBest = best ? best.price + best.shipping - best.cashback : p.msrp;
      const min30 = Math.min(...p.history30d);
      const avg30 = Math.round(p.history30d.reduce((acc, v) => acc + v, 0) / p.history30d.length);
      const totalVotes = p.votes.worthIt + p.votes.waitForDrop;
      const worthPct = totalVotes > 0 ? Math.round((p.votes.worthIt / totalVotes) * 100) : 0;

      return [
        `ID: ${p.id}`,
        `Name: ${p.name} (${p.brand}) | Category: ${p.category}`,
        `Tagline: ${p.tagline}`,
        `MRP: ₹${p.msrp} | Best Net Landed Cost: ₹${netBest} at ${best?.storeName ?? 'N/A'} (sticker ₹${best?.price}, coupon ${best?.couponCode ?? 'none'} saves ₹${best?.cashback}, ETA: ${best?.deliveryEta})`,
        `30-Day Low: ₹${min30} | 30-Day Avg: ₹${avg30}`,
        `Community Worth-It: ${worthPct}% (${totalVotes} votes)`,
        `Specs: ${p.specs.map((s) => `${s.label}: ${s.value}`).join('; ')}`,
        `All Offers: ${sorted.map((o) => `${o.storeName} (₹${o.price + o.shipping - o.cashback} net, coupon ${o.couponCode ?? 'N/A'}, ${o.deliveryEta})`).join(' | ')}`,
      ].join('\n');
    })
    .join('\n---\n');
}

const PLATFORM_URLS: Record<string, string> = {
  blinkit: 'https://blinkit.com',
  zepto: 'https://www.zeptonow.com',
  instamart: 'https://www.swiggy.com/instamart',
  jiomart: 'https://www.jiomart.com',
  bigbasket: 'https://www.bigbasket.com',
  dmart: 'https://www.dmart.in',
  flipkart: 'https://www.flipkart.com',
  amazon: 'https://www.amazon.in',
  croma: 'https://www.croma.com',
  myntra: 'https://www.myntra.com',
  ajio: 'https://www.ajio.com',
};

function normalizeStoreId(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('blinkit')) return 'blinkit';
  if (lower.includes('zepto')) return 'zepto';
  if (lower.includes('instamart') || lower.includes('swiggy')) return 'instamart';
  if (lower.includes('ajio')) return 'ajio';
  if (lower.includes('jiomart') || lower.includes('jio mart')) return 'jiomart';
  if (lower.includes('bigbasket') || lower.includes('bb')) return 'bigbasket';
  if (lower.includes('dmart')) return 'dmart';
  if (lower.includes('flipkart')) return 'flipkart';
  if (lower.includes('croma')) return 'croma';
  if (lower.includes('myntra')) return 'myntra';
  return 'amazon';
}

function findLocalCatalogMatches(query: string, maxBudgetInr?: number): Product[] {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);

  if (tokens.length === 0) return [];

  return state.products.filter((p) => {
    const haystack = [
      p.name,
      p.brand,
      p.category,
      p.tagline,
      ...(p.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase();

    const matchesText = tokens.every((tok) => haystack.includes(tok));
    if (!matchesText) return false;

    if (maxBudgetInr && maxBudgetInr > 0) {
      const bestNet = Math.min(
        ...p.offers.filter((o) => o.inStock).map((o) => Math.max(0, o.price + o.shipping - o.cashback))
      );
      return bestNet <= maxBudgetInr;
    }
    return true;
  });
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/products', (_req, res) => {
    res.json({ products: state.products });
  });

  // Universal Indian Multi-Platform Product Search (supports any category & manual budget)
  app.post('/api/search', async (req, res) => {
    const { query, maxBudgetInr, city, pincode } = req.body as {
      query?: string;
      maxBudgetInr?: number;
      city?: string;
      pincode?: string;
    };

    const cleanQuery = (query ?? '').trim();
    if (!cleanQuery) {
      res.status(400).json({ error: 'Enter a product name to search across Indian platforms.' });
      return;
    }

    // Return immediate local catalog hits if matching products exist (respecting manual budget)
    const localMatches = findLocalCatalogMatches(cleanQuery, maxBudgetInr);
    if (localMatches.length > 0) {
      res.json({ products: localMatches, source: 'catalog' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Live search for custom items requires GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    try {
      const budgetConstraint =
        maxBudgetInr && maxBudgetInr > 0
          ? `CRITICAL BUDGET RULE: User manual max budget is ₹${maxBudgetInr}. Every returned product MUST have final net price (price - cashback) <= ₹${maxBudgetInr}.`
          : 'No strict max budget.';

      const text = await generateWithRetry(ai, {
        contents: `Search query: "${cleanQuery}" in ${city ?? 'Bengaluru'} (PIN ${pincode ?? '560001'}). ${budgetConstraint}
Return 2 matching Indian products, each with 4 Indian platform offers (from Amazon.in, Flipkart, Blinkit, Zepto, Instamart, Myntra, Ajio, Croma, JioMart, BigBasket, DMart Ready) including ₹ price, couponCode, cashback, deliveryEta, and 4 short specs.`,
        systemInstruction:
          'You are SavvyCart India’s concise price & coupon comparison engine. Output valid JSON quickly with realistic Indian ₹ prices, delivery ETAs ("10 mins", "Tomorrow", "2 days"), and coupon codes.',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            products: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  brand: { type: Type.STRING },
                  category: {
                    type: Type.STRING,
                    description:
                      'One of: Electronics, Fashion, Home & Kitchen, Beauty & Care, Groceries, Study & Gear',
                  },
                  tagline: { type: Type.STRING },
                  msrp: { type: Type.NUMBER },
                  rating: { type: Type.NUMBER },
                  specs: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        value: { type: Type.STRING },
                      },
                      required: ['label', 'value'],
                    },
                  },
                  offers: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        storeName: { type: Type.STRING },
                        price: { type: Type.NUMBER },
                        shipping: { type: Type.NUMBER },
                        cashback: { type: Type.NUMBER },
                        couponCode: { type: Type.STRING },
                        couponText: { type: Type.STRING },
                        deliveryDays: { type: Type.NUMBER },
                        deliveryEta: { type: Type.STRING },
                        inStock: { type: Type.BOOLEAN },
                        perk: { type: Type.STRING },
                      },
                      required: [
                        'storeName',
                        'price',
                        'shipping',
                        'cashback',
                        'couponCode',
                        'couponText',
                        'deliveryDays',
                        'deliveryEta',
                        'inStock',
                        'perk',
                      ],
                    },
                  },
                },
                required: ['name', 'brand', 'category', 'tagline', 'msrp', 'rating', 'specs', 'offers'],
              },
            },
          },
          required: ['products'],
        },
      });

      const parsed = JSON.parse(text.trim()) as {
        products?: Array<{
          name: string;
          brand: string;
          category: string;
          tagline: string;
          msrp: number;
          rating: number;
          specs: Array<{ label: string; value: string }>;
          offers: Array<{
            storeName: string;
            price: number;
            shipping: number;
            cashback: number;
            couponCode: string;
            couponText: string;
            deliveryDays: number;
            deliveryEta: string;
            inStock: boolean;
            perk: string;
          }>;
        }>;
      };

      const validCategories: ProductCategory[] = [
        'Electronics',
        'Fashion',
        'Home & Kitchen',
        'Beauty & Care',
        'Groceries',
        'Study & Gear',
      ];

      const created: Product[] = (parsed.products ?? []).map((item, idx) => {
        const slug = item.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 28);
        const id = `search-${slug}-${Date.now()}-${idx}`;
        const minOfferPrice = Math.min(...item.offers.map((o) => Math.max(1, o.price)));
        const step = Math.max(1, Math.round((item.msrp - minOfferPrice) / 9));
        const history30d = Array.from({ length: 10 }, (_, i) =>
          Math.max(minOfferPrice, Math.round(item.msrp - step * i * 0.9))
        );
        history30d[9] = minOfferPrice;

        const category = validCategories.includes(item.category as ProductCategory)
          ? (item.category as ProductCategory)
          : 'Electronics';

        return {
          id,
          name: item.name,
          brand: item.brand,
          category,
          tagline: item.tagline,
          keywords: cleanQuery.toLowerCase().split(/\s+/),
          rating: Math.min(5, Math.max(3.9, Number(item.rating) || 4.6)),
          reviewCount: 310 + idx * 145,
          msrp: Math.max(minOfferPrice, Math.round(item.msrp)),
          history30d,
          specs: item.specs.slice(0, 4),
          offers: item.offers.map((o) => {
            const storeId = normalizeStoreId(o.storeName);
            return {
              storeId,
              storeName: o.storeName,
              price: Math.max(1, Math.round(o.price)),
              shipping: Math.max(0, Math.round(o.shipping)),
              cashback: Math.max(0, Math.round(o.cashback)),
              couponCode: o.couponCode,
              couponText: o.couponText,
              deliveryDays: Math.max(0, Math.round(o.deliveryDays)),
              deliveryEta: o.deliveryEta,
              sellerRating: 4.7,
              warrantyMonths: category === 'Groceries' || category === 'Beauty & Care' ? 0 : 12,
              inStock: Boolean(o.inStock),
              perk: o.perk,
              url: PLATFORM_URLS[storeId] ?? 'https://www.amazon.in',
            };
          }),
          votes: { worthIt: 34 + idx * 9, waitForDrop: 5 + idx },
          notes: [],
          isDynamicSearch: true,
        };
      });

      const combined = [...created, ...localMatches];
      state.products = [
        ...created,
        ...state.products.filter((p) => !p.isDynamicSearch).slice(0, 20),
        ...state.products.filter((p) => p.isDynamicSearch).slice(0, 8),
      ];
      saveState(state);

      res.json({ products: combined, source: 'live' });
    } catch (error) {
      if (localMatches.length > 0) {
        res.json({ products: localMatches, source: 'catalog' });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unable to search platforms right now.';
      const status =
        message.includes('403') || message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')
          ? 403
          : message.includes('429') || message.includes('RESOURCE_EXHAUSTED')
            ? 429
            : 503;
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/products/:id/vote', (req, res) => {
    const { id } = req.params;
    const { voteType } = req.body as { voteType?: 'worthIt' | 'waitForDrop' };
    const product = state.products.find((p) => p.id === id);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    if (voteType !== 'worthIt' && voteType !== 'waitForDrop') {
      res.status(400).json({ error: 'Invalid vote type.' });
      return;
    }
    product.votes[voteType] += 1;
    saveState(state);
    res.json({ product });
  });

  app.post('/api/products/:id/notes', (req, res) => {
    const { id } = req.params;
    const { author, storeName, text } = req.body as {
      author?: string;
      storeName?: string;
      text?: string;
    };
    const product = state.products.find((p) => p.id === id);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    const cleanText = (text ?? '').trim();
    if (!cleanText || cleanText.length < 4) {
      res.status(400).json({ error: 'Please share a helpful shopping tip (at least 4 characters).' });
      return;
    }
    const cleanAuthor = (author ?? '').trim() || 'Savvy Shopper';
    const handle = `@${cleanAuthor.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || 'shopper'}`;
    const note = {
      id: `note-${Date.now()}`,
      author: cleanAuthor,
      handle,
      storeName: storeName || undefined,
      text: cleanText.slice(0, 240),
      helpfulCount: 1,
      createdAt: 'Just now',
    };
    product.notes.unshift(note);
    saveState(state);
    res.status(201).json({ product, note });
  });

  app.post('/api/products/:id/notes/:noteId/helpful', (req, res) => {
    const { id, noteId } = req.params;
    const product = state.products.find((p) => p.id === id);
    const note = product?.notes.find((n) => n.id === noteId);
    if (!product || !note) {
      res.status(404).json({ error: 'Note not found.' });
      return;
    }
    note.helpfulCount += 1;
    saveState(state);
    res.json({ product });
  });

  app.get('/api/community', (_req, res) => {
    res.json({
      polls: state.polls,
      savers: INITIAL_SAVERS,
    });
  });

  app.post('/api/community/polls', (req, res) => {
    const { question, author, context, optionAId, optionBId } = req.body as {
      question?: string;
      author?: string;
      context?: string;
      optionAId?: string;
      optionBId?: string;
    };
    const prodA = state.products.find((p) => p.id === optionAId);
    const prodB = state.products.find((p) => p.id === optionBId);
    if (!prodA || !prodB || prodA.id === prodB.id) {
      res.status(400).json({ error: 'Select two different products to create a poll.' });
      return;
    }
    const poll: CommunityPoll = {
      id: `poll-${Date.now()}`,
      question: (question ?? '').trim() || `Which should I buy: ${prodA.name} or ${prodB.name}?`,
      author: (author ?? '').trim() || 'You',
      context: (context ?? '').trim() || 'Created from a side-by-side Deal Duel comparison.',
      optionAId: prodA.id,
      optionBId: prodB.id,
      votesA: 1,
      votesB: 0,
      createdAt: 'Just now',
    };
    state.polls.unshift(poll);
    saveState(state);
    res.status(201).json({ poll });
  });

  app.post('/api/community/polls/:pollId/vote', (req, res) => {
    const { pollId } = req.params;
    const { choice } = req.body as { choice?: 'A' | 'B' };
    const poll = state.polls.find((p) => p.id === pollId);
    if (!poll) {
      res.status(404).json({ error: 'Poll not found.' });
      return;
    }
    if (choice !== 'A' && choice !== 'B') {
      res.status(400).json({ error: 'Invalid poll choice.' });
      return;
    }
    if (choice === 'A') poll.votesA += 1;
    else poll.votesB += 1;
    saveState(state);
    res.json({ poll });
  });

  // Intelligent Shopping Recommendation Engine (with automatic retry & flash-lite fallback on 503)
  app.post('/api/recommend', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Intelligent recommendation engine requires a configured GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const { mode, query, priority, budgetInr, productId } = req.body as {
      mode?: 'finder' | 'verdict';
      query?: string;
      priority?: ShoppingPriority;
      budgetInr?: number;
      productId?: string;
    };

    try {
      if (mode === 'verdict' && productId) {
        const product = state.products.find((p) => p.id === productId);
        if (!product) {
          res.status(404).json({ error: 'Product not found.' });
          return;
        }
        const text = await generateWithRetry(ai, {
          contents: `Analyze this Indian multi-platform product listing (including coupon discounts, delivery speed, 30-day INR price history, and community sentiment) and give a crisp shopper verdict.\n\nPriority: ${priority ?? 'best-value'}\n\nProduct Data:\n${formatCatalogContext([product])}`,
          systemInstruction:
            'You are SavvyCart India’s intelligent shopping advisor. Give concise, practical, everyday consumer advice grounded strictly in the provided Indian platform prices (₹ INR), coupon codes, delivery ETAs, and 30-day history.',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING },
              confidenceLabel: { type: Type.STRING },
              bestStoreName: { type: Type.STRING },
              summary: { type: Type.STRING },
              watchOut: { type: Type.STRING },
              tip: { type: Type.STRING },
            },
            required: ['verdict', 'confidenceLabel', 'bestStoreName', 'summary', 'watchOut', 'tip'],
          },
        });

        const parsed = JSON.parse(text.trim());
        res.json({ verdict: parsed });
        return;
      }

      const cleanQuery = (query ?? '').trim();
      if (!cleanQuery) {
        res.status(400).json({ error: 'Describe what you are shopping for to get a recommendation.' });
        return;
      }

      const catalogContext = formatCatalogContext(state.products);
      const validIds = state.products.map((p) => p.id);
      const text = await generateWithRetry(ai, {
        contents: `Shopper request: "${cleanQuery}"\nPriority: ${priority ?? 'best-value'}\n${budgetInr ? `Target max budget: ₹${budgetInr} INR` : 'No strict budget limit'}\n\nCatalog:\n${catalogContext}`,
        systemInstruction: `You are SavvyCart India’s intelligent multi-platform shopping recommender. Match the shopper's need to the best product ID from this exact list: [${validIds.join(', ')}]. Select the best Indian platform based on priority and budget in ₹ INR, mentioning exact coupon codes and net ₹ prices.`,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedProductId: { type: Type.STRING },
            bestStoreName: { type: Type.STRING },
            verdict: { type: Type.STRING },
            headline: { type: Type.STRING },
            reasoning: { type: Type.STRING },
            highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
            alternativeProductId: { type: Type.STRING },
            alternativeReason: { type: Type.STRING },
          },
          required: ['recommendedProductId', 'bestStoreName', 'verdict', 'headline', 'reasoning', 'highlights'],
        },
      });

      const parsed = JSON.parse(text.trim());
      if (!validIds.includes(parsed.recommendedProductId)) {
        parsed.recommendedProductId = validIds[0];
      }
      res.json({ recommendation: parsed });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reach recommendation service.';
      const status =
        message.includes('403') || message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')
          ? 403
          : message.includes('429') || message.includes('RESOURCE_EXHAUSTED')
            ? 429
            : 503;
      res.status(status).json({ error: message });
    }
  });

  // Auto-Routed Multi-Turn Gemini Shopping Chatbot
  app.post('/api/chat', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'Gemini shopping assistant requires GEMINI_API_KEY in Settings > Secrets.',
      });
      return;
    }

    const { messages, location, maxBudgetInr, currency } = req.body as {
      messages?: Array<{ role: 'user' | 'assistant'; text: string }>;
      location?: { city?: string; pincode?: string };
      maxBudgetInr?: number;
      currency?: 'INR' | 'USD';
    };

    const cleanMessages = (messages ?? [])
      .filter((m) => typeof m.text === 'string' && m.text.trim().length > 0)
      .slice(-14);

    if (cleanMessages.length === 0) {
      res.status(400).json({ error: 'Send a shopping question to start chatting.' });
      return;
    }

    const latestUserMsg = [...cleanMessages].reverse().find((m) => m.role === 'user')?.text ?? '';
    const primaryRoute = selectChatRoute(latestUserMsg);
    const catalogContext = formatCatalogContext(state.products);
    const validIds = state.products.map((p) => p.id);

    const systemInstruction = [
      `You are SavvyCart India's smart, friendly multi-store shopping assistant.`,
      `Shopper context: City=${location?.city ?? 'Bengaluru'}, PIN=${location?.pincode ?? '560001'}, Currency=${currency ?? 'INR'}, Max Budget=${maxBudgetInr && maxBudgetInr > 0 ? `₹${maxBudgetInr} INR` : 'No cap'}.`,
      `Be concise, practical, and accurate. Reference actual Indian platforms (Amazon.in, Flipkart, Blinkit, Zepto, Instamart, Myntra, Ajio, Croma, JioMart, BigBasket, DMart Ready), real ₹ net prices (sticker - coupon), coupon codes, and delivery ETAs from the catalog below.`,
      `If the shopper asks about an item outside the catalog, still advise smartly on Indian platform pricing, coupons, and whether to buy or wait, while keeping productIds to matching catalog IDs from [${validIds.join(', ')}] (or empty array if none match).`,
      `\nCatalog:\n${catalogContext}`,
    ].join('\n');

    const contents = cleanMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.text }],
    }));

    const routeAttempts = [
      primaryRoute,
      primaryRoute.model === 'gemini-3.1-flash-lite'
        ? {
            model: 'gemini-4-hydrogen',
            thinkingLevel: ThinkingLevel.LOW,
            routeLabel: primaryRoute.routeLabel,
          }
        : {
            model: 'gemini-3.1-flash-lite',
            thinkingLevel: ThinkingLevel.MINIMAL,
            routeLabel: primaryRoute.routeLabel,
          },
    ];

    let lastError: unknown;
    for (let i = 0; i < routeAttempts.length; i++) {
      const attempt = routeAttempts[i];
      try {
        const response = await Promise.race([
          ai.models.generateContent({
            model: attempt.model,
            contents,
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: attempt.thinkingLevel },
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  reply: { type: Type.STRING },
                  recommendedProductIds: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: ['reply', 'recommendedProductIds'],
              },
            },
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('503 Model response timed out')), 6500)
          ),
        ]);

        const parsed = JSON.parse((response.text ?? '{}').trim()) as {
          reply?: string;
          recommendedProductIds?: string[];
        };

        const filteredIds = (parsed.recommendedProductIds ?? [])
          .filter((id) => validIds.includes(id))
          .slice(0, 3);

        res.json({
          reply: parsed.reply || 'Here is what I found across Indian platforms.',
          recommendedProductIds: filteredIds,
          routeModel: attempt.model,
          routeLabel: primaryRoute.routeLabel,
        });
        return;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (
          !msg.includes('503') &&
          !msg.includes('UNAVAILABLE') &&
          !msg.includes('429') &&
          !msg.includes('timed out')
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const message =
      lastError instanceof Error ? lastError.message : 'Unable to reach Gemini shopping chat.';
    const status =
      message.includes('403') || message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')
        ? 403
        : message.includes('429') || message.includes('RESOURCE_EXHAUSTED')
          ? 429
          : 503;
    res.status(status).json({ error: message });
  });

  // Google Maps Platform Config & REST Proxy Endpoints (avoids CF1 CORS issues & enforces attribution)
  app.get('/api/maps/config', (_req, res) => {
    const apiKey = getMapsApiKey();
    res.json({
      apiKey,
      configured: Boolean(apiKey),
    });
  });

  app.post('/api/maps/reverse-geocode', async (req, res) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({ error: 'Google Maps API key is not configured.' });
      return;
    }

    const { lat, lng } = req.body as { lat?: number; lng?: number };
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      res.status(400).json({ error: 'Valid latitude and longitude are required.' });
      return;
    }

    try {
      const url = new URL('https://geocode.googleapis.com/v4/geocode/location');
      url.searchParams.append('location.latitude', String(lat));
      url.searchParams.append('location.longitude', String(lng));
      url.searchParams.append('languageCode', 'en');
      url.searchParams.append('regionCode', 'IN');

      const apiRes = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'results.placeId,results.formattedAddress,results.addressComponents',
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
      });

      const json = (await apiRes.json()) as {
        results?: Array<{
          placeId?: string;
          formattedAddress?: string;
          addressComponents?: Array<{
            longText?: string;
            shortText?: string;
            types?: string[];
          }>;
        }>;
        error?: { status?: string; message?: string };
      };

      if (apiRes.status === 429 || json.error?.status === 'RESOURCE_EXHAUSTED') {
        res.status(429).json({
          error: json.error?.message || 'Google Maps API quota exceeded.',
          quotaExceeded: true,
        });
        return;
      }

      if (!apiRes.ok) {
        res.status(apiRes.status).json({
          error: json.error?.message || `Reverse geocoding failed (${apiRes.status}).`,
        });
        return;
      }

      const first = json.results?.[0];
      if (!first) {
        res.json({
          city: 'Selected Pin',
          neighborhood: '',
          pincode: '',
          formattedAddress: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        });
        return;
      }

      const extracted = extractCityAndPinFromComponents(
        first.addressComponents,
        first.formattedAddress
      );
      res.json({
        ...extracted,
        formattedAddress: first.formattedAddress ?? '',
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Network error reverse geocoding coordinates.',
      });
    }
  });

  app.post('/api/maps/geocode', async (req, res) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({ error: 'Google Maps API key is not configured.' });
      return;
    }

    const { query } = req.body as { query?: string };
    const clean = (query ?? '').trim();
    if (!clean) {
      res.status(400).json({ error: 'Enter a city, area, or Indian PIN code.' });
      return;
    }

    try {
      const url = new URL(
        `https://geocode.googleapis.com/v4/geocode/address/${encodeURIComponent(clean)}`
      );
      url.searchParams.append('languageCode', 'en');
      url.searchParams.append('regionCode', 'IN');

      const apiRes = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'results.placeId,results.formattedAddress,results.addressComponents,results.location',
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
      });

      const json = (await apiRes.json()) as {
        results?: Array<{
          placeId?: string;
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
          addressComponents?: Array<{
            longText?: string;
            shortText?: string;
            types?: string[];
          }>;
        }>;
        error?: { status?: string; message?: string };
      };

      if (apiRes.status === 429 || json.error?.status === 'RESOURCE_EXHAUSTED') {
        res.status(429).json({
          error: json.error?.message || 'Google Maps API quota exceeded.',
          quotaExceeded: true,
        });
        return;
      }

      if (!apiRes.ok) {
        res.status(apiRes.status).json({
          error: json.error?.message || `Geocoding failed (${apiRes.status}).`,
        });
        return;
      }

      const first = json.results?.[0];
      if (!first?.location?.latitude || !first?.location?.longitude) {
        res.status(404).json({ error: `Could not locate "${clean}" on Google Maps.` });
        return;
      }

      const extracted = extractCityAndPinFromComponents(
        first.addressComponents,
        first.formattedAddress
      );
      res.json({
        ...extracted,
        lat: first.location.latitude,
        lng: first.location.longitude,
        formattedAddress: first.formattedAddress ?? clean,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Network error geocoding location.',
      });
    }
  });

  app.post('/api/maps/nearby', async (req, res) => {
    const apiKey = getMapsApiKey();
    if (!apiKey) {
      res.status(503).json({ error: 'Google Maps API key is not configured.' });
      return;
    }

    const { lat, lng, radiusMeters } = req.body as {
      lat?: number;
      lng?: number;
      radiusMeters?: number;
    };
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      res.status(400).json({ error: 'Valid coordinates are required to search nearby stores.' });
      return;
    }

    const radius = Math.min(25000, Math.max(500, Number(radiusMeters) || 5000));

    try {
      const apiRes = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.currentOpeningHours.openNow,places.primaryTypeDisplayName,places.googleMapsUri',
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
        body: JSON.stringify({
          includedTypes: [
            'electronics_store',
            'supermarket',
            'grocery_store',
            'department_store',
            'shopping_mall',
          ],
          maxResultCount: 12,
          rankPreference: 'DISTANCE',
          languageCode: 'en',
          regionCode: 'IN',
          locationRestriction: {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius,
            },
          },
        }),
      });

      const json = (await apiRes.json()) as {
        places?: Array<{
          id?: string;
          displayName?: { text?: string };
          formattedAddress?: string;
          location?: { latitude?: number; longitude?: number };
          rating?: number;
          userRatingCount?: number;
          currentOpeningHours?: { openNow?: boolean };
          primaryTypeDisplayName?: { text?: string };
          googleMapsUri?: string;
        }>;
        error?: { status?: string; message?: string };
      };

      if (apiRes.status === 429 || json.error?.status === 'RESOURCE_EXHAUSTED') {
        res.status(429).json({
          error: json.error?.message || 'Google Places API quota exceeded.',
          quotaExceeded: true,
        });
        return;
      }

      if (!apiRes.ok) {
        res.status(apiRes.status).json({
          error: json.error?.message || `Nearby store search failed (${apiRes.status}).`,
        });
        return;
      }

      const stores: NearbyStorePlace[] = (json.places ?? [])
        .filter((p) => p.location?.latitude != null && p.location?.longitude != null)
        .map((p, idx) => {
          const pLat = p.location!.latitude!;
          const pLng = p.location!.longitude!;
          return {
            id: p.id || `place-${idx}`,
            name: p.displayName?.text || 'Nearby Store',
            address: p.formattedAddress || '',
            lat: pLat,
            lng: pLng,
            rating: p.rating,
            userRatingCount: p.userRatingCount,
            openNow: p.currentOpeningHours?.openNow,
            category: p.primaryTypeDisplayName?.text || 'Retail Store',
            distanceMeters: haversineMeters(lat, lng, pLat, pLng),
            googleMapsUri: p.googleMapsUri,
          };
        });

      res.json({ stores });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Network error fetching nearby stores.',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/live' });

  wss.on('connection', async (clientWs: WebSocket, req) => {
    const ai = getGeminiClient();
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          message: 'GEMINI_API_KEY is missing in Settings > Secrets.',
        })
      );
      clientWs.close();
      return;
    }

    const reqUrl = new URL(req.url ?? '/ws/live', `http://${req.headers.host || 'localhost'}`);
    const city = reqUrl.searchParams.get('city') || 'Bengaluru';
    const pincode = reqUrl.searchParams.get('pincode') || '560001';
    const budget = reqUrl.searchParams.get('budget') || '';
    const currency = reqUrl.searchParams.get('currency') || 'INR';

    const compactCatalog = state.products
      .slice(0, 10)
      .map((p) => {
        const best = [...p.offers]
          .filter((o) => o.inStock)
          .sort((a, b) => a.price + a.shipping - a.cashback - (b.price + b.shipping - b.cashback))[0];
        const net = best ? best.price + best.shipping - best.cashback : p.msrp;
        return `${p.name} (${p.category}): ₹${net} net on ${best?.storeName ?? 'India store'} (code ${best?.couponCode ?? 'none'}, ETA ${best?.deliveryEta ?? '1 day'})`;
      })
      .join('; ');

    let session: Awaited<ReturnType<typeof ai.live.connect>> | null = null;
    try {
      session = await ai.live.connect({
        model: 'gemini-3.8-live',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: `You are SavvyCart Voice, a cheerful, crisp Indian shopping deal advisor. The shopper is in ${city} (PIN ${pincode}), preferred currency ${currency}, manual max budget ${budget ? `₹${budget}` : 'flexible'}. Compare Amazon.in, Flipkart, Blinkit, Zepto, Instamart, Myntra, Ajio, Croma, JioMart, BigBasket, and DMart Ready in natural spoken sentences with exact rupee net prices and coupon codes. Keep spoken answers concise and conversational. Top live catalog: ${compactCatalog}.`,
        },
        callbacks: {
          onopen: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ type: 'ready' }));
            }
          },
          onmessage: (message: LiveServerMessage) => {
            if (clientWs.readyState !== clientWs.OPEN) return;
            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: 'inputTranscript',
                  text: content.inputTranscription.text,
                })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({
                  type: 'outputTranscript',
                  text: content.outputTranscription.text,
                })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(
                  JSON.stringify({
                    type: 'audio',
                    data: part.inlineData.data,
                  })
                );
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ type: 'interrupted' }));
            }
            if (content?.turnComplete) {
              clientWs.send(JSON.stringify({ type: 'turnComplete' }));
            }
          },
          onerror: (err) => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(
                JSON.stringify({
                  type: 'error',
                  message: err instanceof Error ? err.message : 'Live voice session error.',
                })
              );
            }
          },
          onclose: () => {
            if (clientWs.readyState === clientWs.OPEN) {
              clientWs.send(JSON.stringify({ type: 'closed' }));
            }
          },
        },
      });
    } catch (err) {
      if (clientWs.readyState === clientWs.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            message:
              err instanceof Error ? err.message : 'Could not connect to Gemini Live voice.',
          })
        );
        clientWs.close();
      }
      return;
    }

    clientWs.on('message', (raw) => {
      if (!session) return;
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: 'audio' | 'text';
          data?: string;
          text?: string;
        };
        if (msg.type === 'audio' && msg.data) {
          session.sendRealtimeInput({
            audio: { data: msg.data, mimeType: 'audio/pcm;rate=16000' },
          });
        } else if (msg.type === 'text' && msg.text) {
          session.sendRealtimeInput({ text: msg.text });
        }
      } catch {
        // Ignore malformed frame
      }
    });

    clientWs.on('close', () => {
      try {
        session?.close();
      } catch {
        // ignore
      }
      session = null;
    });
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SavvyCart server running on http://localhost:${PORT}`);
  });
}

startServer();
