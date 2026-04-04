// ────────────────────────────────────────────────────────────
//  Tests — header anomaly analyser (bbas-devicer)
// ────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { analyzeHeaders } from '../../libs/analyzers/headers.js';

// ── Full browser headers ───────────────────────────────────────

const BROWSER_HEADERS = {
  'user-agent':      'Mozilla/5.0 (Windows NT 10.0) Chrome/120',
  'accept':          'text/html,application/xhtml+xml',
  'accept-language': 'en-US,en;q=0.9',
  'accept-encoding': 'gzip, deflate, br',
  'sec-fetch-site':  'none',
  'sec-fetch-mode':  'navigate',
  'sec-fetch-dest':  'document',
};

describe('analyzeHeaders — clean browser request', () => {
  it('returns no anomalies for a full browser header set', () => {
    const r = analyzeHeaders(BROWSER_HEADERS);
    expect(r.missingBrowserHeaders).toBe(false);
    expect(r.anomalyFactors).toHaveLength(0);
  });
});

// ── Missing required headers ──────────────────────────────────

describe('analyzeHeaders — missing required headers', () => {
  it('flags missingBrowserHeaders when accept is absent', () => {
    const { accept: _omit, ...headers } = BROWSER_HEADERS;
    const r = analyzeHeaders(headers);
    expect(r.missingBrowserHeaders).toBe(true);
    expect(r.anomalyFactors).toContain('missing_accept');
  });

  it('flags missingBrowserHeaders when accept-language is absent', () => {
    const headers = { ...BROWSER_HEADERS };
    delete (headers as Record<string, string>)['accept-language'];
    const r = analyzeHeaders(headers);
    expect(r.missingBrowserHeaders).toBe(true);
    expect(r.anomalyFactors).toContain('missing_accept_language');
  });

  it('flags missingBrowserHeaders when accept-encoding is absent', () => {
    const headers = { ...BROWSER_HEADERS };
    delete (headers as Record<string, string>)['accept-encoding'];
    const r = analyzeHeaders(headers);
    expect(r.missingBrowserHeaders).toBe(true);
    expect(r.anomalyFactors).toContain('missing_accept_encoding');
  });

  it('flags all three when all required headers are absent', () => {
    const r = analyzeHeaders({ 'user-agent': 'curl/7.88.1' });
    expect(r.missingBrowserHeaders).toBe(true);
    expect(r.anomalyFactors).toContain('missing_accept');
    expect(r.anomalyFactors).toContain('missing_accept_language');
    expect(r.anomalyFactors).toContain('missing_accept_encoding');
  });
});

// ── Scraper debug headers ──────────────────────────────────────

describe('analyzeHeaders — debug scraper headers', () => {
  it('adds debug_scraper_header factor when x-scraper is present', () => {
    const r = analyzeHeaders({ ...BROWSER_HEADERS, 'x-scraper': 'true' });
    expect(r.anomalyFactors).toContain('debug_scraper_header');
  });

  it('adds debug_scraper_header factor when x-crawl-depth is present', () => {
    const r = analyzeHeaders({ ...BROWSER_HEADERS, 'x-crawl-depth': '3' });
    expect(r.anomalyFactors).toContain('debug_scraper_header');
  });

  it('does not add factor for normal headers', () => {
    const r = analyzeHeaders(BROWSER_HEADERS);
    expect(r.anomalyFactors).not.toContain('debug_scraper_header');
  });
});

// ── Header order heuristic ────────────────────────────────────

describe('analyzeHeaders — suspicious header order', () => {
  it('flags suspicious_header_order when content-type appears before user-agent', () => {
    const r = analyzeHeaders({
      'content-type': 'application/json',
      'user-agent':   'python-requests/2.28.0',
      'accept':       '*/*',
      'accept-language': 'en',
      'accept-encoding': 'gzip',
    });
    expect(r.suspiciousHeaderOrder).toBe(true);
    expect(r.anomalyFactors).toContain('suspicious_header_order');
  });

  it('does not flag when user-agent appears before content-type', () => {
    const r = analyzeHeaders({
      'user-agent':   'Mozilla/5.0',
      'content-type': 'application/json',
      'accept':       'text/html',
      'accept-language': 'en',
      'accept-encoding': 'gzip',
    });
    expect(r.suspiciousHeaderOrder).toBe(false);
  });
});

// ── Empty headers ─────────────────────────────────────────────

describe('analyzeHeaders — empty headers object', () => {
  it('flags all required headers as missing', () => {
    const r = analyzeHeaders({});
    expect(r.missingBrowserHeaders).toBe(true);
    expect(r.anomalyFactors.length).toBeGreaterThan(0);
  });
});
