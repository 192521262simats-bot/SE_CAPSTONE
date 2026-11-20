export type CurrencyCode = 'INR' | 'USD';

export type ShoppingPriority = 'lowest-price' | 'fastest-delivery' | 'best-value';

export type IndianPlatformId =
  | 'blinkit'
  | 'zepto'
  | 'instamart'
  | 'jiomart'
  | 'bigbasket'
  | 'dmart'
  | 'flipkart'
  | 'amazon'
  | 'croma'
  | 'myntra'
  | 'ajio';

export interface PlatformMeta {
  id: IndianPlatformId;
  name: string;
  tagline: string;
  bgHex: string;
  textHex: string;
  defaultEta: string;
  quickCommerce: boolean;
}

export interface StoreOffer {
  storeId: IndianPlatformId | string;
  storeName: string;
  price: number; // Sticker price in INR
  shipping: number; // Delivery fee in INR
  cashback: number; // Coupon / bank discount in INR
  couponCode?: string;
  couponText?: string;
  deliveryDays: number; // 0 = same day / quick commerce, 1 = tomorrow, etc.
  deliveryEta: string;
  sellerRating: number;
  warrantyMonths: number;
  inStock: boolean;
  perk: string;
  url: string;
}

export interface ProductSpec {
  label: string;
  value: string;
}

export interface ShopperNote {
  id: string;
  author: string;
  handle: string;
  storeName?: string;
  text: string;
  helpfulCount: number;
  createdAt: string;
}

export type ProductCategory =
  | 'Electronics'
  | 'Fashion'
  | 'Home & Kitchen'
  | 'Beauty & Care'
  | 'Groceries'
  | 'Study & Gear';

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: ProductCategory;
  tagline: string;
  keywords?: string[];
  image?: string;
  rating: number;
  reviewCount: number;
  msrp: number; // MRP in INR
  history30d: number[]; // 30d history in INR
  specs: ProductSpec[];
  offers: StoreOffer[];
  votes: {
    worthIt: number;
    waitForDrop: number;
  };
  notes: ShopperNote[];
  isDynamicSearch?: boolean;
}

export interface CommunityPoll {
  id: string;
  question: string;
  author: string;
  context: string;
  optionAId: string;
  optionBId: string;
  votesA: number;
  votesB: number;
  createdAt: string;
}

export interface SaverProfile {
  id: string;
  name: string;
  handle: string;
  dealIq: number;
  totalSavedInr: number;
  tipsShared: number;
}

export interface SmartRecommendationResponse {
  recommendedProductId: string;
  bestStoreName: string;
  verdict: 'Buy Now' | 'Wait for Drop' | 'Great Match';
  headline: string;
  reasoning: string;
  highlights: string[];
  alternativeProductId?: string;
  alternativeReason?: string;
}

export interface ProductVerdictResponse {
  verdict: 'Buy Now' | 'Wait for Drop';
  confidenceLabel: string;
  bestStoreName: string;
  summary: string;
  watchOut: string;
  tip: string;
}

export interface WatchlistItem {
  productId: string;
  targetPriceInr: number;
  addedAt: string;
  productSnapshot?: Product;
}

export interface NearbyStorePlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  openNow?: boolean;
  category: string;
  distanceMeters?: number;
  googleMapsUri?: string;
}

export interface CityLocation {
  id: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
  formattedAddress?: string;
  tier: 'metro' | 'city' | 'town';
  unavailablePlatforms: IndianPlatformId[];
}

export type ChatRouteLabel =
  | 'Quick Deal Reply'
  | 'General Advisor'
  | 'Smart Planner'
  | 'Deep Analysis';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
  routeModel?: string;
  routeLabel?: ChatRouteLabel;
  recommendedProductIds?: string[];
}
