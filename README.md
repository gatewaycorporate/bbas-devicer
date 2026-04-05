# bbas-devicer

**Bot Blocking & Anti-Scrape Middleware** for the FP-Devicer Intelligence Suite.  
Developed by [Gateway Corporate Solutions](https://gatewaycorporate.org).

---

## Overview

`bbas-devicer` enriches every `DeviceManager.identify()` call with a **bot score and action decision** — classifying each request as a real browser, a headless browser, a scraper, or a known crawler, and emitting an `allow` / `challenge` / `block` decision based on a configurable rule engine.

### What it does

| Step | Description |
|------|-------------|
| **UA analysis** | Classifies the `User-Agent` string against 38 known patterns: headless browsers, scrapers, HTTP clients, and legitimate crawlers. |
| **Header analysis** | Checks for missing required browser headers (`accept`, `accept-language`, `accept-encoding`), scraper debug headers, absent `sec-fetch-*` headers, and suspicious header ordering. |
| **Velocity** | Computes a sliding-window request rate and flags devices that exceed the configured threshold. |
| **Cross-plugin enrichment** | On Pro/Enterprise, reads ip-devicer (Tor, VPN, proxy, hosting, AI agent) and tls-devicer / peer-devicer signals to augment the score. |
| **Scoring** | Produces a composite bot score (0–100) from up to 13 named factors. |
| **Rule engine** | Evaluates a priority-sorted rule list; first match wins. Ships with sensible defaults and supports fully custom rules. |

---

## Installation

Install `bbas-devicer` as a standalone package:

```bash
npm install bbas-devicer
```

Install `bbas-devicer` with FP-Devicer:

```bash
npm install devicer.js bbas-devicer
```

Install the full Devicer Intelligence Suite meta-package:

```bash
npm install @gatewaycorporate/devicer-intel
```

Optional peer dependencies (install the ones matching your storage choice):

```bash
npm install better-sqlite3   # SQLite adapter
npm install ioredis           # Redis adapter
npm install pg                # PostgreSQL adapter
```

---

## Quick start

```ts
import { DeviceManager }  from 'devicer.js';
import { IpManager }      from 'ip-devicer';
import { TlsManager }     from 'tls-devicer';
import {
  BbasManager,
  createBbasMiddleware,
} from 'bbas-devicer';

// ── Initialise plugins ──────────────────────────────────────
const deviceManager = new DeviceManager({ /* … */ });

const ipManager   = new IpManager({ licenseKey: process.env.DEVICER_LICENSE_KEY });
const tlsManager  = new TlsManager({ licenseKey: process.env.DEVICER_LICENSE_KEY });
const bbasManager = new BbasManager({ licenseKey: process.env.DEVICER_LICENSE_KEY });

// Register ip-devicer and tls-devicer FIRST so their enrichmentInfo
// is available when bbas-devicer runs (post-processor ordering matters).
ipManager.registerWith(deviceManager);
tlsManager.registerWith(deviceManager);
bbasManager.registerWith(deviceManager);   // ← bbas runs last

await Promise.all([
  ipManager.init(),
  tlsManager.init(),
  bbasManager.init(),
]);

// ── Express middleware ──────────────────────────────────────
app.use(createBbasMiddleware(bbasManager, { mode: 'observe' }));

// ── In your route handler ────────────────────────────────────
app.post('/identify', async (req, res) => {
  const result = await deviceManager.identify(req.body, req.bbasContext);
  // result.bbasEnrichment  — full enrichment payload
  // result.bbasDecision    — 'allow' | 'challenge' | 'block'
  res.json(result);
});
```

---

## Storage adapters

| Adapter | Import | Use case |
|---------|--------|----------|
| In-memory *(default)* | built-in | Dev / testing / single-process |
| SQLite | `createSqliteBbasStorage` | Single-process production |
| PostgreSQL | `createPostgresBbasStorage` | Multi-process / HA |
| Redis | `createRedisBbasStorage` | Distributed / low-latency |

```ts
import { createSqliteBbasStorage } from 'bbas-devicer';

const bbasManager = new BbasManager({
  licenseKey: process.env.DEVICER_LICENSE_KEY,
  storage: createSqliteBbasStorage('/data/bbas.db'),
});
```

---

## Scoring factors

The bot score is an additive sum capped at 100:

| Factor | Points | Tier |
|--------|-------:|------|
| `headless_browser` | 45 | Free |
| `known_scraper_ua` | 40 | Free |
| `missing_browser_headers` | 30 | Free |
| `velocity_exceeded` | 25 | Free |
| `suspicious_header_order` | 15 | Free |
| `known_crawler` | 5 | Free |
| `tor_exit_node` | 40 | Pro+ |
| `tls_mismatch` | 25 | Pro+ |
| `vpn_proxy` | 20 | Pro+ |
| `hosting_ip` | 15 | Pro+ |
| `ai_agent` | 15 | Pro+ |
| `high_peer_taint` | 15 | Pro+ |
| `rdap_suspect` | 10 | Pro+ |

---

## Default rules

Rules are evaluated in ascending `priority` order; first match wins.

| Rule name | Priority | Condition | Action |
|-----------|----------|-----------|--------|
| `tor_block` | 100 | `isTor === true` | `block` |
| `headless_block` | 200 | `headless_browser` factor present | `block` |
| `velocity_block` | 300 | `velocity_exceeded` factor present | `block` |
| `scraper_ua_challenge` | 400 | `known_scraper_ua` factor present | `challenge` |
| `high_score_block` | 500 | `botScore >= 75` | `block` |
| `mid_score_challenge` | 600 | `botScore >= 50` | `challenge` |

Custom rules with `priority < 100` run before all defaults.

```ts
import { BbasManager, mergeRules, DEFAULT_RULES } from 'bbas-devicer';

const bbasManager = new BbasManager({
  rules: mergeRules(
    [
      {
        name: 'block_my_bad_asn',
        priority: 50,
        condition: (e) => e.crossPluginSignals?.rdapAsnOrg?.includes('BadASN') ?? false,
        action: 'block',
      },
    ],
    DEFAULT_RULES,
  ),
});
```

---

## Plugin pipeline

`bbas-devicer` registers as a DeviceManager post-processor named `'bbas'`. It should run **after** `ip-devicer`, `tls-devicer`, and `peer-devicer` so it can read their cached enrichment data for the cross-plugin scoring factors:

```
identify(payload, context)
   │
  ├─ network bundle reference
  │  ├─ 'ip'   post-processor  (ip-devicer)
  │  │      └─> enrichmentInfo.details.ip.isTor / isVpn / riskScore / …
  │  └─ 'tls'  post-processor  (tls-devicer)
  │         └─> enrichmentInfo.details.tls.consistencyScore / factors
   │
   ├─ 'peer' post-processor  (peer-devicer)
   │      └─> enrichmentInfo.details.peer.taintScore
   │
   └─ 'bbas' post-processor  (bbas-devicer)  ← register last
          ├─ analyzes UA, headers, velocity
          ├─ reads cross-plugin signals (Pro+)
          ├─ computes bot score + runs rule engine
          └─> result.bbasEnrichment + result.bbasDecision
```

---

## Enrichment result shape

```ts
{
  bbasDecision: 'allow' | 'challenge' | 'block',

  bbasEnrichment: {
    botScore:        number;     // 0–100, higher = more likely a bot
    botFactors:      string[];   // fired factor keys
    decision:        BotDecision;
    uaClassification: {
      isBot:      boolean;
      isHeadless: boolean;
      isCrawler:  boolean;
      botKind?:   'headless' | 'scraper' | 'http-client' | 'crawler';
      uaString:   string;
    };
    headerAnomalies: {
      missingBrowserHeaders: boolean;
      suspiciousHeaderOrder: boolean;
      anomalyFactors:        string[];
    };
    velocitySignals: {
      requestCount:      number;
      windowMs:          number;
      requestsPerMinute: number;
      exceedsThreshold:  boolean;
    };
    crossPluginSignals?: {          // Pro/Enterprise only
      isTor?:               boolean;
      isVpn?:               boolean;
      isProxy?:             boolean;
      isHosting?:           boolean;
      isAiAgent?:           boolean;
      aiAgentProvider?:     string;
      tlsConsistencyScore?: number;
      peerTaintScore?:      number;
      rdapAsnOrg?:          string;
    };
    consistencyScore: number;       // 0–100
  },
}
```

---

## Middleware options

```ts
createBbasMiddleware(manager, {
  mode: 'observe' | 'block',  // default: 'observe'
})
```

In `'observe'` mode the middleware only attaches `req.bbasContext` and defers the decision to after `identify()`. In `'block'` mode the same context is attached — the actual block/challenge response is applied at the application layer using `result.bbasDecision`.

---

## License tiers

| Tier | Price | Devices | Scoring factors |
|------|-------|---------|-----------------|
| Free | $0 | 10,000 | UA, headers, velocity |
| Pro | $49 / mo | Unlimited | All 13 factors incl. cross-plugin |
| Enterprise | $299 / mo | Unlimited | All 13 factors incl. cross-plugin |

You can obtain a license key through polar.sh [here](https://buy.polar.sh/polar_cl_0Y4djPLDe5yLdNUDKdtPGlFW5TG2ZpFD5qkb93HsSQc).

Without a key the library runs on the free tier automatically and logs a warning at startup.

---

## API reference

This project uses TypeDoc and publishes documentation at
[gatewaycorporate.github.io/bbas-devicer](https://gatewaycorporate.github.io/bbas-devicer/).

---

## License

Business Source License 1.1 — see [license.txt](./license.txt).