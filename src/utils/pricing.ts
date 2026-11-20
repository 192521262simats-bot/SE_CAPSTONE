import type {
  CityLocation,
  CurrencyCode,
  IndianPlatformId,
  Product,
  ShoppingPriority,
  StoreOffer,
} from '../types/shop';

const INR_TO_USD = 1 / 84;

export function convertFromInr(inr: number, currency: CurrencyCode): number {
  if (currency === 'USD') {
    return Math.round(inr * INR_TO_USD);
  }
  return Math.round(inr);
}

export function formatPrice(inr: number, currency: CurrencyCode): string {
  const value = convertFromInr(inr, currency);
  if (currency === 'USD') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function getNetCost(offer: StoreOffer): number {
  return Math.max(0, offer.price + offer.shipping - offer.cashback);
}

export function applyLocationAvailability(
  offers: StoreOffer[],
  location: CityLocation
): StoreOffer[] {
  return offers.map((offer) => {
    const isUnavailable = location.unavailablePlatforms.includes(offer.storeId as IndianPlatformId);
    if (!isUnavailable) return offer;
    return {
      ...offer,
      inStock: false,
      deliveryEta: `Unavailable in ${location.city}`,
    };
  });
}

export function getSortedOffers(
  product: Product,
  priority: ShoppingPriority = 'lowest-price',
  location?: CityLocation
): StoreOffer[] {
  const localized = location ? applyLocationAvailability(product.offers, location) : product.offers;

  return [...localized].sort((a, b) => {
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;

    const netA = getNetCost(a);
    const netB = getNetCost(b);

    if (priority === 'fastest-delivery') {
      if (a.deliveryDays !== b.deliveryDays) return a.deliveryDays - b.deliveryDays;
      return netA - netB;
    }

    if (priority === 'best-value') {
      const scoreA = netA - a.sellerRating * 40 - a.warrantyMonths * 20 + a.deliveryDays * 150;
      const scoreB = netB - b.sellerRating * 40 - b.warrantyMonths * 20 + b.deliveryDays * 150;
      return scoreA - scoreB;
    }

    return netA - netB;
  });
}

export function getBestOffer(
  product: Product,
  priority: ShoppingPriority = 'lowest-price',
  location?: CityLocation
): StoreOffer {
  return getSortedOffers(product, priority, location)[0];
}

export function getBestNetPriceInr(product: Product, location?: CityLocation): number {
  const best = getBestOffer(product, 'lowest-price', location);
  return best ? getNetCost(best) : product.msrp;
}

export function getMaxSavingsInr(product: Product, location?: CityLocation): number {
  return Math.max(0, product.msrp - getBestNetPriceInr(product, location));
}

export function getSavingsPercent(product: Product, location?: CityLocation): number {
  if (product.msrp <= 0) return 0;
  return Math.round((getMaxSavingsInr(product, location) / product.msrp) * 100);
}

export function getPriceStatus(product: Product): '30-Day Low' | 'Below Average' | 'Fair Price' {
  const inStock = product.offers.filter((o) => o.inStock);
  const bestSticker = inStock.length > 0 ? Math.min(...inStock.map((o) => o.price)) : product.msrp;
  const min30 = Math.min(...product.history30d);
  const avg30 = product.history30d.reduce((sum, val) => sum + val, 0) / product.history30d.length;

  if (bestSticker <= min30) return '30-Day Low';
  if (bestSticker < avg30) return 'Below Average';
  return 'Fair Price';
}

export function getWorthItPercent(product: Product): number {
  const total = product.votes.worthIt + product.votes.waitForDrop;
  if (total === 0) return 0;
  return Math.round((product.votes.worthIt / total) * 100);
}
