// ────────────────────────────────────────────────────────────
//  Tests — UA analyser (bbas-devicer)
// ────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { analyzeUserAgent } from '../../libs/analyzers/ua.js';

describe('analyzeUserAgent', () => {
  // ── Headless browsers ───────────────────────────────────────
  it('detects HeadlessChrome', () => {
    const r = analyzeUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/120',
    );
    expect(r.isBot).toBe(true);
    expect(r.isHeadless).toBe(true);
    expect(r.isCrawler).toBe(false);
    expect(r.botKind).toBe('headless');
  });

  it('detects Playwright', () => {
    const r = analyzeUserAgent('Mozilla/5.0 Playwright/1.40');
    expect(r.isHeadless).toBe(true);
    expect(r.isBot).toBe(true);
  });

  it('detects PhantomJS', () => {
    const r = analyzeUserAgent('PhantomJS/2.1.1');
    expect(r.isHeadless).toBe(true);
  });

  // ── Scrapers / HTTP clients ──────────────────────────────────
  it('detects python-requests as scraper (isBot, not headless)', () => {
    const r = analyzeUserAgent('python-requests/2.28.0');
    expect(r.isBot).toBe(true);
    expect(r.isHeadless).toBe(false);
    expect(r.isCrawler).toBe(false);
    expect(r.botKind).toBe('scraper');
  });

  it('detects scrapy', () => {
    const r = analyzeUserAgent('Scrapy/2.10.1 (+https://scrapy.org)');
    expect(r.isBot).toBe(true);
    expect(r.botKind).toBe('scraper');
  });

  it('detects curl as http-client', () => {
    const r = analyzeUserAgent('curl/7.88.1');
    expect(r.isBot).toBe(true);
    expect(r.botKind).toBe('http-client');
    expect(r.isHeadless).toBe(false);
  });

  it('detects Go-http-client', () => {
    const r = analyzeUserAgent('Go-http-client/2.0');
    expect(r.isBot).toBe(true);
    expect(r.botKind).toBe('http-client');
  });

  // ── Legitimate crawlers ──────────────────────────────────────
  it('classifies Googlebot as crawler — isBot false, isCrawler true', () => {
    const r = analyzeUserAgent(
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    );
    expect(r.isBot).toBe(false);
    expect(r.isCrawler).toBe(true);
    expect(r.botKind).toBe('crawler');
  });

  it('classifies Bingbot as crawler', () => {
    const r = analyzeUserAgent(
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
    );
    expect(r.isCrawler).toBe(true);
    expect(r.isBot).toBe(false);
  });

  // ── Normal browser ───────────────────────────────────────────
  it('returns clean result for a normal Chrome UA', () => {
    const r = analyzeUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(r.isBot).toBe(false);
    expect(r.isHeadless).toBe(false);
    expect(r.isCrawler).toBe(false);
    expect(r.botKind).toBeUndefined();
    expect(r.uaString).toContain('Chrome/120');
  });

  // ── Missing UA ───────────────────────────────────────────────
  it('returns clean result when UA is undefined', () => {
    const r = analyzeUserAgent(undefined);
    expect(r.isBot).toBe(false);
    expect(r.isHeadless).toBe(false);
    expect(r.uaString).toBe('');
  });

  it('preserves the raw uaString', () => {
    const ua = 'python-requests/2.28.0';
    expect(analyzeUserAgent(ua).uaString).toBe(ua);
  });
});
