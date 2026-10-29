// Weather: Open-Meteo fetch (no key, CORS enabled), 15-minute cache, offline fallbacks,
// location via geolocation button or city search. Never throws into the UI.

import { wmoToCond, clamp } from './config.js';

const CACHE_KEY = 'halcyon.weather.v1';
const TTL = 15 * 60 * 1000;

// Neutral default state before any fetch succeeds.
const CLEAR_STATE = {
  cond: 'clear', cloud: 0.18, wind: 0.25, windDeg: 220, temp: 14,
  isDay: 1, sunrise: null, sunset: null, fetchedAt: 0, live: false,
};

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || !c.state || !c.place) return null;
    return c;
  } catch { return null; }
}

function writeCache(place, state) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ place, state, at: Date.now() })); } catch { }
}

export class WeatherEngine {
  constructor() {
    this.state = { ...CLEAR_STATE };
    this.place = null;          // { name, lat, lon, tz }
    this.onChange = null;       // fn(state)
    this.onPlace = null;        // fn(place)
    this._inflight = false;
    this._lastFetch = 0;
    const cached = readCache();
    if (cached) {
      this.place = cached.place;
      this.state = { ...CLEAR_STATE, ...cached.state };
      this._lastFetch = cached.at || 0;
    }
  }

  get isStale() { return Date.now() - this._lastFetch > TTL; }

  setPlace(place, { fetchNow = true } = {}) {
    this.place = place;
    if (this.onPlace) this.onPlace(place);
    if (fetchNow) this.refresh(true);
    else this._emit();
  }

  // Device-timezone start: no geolocation prompt, no fetch until a place exists.
  adoptDeviceDefaults(tz) {
    if (this.place) return;
    const name = tz ? tz.split('/').pop().replace(/_/g, ' ') : 'Local time';
    this._deviceName = name;
    if (this.onPlace) this.onPlace({ name, lat: null, lon: null, tz, device: true });
  }

  _emit() { if (this.onChange) this.onChange(this.state); }

  async refresh(force = false) {
    if (!this.place || this.place.device || (!this.place.lat && this.place.lat !== 0)) return;
    if (this._inflight) return;
    if (!force && !this.isStale) return;
    this._inflight = true;
    try {
      const p = this.place;
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${p.lat.toFixed(3)}&longitude=${p.lon.toFixed(3)}` +
        `&current=temperature_2m,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation,is_day` +
        `&daily=sunrise,sunset&timezone=auto&forecast_days=2`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('http ' + res.status);
      const d = await res.json();
      const c = d.current || {};
      const daily = d.daily || {};
      const state = {
        cond: wmoToCond(c.weather_code ?? 0),
        cloud: clamp((c.cloud_cover ?? 20) / 100, 0, 1),
        wind: clamp((c.wind_speed_10m ?? 8) / 40, 0, 1),
        windDeg: c.wind_direction_10m ?? 220,
        temp: c.temperature_2m ?? 14,
        isDay: c.is_day ?? 1,
        sunrise: daily.sunrise?.[0] || null,
        sunset: daily.sunset?.[0] || null,
        tz: d.timezone || p.tz,
        fetchedAt: Date.now(),
        live: true,
      };
      this.state = state;
      this._lastFetch = Date.now();
      if (state.sunrise && p.tz !== state.tz) { /* keep place tz in sync */ p.tz = state.tz; if (this.onPlace) this.onPlace(p); }
      writeCache(this.place, state);
      this._emit();
    } catch {
      // Offline or API down: keep last state (cached or clear). Never surface an error.
      this.state.live = false;
    } finally {
      this._inflight = false;
    }
  }

  async search(query) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('http ' + res.status);
    const d = await res.json();
    return (d.results || []).map(r => ({
      name: r.name, country: r.country, admin: r.admin1,
      lat: r.latitude, lon: r.longitude, tz: r.timezone,
    }));
  }

  geolocate() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) return reject(new Error('unsupported'));
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          name: 'My location',
          lat: pos.coords.latitude, lon: pos.coords.longitude,
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        err => reject(err),
        { timeout: 10000, maximumAge: 600000 },
      );
    });
  }
}
