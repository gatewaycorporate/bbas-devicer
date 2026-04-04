// ────────────────────────────────────────────────────────────
//  headers — HTTP request header anomaly detector
// ────────────────────────────────────────────────────────────

import type { HeaderAnomalySignals } from '../../types.js';

// ── Constants ─────────────────────────────────────────────────

/**
 * Headers that every real browser sends on a standard page request.
 * Absence of any of these is a strong bot signal.
 */
const REQUIRED_BROWSER_HEADERS = ['accept', 'accept-language', 'accept-encoding'] as const;

/**
 * Debug / admin headers that scraping frameworks sometimes inject.
 * Presence is a near-definitive scraper signal.
 */
const SCRAPER_DEBUG_HEADERS = [
  'x-scraper',
  'x-crawler',
  'x-crawl-depth',
  'x-crawl-id',
  'x-spider',
  'x-bot',
] as const;

/**
 * `sec-fetch-*` headers are sent by all Chromium-based browsers on HTML
 * navigation requests. Their absence when a modern browser UA is claimed
 * is suspicious.
 */
const SEC_FETCH_HEADERS = ['sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest'] as const;

/**
 * In a genuine browser request, `user-agent` almost always appears before
 * `content-type`. A reversal is a weak indicator of a raw HTTP client.
 */
const UA_BEFORE_CONTENT_TYPE_EXPECTED = true;

// ── Helpers ────────────────────────────────────────────────────

function headerPresent(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): boolean {
  const v = headers[name.toLowerCase()];
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0 && v[0] !== '';
  return v.trim().length > 0;
}

function firstHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name.toLowerCase()];
  if (!v) return undefined;
  const raw = Array.isArray(v) ? v[0] : v;
  const trimmed = raw?.trim();
  return trimmed?.length ? trimmed : undefined;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Analyse HTTP request headers for bot/scraper anomalies.
 *
 * @param headers - Lower-cased header map from the incoming request.
 */
export function analyzeHeaders(
  headers: Record<string, string | string[] | undefined>,
): HeaderAnomalySignals {
  const factors: string[] = [];

  // ── 1. Required browser headers ──────────────────────────────
  let missingBrowserHeaders = false;
  for (const h of REQUIRED_BROWSER_HEADERS) {
    if (!headerPresent(headers, h)) {
      factors.push(`missing_${h.replace(/-/g, '_')}`);
      missingBrowserHeaders = true;
    }
  }

  // ── 2. Scraper debug headers ──────────────────────────────────
  for (const h of SCRAPER_DEBUG_HEADERS) {
    if (headerPresent(headers, h)) {
      factors.push('debug_scraper_header');
      break; // one factor is enough
    }
  }

  // ── 3. sec-fetch absence when UA claims a modern browser ─────
  const ua = firstHeaderValue(headers, 'user-agent') ?? '';
  const claimsModernBrowser = /Chrome\/[7-9]\d|Chrome\/1\d{2}/i.test(ua);
  if (claimsModernBrowser) {
    const missingSecFetch = SEC_FETCH_HEADERS.some((h) => !headerPresent(headers, h));
    if (missingSecFetch) {
      factors.push('missing_sec_fetch');
    }
  }

  // ── 4. Header order heuristic ─────────────────────────────────
  //
  // If both `user-agent` and `content-type` are present, and `content-type`
  // comes before `user-agent` in the key enumeration order, it suggests a
  // raw HTTP client (which builds headers programmatically, often adding
  // `content-type` first).
  let suspiciousHeaderOrder = false;
  if (UA_BEFORE_CONTENT_TYPE_EXPECTED) {
    const keys = Object.keys(headers).map((k) => k.toLowerCase());
    const uaIdx = keys.indexOf('user-agent');
    const ctIdx = keys.indexOf('content-type');
    if (uaIdx !== -1 && ctIdx !== -1 && ctIdx < uaIdx) {
      suspiciousHeaderOrder = true;
      factors.push('suspicious_header_order');
    }
  }

  return { missingBrowserHeaders, suspiciousHeaderOrder, anomalyFactors: factors };
}
