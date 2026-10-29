import { RestaurantConfig } from '../types';

/**
 * Returns the best public URL for QR codes.
 * Ensures mobile phones scanning the QR code reach the live hosted app,
 * not an inaccessible localhost address.
 */
export function getResolvedBaseUrl(config?: RestaurantConfig | null): string {
  // 1. Manually configured URL by the restaurant owner
  if (config?.publicAppUrl && config.publicAppUrl.trim()) {
    return cleanUrl(config.publicAppUrl.trim());
  }

  // 2. Cloud Run App URL injected by AI Studio environment
  const envAppUrl = (import.meta as any).env?.VITE_APP_URL || (typeof process !== 'undefined' ? (process as any).env?.APP_URL : '');
  if (envAppUrl && envAppUrl !== 'MY_APP_URL') {
    return cleanUrl(envAppUrl);
  }

  // 3. Fallback to browser location
  if (typeof window !== 'undefined' && window.location.origin) {
    return cleanUrl(window.location.origin);
  }

  return '';
}

function cleanUrl(url: string): string {
  let cleaned = url.replace(/\/+$/, '');
  // CRITICAL: ais-dev requires Google developer login and redirects to Google AI Studio.
  // ais-pre is the public Cloud Run endpoint that allows clients to open the menu directly without login!
  cleaned = cleaned.replace('ais-dev-', 'ais-pre-');
  return cleaned;
}

/**
 * Checks if the current base URL is running on localhost.
 * Localhost URLs will not open when scanned from a mobile phone camera.
 */
export function isLocalhostUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
}

/**
 * Builds the exact QR code target URL for a given table.
 */
export function getTableQrUrl(tableNumber: string, config?: RestaurantConfig | null): string {
  const base = getResolvedBaseUrl(config);
  const cleanNumber = tableNumber.trim();
  // Standard format with query parameter
  return `${base}/?mesa=${encodeURIComponent(cleanNumber)}`;
}

/**
 * Robustly parses a table number from any URL, search params, pathname, or hash.
 */
export function parseTableFromLocation(loc: Location): string | null {
  try {
    // 1. Check query parameters: ?mesa=05 or ?table=05 or ?m=05
    const params = new URLSearchParams(loc.search);
    const fromSearch = params.get('mesa') || params.get('table') || params.get('m');
    if (fromSearch) {
      return normalizeTableNumber(fromSearch);
    }

    // 2. Check hash: #mesa=05 or #/mesa/05 or #05
    if (loc.hash) {
      const hashContent = loc.hash.replace(/^#\/?/, '');
      const hashParams = new URLSearchParams(hashContent);
      const fromHashParam = hashParams.get('mesa') || hashParams.get('table');
      if (fromHashParam) {
        return normalizeTableNumber(fromHashParam);
      }
      const matchHash = hashContent.match(/(?:mesa\/|mesa-)?(\d+)/i);
      if (matchHash && matchHash[1]) {
        return normalizeTableNumber(matchHash[1]);
      }
    }

    // 3. Check pathname: /mesa/05 or /mesa-05 or /05
    if (loc.pathname) {
      const matchPath = loc.pathname.match(/\/mesa\/(\d+)/i) || loc.pathname.match(/\/mesa-(\d+)/i);
      if (matchPath && matchPath[1]) {
        return normalizeTableNumber(matchPath[1]);
      }
    }
  } catch (err) {
    console.error('Error parsing table from location', err);
  }

  return null;
}

export function normalizeTableNumber(numStr: string): string {
  const digits = numStr.trim().replace(/\D/g, '');
  if (!digits) return numStr.trim();
  return digits.padStart(2, '0');
}
