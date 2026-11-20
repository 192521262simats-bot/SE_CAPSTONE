/// <reference types="google.maps" />
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMapsLibrary,
  type MapCameraChangedEvent,
  type MapMouseEvent,
} from '@vis.gl/react-google-maps';
import {
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Search,
  Star,
  Store,
} from 'lucide-react';
import { INDIAN_LOCATIONS } from '../data/catalog';
import type { CityLocation, NearbyStorePlace } from '../types/shop';
import { resolveCustomLocation } from '../utils/location';

interface LocationMapPickerProps {
  location: CityLocation;
  onChangeLocation: (location: CityLocation) => void;
  onClose?: () => void;
}

interface StoreMarkerProps {
  store: NearbyStorePlace;
  isSelected: boolean;
  onSelect: (store: NearbyStorePlace, marker: google.maps.marker.AdvancedMarkerElement) => void;
}

function StoreMarker({ store, isSelected, onSelect }: StoreMarkerProps) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <AdvancedMarker
      ref={markerRef}
      position={{ lat: store.lat, lng: store.lng }}
      zIndex={isSelected ? 1000 : 10}
      title={store.name}
      onClick={() => {
        if (marker) {
          onSelect(store, marker);
        }
      }}
    >
      <Pin
        background={isSelected ? '#0f172a' : '#059669'}
        borderColor={isSelected ? '#2563eb' : '#047857'}
        glyphColor="#ffffff"
        scale={isSelected ? 1.15 : 0.95}
      />
    </AdvancedMarker>
  );
}

function PlacesAutocompleteBox({
  onPickPlace,
  onFallbackSubmit,
  searching,
}: {
  onPickPlace: (lat: number, lng: number, label: string, address: string) => void;
  onFallbackSubmit: (text: string) => Promise<void>;
  searching: boolean;
}) {
  const placesLib = useMapsLibrary('places');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  useEffect(() => {
    if (!placesLib || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
    if (!sessionTokenRef.current) {
      sessionTokenRef.current = new AutocompleteSessionToken();
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      AutocompleteSuggestion.fetchAutocompleteSuggestions({
        input: query.trim(),
        includedRegionCodes: ['in'],
        sessionToken: sessionTokenRef.current ?? undefined,
      })
        .then((res) => {
          if (!cancelled) {
            setSuggestions(res.suggestions.slice(0, 5));
          }
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 240);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [placesLib, query]);

  async function handleSelectSuggestion(s: google.maps.places.AutocompleteSuggestion) {
    if (!placesLib || !s.placePrediction) return;
    try {
      const place = s.placePrediction.toPlace();
      await place.fetchFields({
        fields: ['displayName', 'formattedAddress', 'location'],
      });
      const loc = place.location;
      if (loc) {
        const lat = loc.lat();
        const lng = loc.lng();
        const label = place.displayName || s.placePrediction.text.text;
        const address = place.formattedAddress || label;
        setQuery('');
        setSuggestions([]);
        sessionTokenRef.current = null;
        onPickPlace(lat, lng, label, address);
      }
    } catch {
      sessionTokenRef.current = null;
      await onFallbackSubmit(query);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSuggestions([]);
    await onFallbackSubmit(query.trim());
    setQuery('');
  }

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search area, street, or 6-digit Indian PIN (e.g. Indiranagar 560038)..."
            aria-label="Search delivery area or PIN on Google Maps"
            className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <button
          type="submit"
          disabled={searching}
          className="h-10 px-4 bg-slate-900 hover:bg-blue-600 disabled:bg-slate-400 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer"
        >
          {searching ? 'Locating...' : 'Pin Location'}
        </button>
      </form>

      {suggestions.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg divide-y divide-slate-100 overflow-hidden">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => void handleSelectSuggestion(s)}
                className="w-full px-3.5 py-2.5 text-left text-xs text-slate-700 hover:bg-blue-50 flex items-center gap-2 cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">{s.placePrediction?.text.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InteractiveMapCanvas({
  location,
  stores,
  selectedStore,
  onSelectStore,
  onClearStore,
  onMoveDeliveryPin,
}: {
  location: CityLocation;
  stores: NearbyStorePlace[];
  selectedStore: NearbyStorePlace | null;
  onSelectStore: (store: NearbyStorePlace) => void;
  onClearStore: () => void;
  onMoveDeliveryPin: (lat: number, lng: number) => void;
}) {
  const loadingStatus = useApiLoadingStatus();
  const [camera, setCamera] = useState<{ center: { lat: number; lng: number }; zoom: number }>({
    center: { lat: location.lat, lng: location.lng },
    zoom: 13,
  });
  const [infoAnchor, setInfoAnchor] = useState<google.maps.marker.AdvancedMarkerElement | null>(
    null
  );

  useEffect(() => {
    setCamera((prev) => ({
      center: { lat: location.lat, lng: location.lng },
      zoom: prev.zoom < 12 ? 13 : prev.zoom,
    }));
  }, [location.lat, location.lng]);

  useEffect(() => {
    if (loadingStatus === APILoadingStatus.AUTH_FAILURE) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
    }
  }, [loadingStatus]);

  const handleCameraChanged = useCallback((ev: MapCameraChangedEvent) => {
    setCamera({ center: ev.detail.center, zoom: ev.detail.zoom });
  }, []);

  const handleMapClick = useCallback(
    (ev: MapMouseEvent) => {
      const latLng = ev.detail.latLng;
      if (latLng) {
        onClearStore();
        setInfoAnchor(null);
        onMoveDeliveryPin(latLng.lat, latLng.lng);
      }
    },
    [onClearStore, onMoveDeliveryPin]
  );

  if (loadingStatus === APILoadingStatus.FAILED || loadingStatus === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="h-[340px] w-full rounded-xl border border-slate-200 bg-slate-100 flex flex-col items-center justify-center p-6 text-center gap-2">
        <MapPin className="w-6 h-6 text-slate-400" />
        <p className="text-sm font-medium text-slate-800">
          Google Map could not be loaded right now.
        </p>
        <p className="text-xs text-slate-500">
          You can still enter your city or 6-digit Indian PIN above to update platform availability.
        </p>
      </div>
    );
  }

  return (
    <div className="h-[340px] w-full rounded-xl overflow-hidden border border-slate-200 relative bg-slate-100">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        center={camera.center}
        zoom={camera.zoom}
        onCameraChanged={handleCameraChanged}
        onClick={handleMapClick}
        gestureHandling="greedy"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Draggable Shopper Delivery Pin */}
        <AdvancedMarker
          position={{ lat: location.lat, lng: location.lng }}
          draggable={true}
          zIndex={1100}
          title={`Delivery pin: ${location.city} (${location.pincode})`}
          onDragEnd={(ev) => {
            const pos = ev.latLng;
            if (pos) {
              onMoveDeliveryPin(pos.lat(), pos.lng());
            }
          }}
        >
          <Pin
            background="#2563eb"
            borderColor="#1e3a8a"
            glyphColor="#ffffff"
            scale={1.2}
          />
        </AdvancedMarker>

        {/* Real Nearby Store Markers from Places API (New) */}
        {stores.map((store) => (
          <StoreMarker
            key={store.id}
            store={store}
            isSelected={selectedStore?.id === store.id}
            onSelect={(st, marker) => {
              onSelectStore(st);
              setInfoAnchor(marker);
            }}
          />
        ))}

        {selectedStore && infoAnchor && (
          <InfoWindow
            anchor={infoAnchor}
            pixelOffset={[0, -4]}
            onCloseClick={() => {
              onClearStore();
              setInfoAnchor(null);
            }}
          >
            <div className="max-w-[230px] p-1 space-y-1 text-slate-900">
              <div className="font-semibold text-xs leading-snug">{selectedStore.name}</div>
              <div className="text-[11px] text-slate-600">{selectedStore.category}</div>
              {selectedStore.address && (
                <div className="text-[11px] text-slate-500 leading-snug">
                  {selectedStore.address}
                </div>
              )}
              <div className="flex items-center gap-2 text-[11px] pt-0.5">
                {typeof selectedStore.rating === 'number' && (
                  <span className="font-medium text-amber-700">★ {selectedStore.rating}</span>
                )}
                {typeof selectedStore.openNow === 'boolean' && (
                  <span
                    className={
                      selectedStore.openNow ? 'text-emerald-700 font-medium' : 'text-rose-700'
                    }
                  >
                    {selectedStore.openNow ? 'Open now' : 'Closed'}
                  </span>
                )}
              </div>
              {selectedStore.googleMapsUri && (
                <a
                  href={selectedStore.googleMapsUri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline pt-0.5"
                >
                  <span>View on Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}

export function LocationMapPicker({
  location,
  onChangeLocation,
  onClose,
}: LocationMapPickerProps) {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || ''
  );
  const [loadingKey, setLoadingKey] = useState(!mapsApiKey);
  const [searchingPlace, setSearchingPlace] = useState(false);
  const [detectingGeo, setDetectingGeo] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [stores, setStores] = useState<NearbyStorePlace[]>([]);
  const [selectedStore, setSelectedStore] = useState<NearbyStorePlace | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  useEffect(() => {
    if (mapsApiKey) {
      setLoadingKey(false);
      return;
    }
    let active = true;
    fetch('/api/maps/config')
      .then((r) => r.json())
      .then((data: { apiKey?: string }) => {
        if (active && data.apiKey) {
          setMapsApiKey(data.apiKey);
        }
      })
      .catch(() => {
        // Handled cleanly in fallback UI
      })
      .finally(() => {
        if (active) setLoadingKey(false);
      });
    return () => {
      active = false;
    };
  }, [mapsApiKey]);

  const fetchNearbyStores = useCallback(async (lat: number, lng: number) => {
    setNearbyLoading(true);
    try {
      const res = await fetch('/api/maps/nearby', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng, radiusMeters: 5000 }),
      });
      const data = (await res.json()) as {
        stores?: NearbyStorePlace[];
        error?: string;
        quotaExceeded?: boolean;
      };
      if (res.status === 429 || data.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        setStatusNote(data.error ?? 'Google Places quota reached.');
        setStores([]);
      } else if (!res.ok) {
        setStatusNote(data.error ?? 'Could not fetch nearby stores right now.');
      } else {
        setStores(data.stores ?? []);
        setStatusNote(null);
      }
    } catch {
      setStatusNote('Network error loading nearby stores.');
    } finally {
      setNearbyLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mapsApiKey) {
      void fetchNearbyStores(location.lat, location.lng);
    }
  }, [mapsApiKey, location.lat, location.lng, fetchNearbyStores]);

  async function handleMoveDeliveryPin(lat: number, lng: number) {
    setSearchingPlace(true);
    setStatusNote(null);
    try {
      const res = await fetch('/api/maps/reverse-geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      });
      const data = (await res.json()) as {
        city?: string;
        neighborhood?: string;
        pincode?: string;
        formattedAddress?: string;
        quotaExceeded?: boolean;
        error?: string;
      };

      if (res.status === 429 || data.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }

      if (res.ok && (data.city || data.pincode)) {
        const label = [data.neighborhood, data.city].filter(Boolean).slice(0, 2).join(', ');
        const resolved = resolveCustomLocation(`${label} ${data.pincode ?? ''}`.trim(), {
          lat,
          lng,
          formattedAddress: data.formattedAddress,
        });
        onChangeLocation(resolved);
      } else {
        onChangeLocation(
          resolveCustomLocation(location.city, {
            lat,
            lng,
            formattedAddress: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
          })
        );
      }
    } catch {
      onChangeLocation(
        resolveCustomLocation(location.city, {
          lat,
          lng,
        })
      );
    } finally {
      setSearchingPlace(false);
    }
  }

  async function handleGeocodeQuery(rawQuery: string) {
    setSearchingPlace(true);
    setStatusNote(null);
    try {
      const res = await fetch('/api/maps/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: rawQuery }),
      });
      const data = (await res.json()) as {
        city?: string;
        neighborhood?: string;
        pincode?: string;
        lat?: number;
        lng?: number;
        formattedAddress?: string;
        quotaExceeded?: boolean;
        error?: string;
      };
      if (res.status === 429 || data.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      if (res.ok && typeof data.lat === 'number' && typeof data.lng === 'number') {
        const label = data.neighborhood || data.city || rawQuery;
        onChangeLocation(
          resolveCustomLocation(`${label} ${data.pincode ?? ''}`.trim(), {
            lat: data.lat,
            lng: data.lng,
            formattedAddress: data.formattedAddress,
          })
        );
      } else {
        onChangeLocation(resolveCustomLocation(rawQuery));
        if (data.error) setStatusNote(data.error);
      }
    } catch {
      onChangeLocation(resolveCustomLocation(rawQuery));
    } finally {
      setSearchingPlace(false);
    }
  }

  function handleDetectGps() {
    if (!navigator.geolocation) {
      setStatusNote('Browser location is not available — click the map or type your city/PIN.');
      return;
    }
    setDetectingGeo(true);
    setStatusNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDetectingGeo(false);
        void handleMoveDeliveryPin(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setDetectingGeo(false);
        setStatusNote('Location access was declined — click the map or type your PIN above.');
      },
      { timeout: 6000 }
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <Navigation className="w-4 h-4 text-blue-600" />
            <span>Delivery Pin &amp; Nearby Stores Map</span>
          </div>
          <p className="text-xs text-slate-500">
            Click anywhere on the map or drag the blue delivery pin to update nearby stores and platform availability.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDetectGps}
            disabled={detectingGeo}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
          >
            <LocateFixed className="w-3.5 h-3.5" />
            <span>{detectingGeo ? 'Locating...' : 'Use My Current Location'}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              Done
            </button>
          )}
        </div>
      </div>

      {/* Quick City Buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-500 mr-1">Popular hubs:</span>
        {INDIAN_LOCATIONS.map((loc) => (
          <button
            key={loc.id}
            type="button"
            onClick={() => onChangeLocation(loc)}
            className={`text-xs px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${
              location.id === loc.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            {loc.city} ({loc.pincode})
          </button>
        ))}
      </div>

      {loadingKey ? (
        <div className="h-[220px] rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading Google Maps...</span>
        </div>
      ) : mapsApiKey ? (
        <APIProvider
          apiKey={mapsApiKey}
          language="en"
          region="IN"
        >
          <PlacesAutocompleteBox
            searching={searchingPlace}
            onFallbackSubmit={handleGeocodeQuery}
            onPickPlace={(lat, lng, label, formattedAddress) => {
              onChangeLocation(
                resolveCustomLocation(label, {
                  lat,
                  lng,
                  formattedAddress,
                })
              );
            }}
          />

          {statusNote && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {statusNote}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
            <div className="lg:col-span-7 space-y-2">
              <InteractiveMapCanvas
                location={location}
                stores={stores}
                selectedStore={selectedStore}
                onSelectStore={setSelectedStore}
                onClearStore={() => setSelectedStore(null)}
                onMoveDeliveryPin={(lat, lng) => void handleMoveDeliveryPin(lat, lng)}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                <span className="truncate">
                  Active Pin: <strong className="text-slate-800">{location.city} ({location.pincode})</strong>
                  {location.formattedAddress ? ` — ${location.formattedAddress}` : ''}
                </span>
                <span className="font-mono tabular-nums">
                  {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                </span>
              </div>
            </div>

            {/* Nearby Retail & Electronics Stores List */}
            <div className="lg:col-span-5 border border-slate-200 rounded-xl bg-slate-50 p-3 space-y-2.5 max-h-[368px] overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Nearby Stores Within 5 km</span>
                </div>
                {nearbyLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}
              </div>

              {stores.length === 0 && !nearbyLoading ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  No retail stores found within 5 km of this pin. Try moving the pin closer to a city neighborhood.
                </p>
              ) : (
                <div className="space-y-2">
                  {stores.map((store) => {
                    const active = selectedStore?.id === store.id;
                    const distKm =
                      typeof store.distanceMeters === 'number'
                        ? store.distanceMeters < 1000
                          ? `${store.distanceMeters} m`
                          : `${(store.distanceMeters / 1000).toFixed(1)} km`
                        : '';
                    return (
                      <div
                        key={store.id}
                        className={`rounded-lg border p-2.5 transition-colors cursor-pointer ${
                          active
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                        onClick={() => setSelectedStore(store)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs font-semibold text-slate-900 leading-snug">
                            {store.name}
                          </div>
                          {distKm && (
                            <span className="text-[11px] font-mono text-slate-500 shrink-0 tabular-nums">
                              {distKm}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {store.category} · {store.address}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1.5 text-[11px]">
                          <div className="flex items-center gap-2">
                            {typeof store.rating === 'number' && (
                              <span className="inline-flex items-center gap-0.5 font-medium text-amber-700">
                                <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                                {store.rating}
                              </span>
                            )}
                            {typeof store.openNow === 'boolean' && (
                              <span
                                className={
                                  store.openNow ? 'text-emerald-700 font-medium' : 'text-rose-700'
                                }
                              >
                                {store.openNow ? 'Open now' : 'Closed'}
                              </span>
                            )}
                          </div>
                          {store.googleMapsUri && (
                            <a
                              href={store.googleMapsUri}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 text-blue-600 hover:underline font-medium"
                            >
                              <span>Maps</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </APIProvider>
      ) : (
        <div className="space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const input = form.elements.namedItem('manualCityInput') as HTMLInputElement | null;
              if (input?.value.trim()) {
                onChangeLocation(resolveCustomLocation(input.value));
                input.value = '';
              }
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              name="manualCityInput"
              type="text"
              placeholder="Type city or 6-digit Indian PIN (e.g. Pune 411001)..."
              className="flex-1 h-10 px-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            <button
              type="submit"
              className="h-10 px-4 bg-slate-900 hover:bg-blue-600 text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              Set Location
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
