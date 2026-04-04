// ────────────────────────────────────────────────────────────
//  Tests — middleware (bbas-devicer)
// ────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from 'vitest';
import { resolveIp, extractBbasContext, createBbasMiddleware } from '../libs/middleware.js';
import type { BbasRequest } from '../libs/middleware.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BbasManager } from '../core/BbasManager.js';

// ── Helpers ────────────────────────────────────────────────────

function makeReq(
  headers: Record<string, string | string[] | undefined> = {},
  remoteAddress = '127.0.0.1',
): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress },
  } as unknown as IncomingMessage;
}

function makeRes(): ServerResponse {
  return {
    writeHead: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;
}

// ── resolveIp ──────────────────────────────────────────────────

describe('resolveIp', () => {
  it('prefers CF-Connecting-IP over all others', () => {
    const req = makeReq({
      'cf-connecting-ip': '1.1.1.1',
      'x-forwarded-for':  '2.2.2.2',
    });
    expect(resolveIp(req)).toBe('1.1.1.1');
  });

  it('falls back to True-Client-IP when CF header absent', () => {
    const req = makeReq({ 'true-client-ip': '3.3.3.3', 'x-forwarded-for': '4.4.4.4' });
    expect(resolveIp(req)).toBe('3.3.3.3');
  });

  it('falls back to X-Real-IP', () => {
    const req = makeReq({ 'x-real-ip': '5.5.5.5', 'x-forwarded-for': '6.6.6.6' });
    expect(resolveIp(req)).toBe('5.5.5.5');
  });

  it('falls back to first IP in X-Forwarded-For', () => {
    const req = makeReq({ 'x-forwarded-for': '7.7.7.7, 8.8.8.8' });
    expect(resolveIp(req)).toBe('7.7.7.7');
  });

  it('falls back to socket.remoteAddress', () => {
    const req = makeReq({}, '9.9.9.9');
    expect(resolveIp(req)).toBe('9.9.9.9');
  });
});

// ── extractBbasContext ─────────────────────────────────────────

describe('extractBbasContext', () => {
  it('populates ip from resolved IP', () => {
    const req = makeReq({ 'cf-connecting-ip': '10.0.0.1' });
    const ctx = extractBbasContext(req);
    expect(ctx.ip).toBe('10.0.0.1');
  });

  it('populates userId from x-user-id header', () => {
    const req = makeReq({ 'x-user-id': 'user-42', 'cf-connecting-ip': '1.2.3.4' });
    const ctx = extractBbasContext(req);
    expect(ctx.userId).toBe('user-42');
  });

  it('includes a copy of all headers (lower-cased)', () => {
    const req = makeReq({ 'Content-Type': 'application/json', 'Accept': 'text/html' });
    const ctx = extractBbasContext(req);
    expect(ctx.headers).toBeDefined();
    // Headers from IncomingMessage come pre-lower-cased in Node HTTP
    expect(Object.keys(ctx.headers!).every((k) => k === k.toLowerCase())).toBe(true);
  });

  it('returns undefined ip when no IP headers present and no remoteAddress', () => {
    const req = {
      headers: {},
      socket:  { remoteAddress: undefined },
    } as unknown as IncomingMessage;
    const ctx = extractBbasContext(req);
    expect(ctx.ip).toBeUndefined();
  });
});

// ── createBbasMiddleware ───────────────────────────────────────

describe('createBbasMiddleware', () => {
  const fakeMgr = {} as BbasManager;

  it('observe mode always calls next regardless of context', () => {
    const middleware = createBbasMiddleware(fakeMgr, { mode: 'observe' });
    const req  = makeReq({ 'cf-connecting-ip': '1.2.3.4' });
    const res  = makeRes();
    const next = vi.fn();

    middleware(req as Parameters<typeof middleware>[0], res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it('block mode calls next (decision happens post-identify)', () => {
    const middleware = createBbasMiddleware(fakeMgr, { mode: 'block' });
    const req  = makeReq({ 'cf-connecting-ip': '1.2.3.4' });
    const res  = makeRes();
    const next = vi.fn();

    // Middleware only extracts context — does not block before identify()
    middleware(req as Parameters<typeof middleware>[0], res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('attaches bbasContext to the request', () => {
    const middleware = createBbasMiddleware(fakeMgr, { mode: 'observe' });
    const req  = makeReq({ 'cf-connecting-ip': '11.22.33.44' });
    const res  = makeRes();
    const next = vi.fn();

    middleware(req as Parameters<typeof middleware>[0], res, next);
    expect((req as unknown as BbasRequest).bbasContext).toBeDefined();
  });
});
