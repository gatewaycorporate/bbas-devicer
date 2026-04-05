// ────────────────────────────────────────────────────────────
//  Tests — scoring (bbas-devicer)
// ────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { computeBotScore, applyRules, computeConsistencyScore } from '../libs/scoring.js';
import { DEFAULT_RULES } from '../libs/rules.js';
import type { BbasEnrichment, BbasSnapshot, BbasRule } from '../types.js';

// ── Helpers ────────────────────────────────────────────────────

function makeEnrichment(overrides: Partial<BbasEnrichment> = {}): BbasEnrichment {
  return {
    botScore: 0,
    botFactors: [],
    decision: 'allow',
    uaClassification: {
      isBot: false,
      isHeadless: false,
      isCrawler: false,
      claimsLegitBrowser: false,
      uaString: '',
    },
    headerAnomalies: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
    velocitySignals: { requestCount: 0, windowMs: 60_000, requestsPerMinute: 0, exceedsThreshold: false },
    behavioralSignals: { hasData: false, isRobotic: false, factors: [], humanScore: 50 },
    consistencyScore: 100,
    ...overrides,
  };
}

function makeSnapshot(botScore: number): BbasSnapshot {
  return {
    id: 'snap-' + botScore,
    deviceId: 'dev-test',
    timestamp: new Date(),
    enrichment: makeEnrichment({ botScore }),
  };
}

// ── computeBotScore ────────────────────────────────────────────

describe('computeBotScore', () => {
  it('treats a legitimate browser UA as a negative factor clamped to 0', () => {
    const { score, factors } = computeBotScore({
      ua:      { isBot: false, isHeadless: false, isCrawler: false, claimsLegitBrowser: true, uaString: 'Mozilla/5.0', botKind: 'browser' },
      headers: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
      velocity: { requestCount: 5, windowMs: 60_000, requestsPerMinute: 5, exceedsThreshold: false },
      enableBehavioralAnalysis: false,
      enableCrossPlugin: false,
    });
    expect(score).toBe(0);
    expect(factors).toContain('legit_browser_ua');
  });

  it('adds 45 for headless_browser', () => {
    const { score, factors } = computeBotScore({
      ua:      { isBot: true, isHeadless: true, isCrawler: false, claimsLegitBrowser: false, uaString: 'HeadlessChrome', botKind: 'headless' },
      headers: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
      velocity: { requestCount: 1, windowMs: 60_000, requestsPerMinute: 1, exceedsThreshold: false },
      enableBehavioralAnalysis: false,
      enableCrossPlugin: false,
    });
    expect(score).toBeGreaterThanOrEqual(45);
    expect(factors).toContain('headless_browser');
  });

  it('adds 40 for known_scraper_ua (non-headless bot)', () => {
    const { score, factors } = computeBotScore({
      ua:      { isBot: true, isHeadless: false, isCrawler: false, claimsLegitBrowser: false, uaString: 'python-requests/2.x', botKind: 'scraper' },
      headers: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
      velocity: { requestCount: 1, windowMs: 60_000, requestsPerMinute: 1, exceedsThreshold: false },
      enableBehavioralAnalysis: false,
      enableCrossPlugin: false,
    });
    expect(score).toBeGreaterThanOrEqual(40);
    expect(factors).toContain('known_scraper_ua');
  });

  it('adds 10 for unknown_ua when no other UA classification applies', () => {
    const { score, factors } = computeBotScore({
      ua:      { isBot: false, isHeadless: false, isCrawler: false, claimsLegitBrowser: false, uaString: 'CustomThing/1.0' },
      headers: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
      velocity: { requestCount: 1, windowMs: 60_000, requestsPerMinute: 1, exceedsThreshold: false },
      enableBehavioralAnalysis: false,
      enableCrossPlugin: false,
    });
    expect(score).toBe(10);
    expect(factors).toContain('unknown_ua');
  });

  it('adds 30 for missing_browser_headers', () => {
    const { score, factors } = computeBotScore({
      ua:      { isBot: false, isHeadless: false, isCrawler: false, claimsLegitBrowser: false, uaString: '' },
      headers: { missingBrowserHeaders: true, suspiciousHeaderOrder: false, anomalyFactors: ['missing_accept'] },
      velocity: { requestCount: 1, windowMs: 60_000, requestsPerMinute: 1, exceedsThreshold: false },
      enableBehavioralAnalysis: false,
      enableCrossPlugin: false,
    });
    expect(score).toBeGreaterThanOrEqual(40);
    expect(factors).toContain('missing_browser_headers');
  });

  it('adds 25 for velocity_exceeded', () => {
    const { score, factors } = computeBotScore({
      ua:      { isBot: false, isHeadless: false, isCrawler: false, claimsLegitBrowser: true, uaString: 'Mozilla/5.0', botKind: 'browser' },
      headers: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
      velocity: { requestCount: 200, windowMs: 60_000, requestsPerMinute: 200, exceedsThreshold: true },
      enableBehavioralAnalysis: false,
      enableCrossPlugin: false,
    });
    expect(score).toBe(15);
    expect(factors).toContain('velocity_exceeded');
  });

  it('adds 40 for tor_exit_node when cross-plugin enabled', () => {
    const { score, factors } = computeBotScore({
      ua:      { isBot: false, isHeadless: false, isCrawler: false, claimsLegitBrowser: true, uaString: 'Mozilla/5.0', botKind: 'browser' },
      headers: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
      velocity: { requestCount: 0, windowMs: 60_000, requestsPerMinute: 0, exceedsThreshold: false },
      crossPlugin: { isTor: true },
      enableBehavioralAnalysis: false,
      enableCrossPlugin: true,
    });
    expect(factors).toContain('tor_exit_node');
    expect(score).toBe(30);
  });

  it('does not add cross-plugin factors when enableCrossPlugin is false', () => {
    const { factors } = computeBotScore({
      ua:      { isBot: false, isHeadless: false, isCrawler: false, claimsLegitBrowser: false, uaString: '' },
      headers: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
      velocity: { requestCount: 0, windowMs: 60_000, requestsPerMinute: 0, exceedsThreshold: false },
      crossPlugin: { isTor: true, isVpn: true },
      enableBehavioralAnalysis: false,
      enableCrossPlugin: false,
    });
    expect(factors).not.toContain('tor_exit_node');
    expect(factors).not.toContain('vpn_proxy');
  });

  it('caps score at 100', () => {
    const { score } = computeBotScore({
      ua:      { isBot: true, isHeadless: true, isCrawler: false, claimsLegitBrowser: false, uaString: 'HeadlessChrome', botKind: 'headless' },
      headers: { missingBrowserHeaders: true, suspiciousHeaderOrder: true, anomalyFactors: [] },
      velocity: { requestCount: 999, windowMs: 60_000, requestsPerMinute: 999, exceedsThreshold: true },
      crossPlugin: { isTor: true, isVpn: true, isHosting: true, isAiAgent: true, peerTaintScore: 90 },
      enableBehavioralAnalysis: true,
      enableCrossPlugin: true,
    });
    expect(score).toBe(100);
  });

  it('flags known_crawler (5 pts) for Googlebot without making isBot true', () => {
    const { score, factors } = computeBotScore({
      ua:      { isBot: false, isHeadless: false, isCrawler: true, claimsLegitBrowser: false, uaString: 'Googlebot', botKind: 'crawler' },
      headers: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
      velocity: { requestCount: 0, windowMs: 60_000, requestsPerMinute: 0, exceedsThreshold: false },
      enableBehavioralAnalysis: false,
      enableCrossPlugin: false,
    });
    expect(factors).toContain('known_crawler');
    expect(score).toBe(5);
  });

  it('adds free behavioral session factors even when advanced analysis is disabled', () => {
    const { score, factors } = computeBotScore({
      ua:      { isBot: false, isHeadless: false, isCrawler: false, claimsLegitBrowser: true, uaString: 'Mozilla/5.0', botKind: 'browser' },
      headers: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
      velocity: { requestCount: 0, windowMs: 60_000, requestsPerMinute: 0, exceedsThreshold: false },
      behavioral: { hasData: true, isRobotic: false, humanScore: 25, factors: ['no_prior_interaction', 'impossibly_fast_session'] },
      enableBehavioralAnalysis: false,
      enableCrossPlugin: false,
    });
    expect(factors).toContain('no_prior_interaction');
    expect(factors).toContain('impossibly_fast_session');
    expect(score).toBe(15);
  });

  it('ignores advanced behavioral factors when advanced analysis is disabled', () => {
    const { factors } = computeBotScore({
      ua:      { isBot: false, isHeadless: false, isCrawler: false, claimsLegitBrowser: false, uaString: '' },
      headers: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
      velocity: { requestCount: 0, windowMs: 60_000, requestsPerMinute: 0, exceedsThreshold: false },
      behavioral: { hasData: true, isRobotic: true, humanScore: 10, factors: ['robotic_mouse_pattern', 'instant_typing'] },
      enableBehavioralAnalysis: false,
      enableCrossPlugin: false,
    });
    expect(factors).not.toContain('robotic_mouse_pattern');
    expect(factors).not.toContain('instant_typing');
  });

  it('adds advanced behavioral penalties and bonuses when enabled', () => {
    const { score, factors } = computeBotScore({
      ua:      { isBot: false, isHeadless: false, isCrawler: false, claimsLegitBrowser: true, uaString: 'Mozilla/5.0', botKind: 'browser' },
      headers: { missingBrowserHeaders: false, suspiciousHeaderOrder: false, anomalyFactors: [] },
      velocity: { requestCount: 0, windowMs: 60_000, requestsPerMinute: 0, exceedsThreshold: false },
      behavioral: {
        hasData: true,
        isRobotic: false,
        humanScore: 60,
        factors: ['robotic_mouse_pattern', 'natural_typing'],
      },
      enableBehavioralAnalysis: true,
      enableCrossPlugin: false,
    });
    expect(factors).toContain('robotic_mouse_pattern');
    expect(factors).toContain('natural_typing');
    expect(score).toBe(10);
  });
});

// ── applyRules ─────────────────────────────────────────────────

describe('applyRules', () => {
  it('returns block when score >= blockThreshold (default 75)', () => {
    const e = makeEnrichment({ botScore: 80 });
    const decision = applyRules(e, DEFAULT_RULES, 50, 75);
    expect(decision).toBe('block');
  });

  it('returns challenge when score is between thresholds', () => {
    const e = makeEnrichment({ botScore: 60 });
    const decision = applyRules(e, DEFAULT_RULES, 50, 75);
    expect(decision).toBe('challenge');
  });

  it('returns allow when score is below challengeThreshold', () => {
    const e = makeEnrichment({ botScore: 20 });
    const decision = applyRules(e, DEFAULT_RULES, 50, 75);
    expect(decision).toBe('allow');
  });

  it('custom rule with priority 1 runs before default rules', () => {
    const customRule: BbasRule = {
      name:      'always_allow_custom',
      priority:  1,
      condition: () => true,
      action:    'allow',
    };
    // Score would normally trigger a block via defaults
    const e = makeEnrichment({
      botScore: 90,
      uaClassification: { isBot: true, isHeadless: true, isCrawler: false, claimsLegitBrowser: false, uaString: 'HeadlessChrome', botKind: 'headless' },
    });
    const decision = applyRules(e, [customRule, ...DEFAULT_RULES], 50, 75);
    expect(decision).toBe('allow');
  });

  it('tor_block rule fires for isTor regardless of score', () => {
    const e = makeEnrichment({
      botScore: 10,
      crossPluginSignals: { isTor: true },
    });
    const decision = applyRules(e, DEFAULT_RULES, 50, 75);
    expect(decision).toBe('block');
  });

  it('headless_block rule fires for headless browser', () => {
    const e = makeEnrichment({
      botScore: 45,
      uaClassification: { isBot: true, isHeadless: true, isCrawler: false, claimsLegitBrowser: false, uaString: 'HeadlessChrome', botKind: 'headless' },
    });
    const decision = applyRules(e, DEFAULT_RULES, 50, 75);
    expect(decision).toBe('block');
  });
});

// ── computeConsistencyScore ────────────────────────────────────

describe('computeConsistencyScore', () => {
  it('returns 50 for a new device with no history', () => {
    const e = makeEnrichment({ botScore: 30 });
    expect(computeConsistencyScore(e, [])).toBe(50);
  });

  it('returns high consistency when current score matches history', () => {
    const history = [makeSnapshot(30), makeSnapshot(32), makeSnapshot(28)];
    const e = makeEnrichment({ botScore: 30 });
    const score = computeConsistencyScore(e, history);
    expect(score).toBeGreaterThan(90);
  });

  it('returns low consistency on sudden score spike', () => {
    const history = [makeSnapshot(5), makeSnapshot(5), makeSnapshot(5)];
    const e = makeEnrichment({ botScore: 90 });
    const score = computeConsistencyScore(e, history);
    expect(score).toBeLessThan(20);
  });
});
