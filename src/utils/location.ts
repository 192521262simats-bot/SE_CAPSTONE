import { INDIAN_LOCATIONS } from '../data/catalog';
import type { CityLocation, IndianPlatformId } from '../types/shop';

const METRO_KEYWORDS = [
  'bengaluru',
  'bangalore',
  'mumbai',
  'bombay',
  'delhi',
  'new delhi',
  'noida',
  'gurgaon',
  'gurugram',
  'hyderabad',
  'chennai',
  'kolkata',
  'pune',
  'ahmedabad',
];

const TIER2_KEYWORDS = [
  'jaipur',
  'lucknow',
  'kochi',
  'coimbatore',
  'madurai',
  'chandigarh',
  'indore',
  'surat',
  'nagpur',
  'bhopal',
  'patna',
  'bhubaneswar',
  'visakhapatnam',
  'mysuru',
  'mysore',
  'trichy',
  'salem',
  'vadodara',
  'guwahati',
  'thiruvananthapuram',
];

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  bengaluru: { lat: 12.9716, lng: 77.5946 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  mumbai: { lat: 19.076, lng: 72.8777 },
  bombay: { lat: 19.076, lng: 72.8777 },
  'new delhi': { lat: 28.6139, lng: 77.209 },
  delhi: { lat: 28.6139, lng: 77.209 },
  noida: { lat: 28.5355, lng: 77.391 },
  gurugram: { lat: 28.4595, lng: 77.0266 },
  gurgaon: { lat: 28.4595, lng: 77.0266 },
  hyderabad: { lat: 17.385, lng: 78.4867 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  pune: { lat: 18.5204, lng: 73.8567 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  coimbatore: { lat: 11.0168, lng: 76.9558 },
  madurai: { lat: 9.9252, lng: 78.1198 },
  kochi: { lat: 9.9312, lng: 76.2673 },
  jaipur: { lat: 26.9124, lng: 75.7873 },
  lucknow: { lat: 26.8467, lng: 80.9462 },
  mysuru: { lat: 12.2958, lng: 76.6394 },
  mysore: { lat: 12.2958, lng: 76.6394 },
};

export function inferCoordsForCity(cityOrPin: string): { lat: number; lng: number } {
  const lower = cityOrPin.toLowerCase();
  for (const [key, coords] of Object.entries(CITY_COORDS)) {
    if (lower.includes(key)) return coords;
  }
  const pinMatch = cityOrPin.match(/\b([1-8]\d{5})\b/);
  if (pinMatch) {
    const cityName = inferCityFromPin(pinMatch[1]);
    if (cityName && CITY_COORDS[cityName.toLowerCase()]) {
      return CITY_COORDS[cityName.toLowerCase()];
    }
  }
  return { lat: 12.9716, lng: 77.5946 };
}

export function normalizeCityLocation(loc: Partial<CityLocation>): CityLocation {
  const fallback = INDIAN_LOCATIONS[0];
  const city = loc.city || fallback.city;
  const pincode = loc.pincode || fallback.pincode;
  const inferred = inferCoordsForCity(`${city} ${pincode}`);
  return {
    id: loc.id || fallback.id,
    city,
    pincode,
    lat: typeof loc.lat === 'number' && Number.isFinite(loc.lat) ? loc.lat : inferred.lat,
    lng: typeof loc.lng === 'number' && Number.isFinite(loc.lng) ? loc.lng : inferred.lng,
    formattedAddress: loc.formattedAddress,
    tier: loc.tier || 'metro',
    unavailablePlatforms: Array.isArray(loc.unavailablePlatforms) ? loc.unavailablePlatforms : [],
  };
}

export function resolveCustomLocation(
  rawInput: string,
  coordsOverride?: { lat: number; lng: number; formattedAddress?: string }
): CityLocation {
  const cleaned = rawInput.trim();
  if (!cleaned && !coordsOverride) return INDIAN_LOCATIONS[0];

  if (!coordsOverride) {
    const preset = INDIAN_LOCATIONS.find(
      (loc) =>
        loc.city.toLowerCase() === cleaned.toLowerCase() ||
        loc.pincode === cleaned ||
        `${loc.city.toLowerCase()} ${loc.pincode}` === cleaned.toLowerCase()
    );
    if (preset) return preset;
  }

  const pinMatch = cleaned.match(/\b([1-8]\d{5})\b/);
  const extractedPin = pinMatch ? pinMatch[1] : '';
  const textWithoutPin = cleaned.replace(/\b[1-8]\d{5}\b/, '').replace(/[,·-]/g, ' ').trim();
  const lower = textWithoutPin.toLowerCase();

  const metroPinPrefixes = ['110', '400', '560', '500', '600', '700', '411', '380', '201', '122'];
  const isMetroByPin = metroPinPrefixes.some((pref) => extractedPin.startsWith(pref));
  const isMetroByName = METRO_KEYWORDS.some((kw) => lower.includes(kw));

  const coords = coordsOverride
    ? { lat: coordsOverride.lat, lng: coordsOverride.lng }
    : inferCoordsForCity(cleaned);

  if (isMetroByPin || isMetroByName) {
    const label = textWithoutPin
      ? textWithoutPin.replace(/\b\w/g, (c) => c.toUpperCase())
      : inferCityFromPin(extractedPin) || 'Metro Area';
    return {
      id: `custom-${(cleaned || `${coords.lat}-${coords.lng}`).toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      city: label,
      pincode: extractedPin || '560001',
      lat: coords.lat,
      lng: coords.lng,
      formattedAddress: coordsOverride?.formattedAddress,
      tier: 'metro',
      unavailablePlatforms: [],
    };
  }

  const tier2PinPrefixes = ['302', '226', '682', '641', '625', '160', '452', '395', '440', '462', '800', '751', '530', '570', '620'];
  const isTier2ByPin = tier2PinPrefixes.some((pref) => extractedPin.startsWith(pref));
  const isTier2ByName = TIER2_KEYWORDS.some((kw) => lower.includes(kw));

  if (isTier2ByPin || isTier2ByName) {
    const label = textWithoutPin
      ? textWithoutPin.replace(/\b\w/g, (c) => c.toUpperCase())
      : inferCityFromPin(extractedPin) || 'City Center';
    return {
      id: `custom-${(cleaned || `${coords.lat}-${coords.lng}`).toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
      city: label,
      pincode: extractedPin || '641001',
      lat: coords.lat,
      lng: coords.lng,
      formattedAddress: coordsOverride?.formattedAddress,
      tier: 'city',
      unavailablePlatforms: ['dmart'],
    };
  }

  const label = textWithoutPin
    ? textWithoutPin.replace(/\b\w/g, (c) => c.toUpperCase())
    : extractedPin
      ? `PIN ${extractedPin}`
      : cleaned || 'Selected Pin';

  const unavailable: IndianPlatformId[] = ['zepto', 'dmart', 'bigbasket'];
  return {
    id: `custom-${(cleaned || `${coords.lat}-${coords.lng}`).toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
    city: label,
    pincode: extractedPin || 'Local PIN',
    lat: coords.lat,
    lng: coords.lng,
    formattedAddress: coordsOverride?.formattedAddress,
    tier: 'town',
    unavailablePlatforms: unavailable,
  };
}

function inferCityFromPin(pin: string): string {
  if (pin.startsWith('110')) return 'New Delhi';
  if (pin.startsWith('400')) return 'Mumbai';
  if (pin.startsWith('560')) return 'Bengaluru';
  if (pin.startsWith('500')) return 'Hyderabad';
  if (pin.startsWith('600')) return 'Chennai';
  if (pin.startsWith('700')) return 'Kolkata';
  if (pin.startsWith('411')) return 'Pune';
  if (pin.startsWith('641')) return 'Coimbatore';
  if (pin.startsWith('625')) return 'Madurai';
  if (pin.startsWith('682')) return 'Kochi';
  if (pin.startsWith('302')) return 'Jaipur';
  if (pin.startsWith('226')) return 'Lucknow';
  if (pin.startsWith('380')) return 'Ahmedabad';
  return '';
}
