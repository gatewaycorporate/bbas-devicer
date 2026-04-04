// ────────────────────────────────────────────────────────────
//  Tests — license validation (bbas-devicer)
// ────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  validateLicense,
  evictLicenseCache,
  POLAR_BENEFIT_IDS,
  FREE_TIER_MAX_DEVICES,
} from '../libs/license.js';

const KEY_PRO        = 'BBAS-TEST-PRO-XXXX';
const KEY_ENTERPRISE = 'BBAS-TEST-ENT-XXXX';
const KEY_INVALID    = 'BBAS-TEST-BAD-XXXX';

afterEach(() => {
  vi.unstubAllGlobals();
  evictLicenseCache(KEY_PRO);
  evictLicenseCache(KEY_ENTERPRISE);
  evictLicenseCache(KEY_INVALID);
});

// ── Pro tier ───────────────────────────────────────────────────

describe('validateLicense — pro', () => {
  it('returns valid pro LicenseInfo for a pro benefit ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'granted', benefit_id: POLAR_BENEFIT_IDS.pro }),
    }));

    const info = await validateLicense(KEY_PRO);
    expect(info.valid).toBe(true);
    expect(info.tier).toBe('pro');
    expect(info.maxDevices).toBeUndefined();
  });
});

// ── Enterprise tier ────────────────────────────────────────────

describe('validateLicense — enterprise', () => {
  it('returns valid enterprise LicenseInfo for an enterprise benefit ID', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'granted', benefit_id: POLAR_BENEFIT_IDS.enterprise }),
    }));

    const info = await validateLicense(KEY_ENTERPRISE);
    expect(info.valid).toBe(true);
    expect(info.tier).toBe('enterprise');
  });
});

// ── Invalid key ────────────────────────────────────────────────

describe('validateLicense — invalid key', () => {
  it('returns free tier when Polar status is not "granted"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'revoked', benefit_id: POLAR_BENEFIT_IDS.pro }),
    }));

    const info = await validateLicense(KEY_INVALID);
    expect(info.valid).toBe(false);
    expect(info.tier).toBe('free');
    expect(info.maxDevices).toBe(FREE_TIER_MAX_DEVICES);
  });

  it('returns free tier when Polar returns a non-200 status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const info = await validateLicense(KEY_INVALID);
    expect(info.valid).toBe(false);
    expect(info.tier).toBe('free');
  });
});

// ── Network failure ────────────────────────────────────────────

describe('validateLicense — network failure', () => {
  it('falls back to free without throwing when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const info = await validateLicense(KEY_INVALID);
    expect(info.valid).toBe(false);
    expect(info.tier).toBe('free');
  });
});

// ── Cache behaviour ────────────────────────────────────────────

describe('validateLicense — caching', () => {
  it('returns cached result on second call without a new fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'granted', benefit_id: POLAR_BENEFIT_IDS.pro }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await validateLicense(KEY_PRO);
    await validateLicense(KEY_PRO);

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('evictLicenseCache forces a fresh Polar request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'granted', benefit_id: POLAR_BENEFIT_IDS.pro }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await validateLicense(KEY_PRO);
    evictLicenseCache(KEY_PRO);
    await validateLicense(KEY_PRO);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
