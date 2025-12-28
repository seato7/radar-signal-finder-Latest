import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { SlackAlerter, sendNoDataFoundAlert } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// v10 - Discover Barchart XHR endpoints (from HTML/JS via Firecrawl) and fetch options chain JSON via Firecrawl
// Constraints: single-file change, no new env vars, flow_type always null, bounded waits to avoid Edge timeouts.

interface ParsedOption {
  ticker: string;
  option_type: string;
  strike_price: number;
  expiration_date: string | null;
  volume: number;
  open_interest: number | null;
  implied_volatility: number | null;
  premium: number | null;
  flow_type: null;
  sentiment: string;
  trade_date: string;
  metadata: Record<string, any>;
}

type FirecrawlFormats = ('html' | 'rawHtml')[];

async function firecrawlScrape(url: string, opts: { waitFor: number; formats: FirecrawlFormats; onlyMainContent?: boolean }) {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    return { ok: false, status: 500, content: null as string | null, error: 'FIRECRAWL_API_KEY not configured' };
  }

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: opts.formats,
        waitFor: opts.waitFor,
        onlyMainContent: opts.onlyMainContent ?? false,
      }),
    });

    const status = res.status;
    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, status, content: null, error: txt.slice(0, 200) };
    }

    const data = await res.json();
    const html = data?.data?.html ?? data?.html ?? null;
    const rawHtml = data?.data?.rawHtml ?? data?.rawHtml ?? null;
    const content = (rawHtml && typeof rawHtml === 'string') ? rawHtml : (typeof html === 'string' ? html : null);

    return { ok: true, status, content, error: null as string | null };
  } catch (e) {
    return { ok: false, status: 0, content: null, error: String(e) };
  }
}

async function throttle(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

function uniqueLimit(arr: string[], limit: number) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of arr) {
    const key = s.trim();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= limit) break;
  }
  return out;
}

function findCandidateEndpoints(text: string): string[] {
  const candidates: string[] = [];

  const pushAll = (re: RegExp) => {
    let m;
    while ((m = re.exec(text)) !== null) {
      // strip trailing punctuation that often appears in bundles
      let s = m[0];
      s = s.replace(/\\u002F/g, '/');
      s = s.replace(/["'`\)\]\}>,;]+$/g, '');
      candidates.push(s);
    }
  };

  // Relative paths
  pushAll(/\/proxies\/core-api\/[A-Za-z0-9_\-\/\?\=\&\.%]+/g);
  pushAll(/\/(?:api|apis|data)\/[A-Za-z0-9_\-\/\?\=\&\.%]+/g);

  // Common keywords that might appear as endpoints or fragments
  pushAll(/\/[A-Za-z0-9_\-\/\?\=\&\.%]*(?:options\/chain|option-chain|options\-chain)[A-Za-z0-9_\-\/\?\=\&\.%]*/gi);
  pushAll(/\/[A-Za-z0-9_\-\/\?\=\&\.%]*(?:getQuote|quote|quotes)[A-Za-z0-9_\-\/\?\=\&\.%]*/gi);
  pushAll(/\/[A-Za-z0-9_\-\/\?\=\&\.%]+\.json\b/gi);
  pushAll(/\/[A-Za-z0-9_\-\/\?\=\&\.%]*graphql[A-Za-z0-9_\-\/\?\=\&\.%]*/gi);

  // Absolute URLs
  pushAll(/https?:\/\/[A-Za-z0-9\-\.]+barchart\.com[A-Za-z0-9_\-\/\?\=\&\.%]+/gi);

  // Filter down to things that look like endpoints (must contain one of the target hints)
  const hints = ['proxies/core-api', 'options', 'chain', 'option-chain', 'getQuote', 'quote', '.json', 'graphql'];
  const filtered = candidates.filter((c) => {
    const lc = c.toLowerCase();
    return hints.some((h) => lc.includes(h));
  });

  return uniqueLimit(filtered, 200);
}

function extractBundleScriptSrcs(html: string): string[] {
  const urls: string[] = [];
  const re = /<script[^>]+src="([^"]+)"[^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    if (!src) continue;
    const lc = src.toLowerCase();
    const isBundle = lc.includes('/_next/') || lc.includes('bundle') || lc.includes('app') || lc.includes('main') || lc.includes('.js');
    if (!isBundle) continue;
    const full = src.startsWith('http') ? src : `https://www.barchart.com${src.startsWith('/') ? '' : '/'}${src}`;
    urls.push(full);
    if (urls.length >= 3) break;
  }
  return urls;
}

function scoreEndpointCandidate(candidate: string): number {
  const lc = candidate.toLowerCase();
  let score = 0;
  if (lc.includes('proxies/core-api')) score += 50;
  if (lc.includes('options')) score += 30;
  if (lc.includes('chain') || lc.includes('option-chain')) score += 30;
  if (lc.includes('symbol=') || lc.includes('ticker=') || lc.includes('symbols=')) score += 20;
  if (lc.includes('.json') || lc.includes('graphql')) score += 10;
  if (lc.includes('getquote') || lc.includes('quote')) score -= 5;
  // Penalize obvious navigation URLs that are not XHR endpoints
  if (lc.includes('/stocks/quotes/') && lc.includes('/options')) score -= 30;
  if (lc.endsWith('/options') || lc.includes('/options"') || lc.includes('/options<')) score -= 20;
  return score;
}

function isHighSignalEndpoint(candidate: string): boolean {
  const lc = candidate.toLowerCase();
  // We only treat these as likely XHR/API endpoints (otherwise we keep scanning bundles)
  const isCoreApi = lc.includes('proxies/core-api');
  const isOptionsChain = lc.includes('options/chain') || lc.includes('option-chain') || (lc.includes('options') && lc.includes('chain'));
  const isJsonLike = lc.includes('.json') || lc.includes('graphql');
  const hasSymbolParam = lc.includes('symbol=') || lc.includes('ticker=') || lc.includes('symbols=');

  // Prefer endpoints that look like API calls, not page URLs
  if (isCoreApi) return true;
  if (isOptionsChain && (hasSymbolParam || isJsonLike)) return true;
  if (isOptionsChain && hasSymbolParam) return true;
  if (isJsonLike && (hasSymbolParam || lc.includes('options'))) return true;
  return false;
}

function toAbsoluteBarchartUrl(candidate: string): string {
  if (candidate.startsWith('http://') || candidate.startsWith('https://')) return candidate;
  if (candidate.startsWith('/')) return `https://www.barchart.com${candidate}`;
  // handle protocol-relative URLs like //www.barchart.com/...
  if (candidate.startsWith('//')) return `https:${candidate}`;
  return `https://www.barchart.com/${candidate}`;
}

function applyTickerToEndpoint(endpointUrl: string, ticker: string): string {
  try {
    const url = new URL(endpointUrl);
    // Replace common query keys
    const keys = ['symbol', 'ticker', 'symbols'];
    for (const key of keys) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, ticker);
      }
    }
    // Some endpoints use "symbols" as comma list; keep single
    if (url.searchParams.has('symbols')) {
      url.searchParams.set('symbols', ticker);
    }
    const s = url.toString();
    // Also replace path segments that might embed the ticker
    return s.replaceAll('/SPY/', `/${ticker}/`).replaceAll('/spy/', `/${ticker.toLowerCase()}/`);
  } catch {
    return endpointUrl;
  }
}

function jsonPreview(text: string, maxLen: number) {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.slice(0, maxLen);
}

function extractJsonPayload(text: string): { ok: boolean; json: any; error?: string } {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return { ok: true, json: JSON.parse(trimmed) };
    } catch (e) {
      return { ok: false, json: null, error: `JSON.parse failed: ${String(e)}` };
    }
  }

  // Sometimes JSON is wrapped in <pre> or HTML. Try to locate first { and last }.
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) {
    const slice = text.slice(first, last + 1);
    try {
      return { ok: true, json: JSON.parse(slice) };
    } catch (e) {
      return { ok: false, json: null, error: `JSON.parse (slice) failed: ${String(e)}` };
    }
  }

  return { ok: false, json: null, error: 'Response does not look like JSON' };
}

function parseDateToISO(val: any): string | null {
  if (!val) return null;
  if (typeof val === 'string') {
    // already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    // YYMMDD
    const m = val.match(/\b(\d{2})(\d{2})(\d{2})\b/);
    if (m) return `20${m[1]}-${m[2]}-${m[3]}`;
  }
  if (typeof val === 'number') {
    const d = new Date(val * (val > 1e12 ? 1 : 1000));
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
  }
  return null;
}

function toInt(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (!isFinite(val)) return null;
    return Math.round(val);
  }
  if (typeof val === 'string') {
    const n = parseInt(val.replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  return null;
}

function toFloat(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    if (!isFinite(val)) return null;
    return val;
  }
  if (typeof val === 'string') {
    const n = parseFloat(val.replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }
  return null;
}

function normalizeIV(iv: number | null): number | null {
  if (iv === null) return null;
  let v = iv;
  // percent -> decimal
  if (v > 1) v = v / 100;
  if (v <= 0 || v > 5) return null;
  return v;
}

function findOptionContractsInJson(json: any): any[] {
  const out: any[] = [];
  const seen = new Set<string>();

  const push = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    // Try to create a stable key to dedupe
    const key = JSON.stringify({
      s: obj.symbol ?? obj.contractSymbol ?? obj.occSymbol ?? obj.id ?? null,
      k: obj.strike ?? obj.strikePrice ?? obj.Strike ?? null,
      e: obj.expiration ?? obj.expirationDate ?? obj.expiry ?? obj.expiryDate ?? null,
      v: obj.volume ?? obj.totalVolume ?? obj.Volume ?? null,
      t: obj.optionType ?? obj.type ?? obj.putCall ?? obj.callPut ?? null,
    });
    if (seen.has(key)) return;
    seen.add(key);
    out.push(obj);
  };

  function walk(node: any, depth: number, forcedType?: 'call' | 'put') {
    if (!node || depth > 10) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item, depth + 1, forcedType);
      }
      return;
    }

    if (typeof node !== 'object') return;

    const hasStrike = node.strike !== undefined || node.strikePrice !== undefined || node.Strike !== undefined;
    const hasVol = node.volume !== undefined || node.totalVolume !== undefined || node.Volume !== undefined;

    if (hasStrike && hasVol) {
      // annotate if we have a forced type
      if (forcedType && node.optionType === undefined && node.type === undefined && node.putCall === undefined && node.callPut === undefined) {
        (node as any).__forcedType = forcedType;
      }
      push(node);
      // still keep walking in case nested objects exist
    }

    for (const [k, v] of Object.entries(node)) {
      const lk = k.toLowerCase();
      if (lk === 'calls') walk(v, depth + 1, 'call');
      else if (lk === 'puts') walk(v, depth + 1, 'put');
      else walk(v, depth + 1, forcedType);
    }
  }

  walk(json, 0);
  return out;
}

function normalizeContract(raw: any, ticker: string, endpointUsed: string, fetchStatus: number): ParsedOption | null {
  const strike = toFloat(raw.strike ?? raw.strikePrice ?? raw.Strike ?? raw.strike_price);
  if (!strike || strike <= 0 || strike > 10000) return null;

  const volume = toInt(raw.volume ?? raw.totalVolume ?? raw.Volume ?? raw.tradeVolume);
  if (!volume || volume <= 0) return null;

  // filter volume > 50
  if (volume <= 50) return null;

  let optionType: 'call' | 'put' = 'call';
  const typeVal = raw.optionType ?? raw.type ?? raw.callPut ?? raw.putCall ?? raw.__forcedType ?? '';
  if (typeof typeVal === 'string') {
    const t = typeVal.toLowerCase();
    optionType = (t.includes('put') || t === 'p') ? 'put' : 'call';
  } else if (typeVal === 'put' || typeVal === 'call') {
    optionType = typeVal;
  }

  const exp = parseDateToISO(raw.expiration ?? raw.expirationDate ?? raw.expiry ?? raw.expiryDate ?? raw.Expiration);

  const openInterest = toInt(raw.openInterest ?? raw.OpenInterest ?? raw.oi ?? raw.open_interest ?? raw.openInt) ?? null;
  const iv = normalizeIV(toFloat(raw.impliedVolatility ?? raw.implied_volatility ?? raw.iv ?? raw.IV ?? raw.impliedVol) ?? null);

  const price = toFloat(raw.lastPrice ?? raw.last ?? raw.mark ?? raw.midpoint ?? raw.price ?? raw.Last ?? raw.last_price ?? raw.markPrice) ?? null;
  const premium = (price && price > 0) ? Math.round(price * volume * 100) : null;

  const missing: string[] = [];
  if (openInterest === null) missing.push('open_interest');
  if (iv === null) missing.push('implied_volatility');
  if (price === null) missing.push('price');

  return {
    ticker,
    option_type: optionType,
    strike_price: strike,
    expiration_date: exp,
    volume,
    open_interest: openInterest,
    implied_volatility: iv,
    premium,
    flow_type: null,
    sentiment: optionType === 'call' ? 'bullish' : 'bearish',
    trade_date: new Date().toISOString(),
    metadata: {
      source: 'barchart_firecrawl_xhr',
      endpoint_used: endpointUsed,
      fetch_status: fetchStatus,
      premium_available: premium !== null,
      iv_available: iv !== null,
      extraction: 'json',
      warnings: missing.length ? [`missing:${missing.join(',')}`] : undefined,
      raw_symbol: raw.symbol ?? raw.Symbol ?? raw.contractSymbol ?? raw.occSymbol ?? null,
    }
  };
}

async function discoverEndpointFromHtmlOrBundles(html: string, debug: boolean) {
  const htmlCandidates = findCandidateEndpoints(html);

  // Best candidate from HTML
  const sortedHtml = [...htmlCandidates].sort((a, b) => scoreEndpointCandidate(b) - scoreEndpointCandidate(a));
  const bestHtml = sortedHtml[0] ? toAbsoluteBarchartUrl(sortedHtml[0]) : null;

  return { htmlCandidates, bestHtml };
}

async function discoverEndpointViaBundlesIfNeeded(html: string, debug: boolean) {
  const bundleUrls = extractBundleScriptSrcs(html);
  if (bundleUrls.length === 0) {
    return { bundleUrls, bundleWinners: [] as { url: string; candidates: string[] }[] };
  }

  const winners: { url: string; candidates: string[] }[] = [];

  for (const url of bundleUrls) {
    // low waitFor for static js
    const jsRes = await firecrawlScrape(url, { waitFor: 0, formats: ['rawHtml', 'html'], onlyMainContent: false });
    await throttle(400);

    const js = jsRes.content;
    if (!js || js.length < 5000) continue;

    const cands = findCandidateEndpoints(js);
    if (cands.length > 0) {
      winners.push({ url, candidates: cands });
      // stop early once we have candidates from a bundle
      break;
    }
  }

  return { bundleUrls, bundleWinners: winners };
}

function chooseEndpointDeterministically(candidates: string[]): string | null {
  if (!candidates.length) return null;
  const sorted = [...candidates].sort((a, b) => scoreEndpointCandidate(b) - scoreEndpointCandidate(a));
  return toAbsoluteBarchartUrl(sorted[0]);
}

async function fetchOptionsJsonViaEndpoint(endpointUrl: string) {
  const res = await firecrawlScrape(endpointUrl, { waitFor: 1500, formats: ['rawHtml', 'html'], onlyMainContent: false });
  const content = res.content ?? '';
  const preview = jsonPreview(content, 120);

  if (!res.ok || !res.content) {
    return { ok: false, status: res.status, json: null as any, preview, error: res.error ?? 'Firecrawl scrape failed' };
  }

  const parsed = extractJsonPayload(content);
  if (!parsed.ok) {
    return { ok: false, status: res.status, json: null as any, preview, error: parsed.error ?? 'Not JSON' };
  }

  return { ok: true, status: res.status, json: parsed.json, preview, error: null as string | null };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const slackAlerter = new SlackAlerter();

  try {
    console.log('[v10] Options flow ingestion - Discover Barchart XHR endpoint via Firecrawl');

    // Request body: tickers + debug
    let tickers = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META'];
    let debug = false;

    try {
      const body = await req.json();
      if (body?.tickers && Array.isArray(body.tickers) && body.tickers.length > 0) {
        tickers = body.tickers;
        console.log(`Using custom tickers: ${tickers.join(', ')}`);
      }
      if (body?.debug === true) {
        debug = true;
        console.log('[DEBUG MODE ENABLED]');
      }
    } catch {
      // ignore
    }

    // Step 1: Scrape first ticker options page and discover endpoints
    const firstTicker = tickers[0];
    const optionsPageUrl = `https://www.barchart.com/stocks/quotes/${firstTicker}/options`;
    const pageRes = await firecrawlScrape(optionsPageUrl, { waitFor: 4000, formats: ['rawHtml', 'html'], onlyMainContent: false });

    const html = pageRes.content ?? '';
    const htmlLength = html.length;
    console.log(`Firecrawl page ${firstTicker}: status=${pageRes.status}, html_length=${htmlLength}`);

    if (!pageRes.ok || !html || htmlLength < 5000) {
      const reason = `Failed to fetch options page HTML: status=${pageRes.status} err=${pageRes.error ?? 'unknown'}`;

      await sendNoDataFoundAlert(slackAlerter, 'ingest-options-flow', {
        sourcesAttempted: ['Barchart via Firecrawl (page scrape)'],
        reason,
      });

      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'warning',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl_Barchart_XHR',
        error_message: reason,
        metadata: {
          version: 'v10_xhr_discovery',
          reason,
          tickers,
          page_status: pageRes.status,
        },
      });

      return new Response(JSON.stringify({ success: true, count: 0, reason, version: 'v10_xhr_discovery' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await throttle(400);

    const { htmlCandidates } = await discoverEndpointFromHtmlOrBundles(html, debug);

    if (debug) {
      const first10 = uniqueLimit(htmlCandidates, 10).map((s) => s.slice(0, 200));
      console.log(`[DEBUG] html_length=${htmlLength}`);
      console.log(`[DEBUG] num_candidate_endpoints_found=${htmlCandidates.length}`);
      console.log(`[DEBUG] first_10_candidate_endpoints=${JSON.stringify(first10)}`);
    }

    let allCandidates = [...htmlCandidates];

    // Step 2: If none found in HTML, scrape up to 3 JS bundles via Firecrawl and scan
    let bundleDiscovery: { bundleUrls: string[]; bundleWinners: { url: string; candidates: string[] }[] } | null = null;
    if (allCandidates.length === 0) {
      bundleDiscovery = await discoverEndpointViaBundlesIfNeeded(html, debug);
      const winners = bundleDiscovery.bundleWinners;
      if (winners.length > 0) {
        // merge candidates from the winner bundle
        allCandidates = winners[0].candidates;
        if (debug) {
          console.log(`[DEBUG] bundle_candidates_from=${winners[0].url}`);
          const first10 = uniqueLimit(winners[0].candidates, 10).map((s) => s.slice(0, 200));
          console.log(`[DEBUG] bundle_num_candidate_endpoints_found=${winners[0].candidates.length}`);
          console.log(`[DEBUG] bundle_first_10_candidate_endpoints=${JSON.stringify(first10)}`);
        }
      } else {
        if (debug) {
          console.log(`[DEBUG] bundle_urls_scanned=${JSON.stringify(bundleDiscovery.bundleUrls)}`);
          console.log('[DEBUG] bundle_candidates_found=0');
        }
      }
    }

    // Step 2 (deterministic selection)
    const chosenCandidate = chooseEndpointDeterministically(allCandidates);
    if (!chosenCandidate) {
      const reason = 'no xhr endpoints found in html/js bundles';

      await sendNoDataFoundAlert(slackAlerter, 'ingest-options-flow', {
        sourcesAttempted: ['Barchart via Firecrawl (endpoint discovery)'],
        reason,
      });

      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'warning',
        rows_inserted: 0,
        rows_skipped: 0,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl_Barchart_XHR',
        error_message: reason,
        metadata: {
          version: 'v10_xhr_discovery',
          reason,
          tickers,
          html_length: htmlLength,
          html_candidates_found: htmlCandidates.length,
          bundle_discovery: bundleDiscovery,
        },
      });

      return new Response(JSON.stringify({ success: true, count: 0, reason, version: 'v10_xhr_discovery' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const chosenEndpointTemplate = toAbsoluteBarchartUrl(chosenCandidate);
    console.log(`Chosen endpoint template: ${chosenEndpointTemplate.slice(0, 200)}`);

    // Step 3/4: Fetch JSON per ticker and parse contracts
    const allOptions: ParsedOption[] = [];
    const perTicker: Record<string, any> = {};

    for (let idx = 0; idx < tickers.length; idx++) {
      const ticker = tickers[idx];
      const endpointUrl = applyTickerToEndpoint(chosenEndpointTemplate, ticker);

      const jsonRes = await fetchOptionsJsonViaEndpoint(endpointUrl);
      await throttle(400);

      if (!jsonRes.ok) {
        console.log(`${ticker}: endpoint_fetch_failed status=${jsonRes.status} preview="${jsonRes.preview}"`);
        perTicker[ticker] = {
          endpoint_used: endpointUrl,
          fetch_ok: false,
          fetch_status: jsonRes.status,
          response_preview: jsonRes.preview,
          error: jsonRes.error,
          contracts_found: 0,
          contracts_passing_filter: 0,
          inserted: 0,
        };
        continue;
      }

      const rawContracts = findOptionContractsInJson(jsonRes.json);
      const contractsFound = rawContracts.length;

      // Normalize + filter volume>50
      const normalized: ParsedOption[] = [];
      for (const raw of rawContracts) {
        const opt = normalizeContract(raw, ticker, endpointUrl, jsonRes.status);
        if (opt) normalized.push(opt);
      }

      // keep top 10 by volume
      const top = normalized.sort((a, b) => b.volume - a.volume).slice(0, 10);

      // Add summary metadata per contract
      for (const opt of top) {
        opt.metadata.contracts_found = contractsFound;
        opt.metadata.contracts_passing_filter = normalized.length;
      }

      allOptions.push(...top);

      perTicker[ticker] = {
        endpoint_used: endpointUrl,
        fetch_ok: true,
        fetch_status: jsonRes.status,
        response_preview: debug ? jsonRes.preview : undefined,
        contracts_found: contractsFound,
        contracts_passing_filter: normalized.length,
        inserted: top.length,
      };

      console.log(`${ticker}: contracts_found=${contractsFound}, passing_volume_filter=${normalized.length}, selected_top10=${top.length}`);
    }

    // Step 5: Insert in batches of 50
    if (allOptions.length === 0) {
      // Determine reason
      const anyFetchBlocked = Object.values(perTicker).some((s: any) => s.fetch_ok === false);
      const totalFound = Object.values(perTicker).reduce((sum: number, s: any) => sum + (s.contracts_found || 0), 0);
      const totalPassing = Object.values(perTicker).reduce((sum: number, s: any) => sum + (s.contracts_passing_filter || 0), 0);

      let reason = 'no_data';
      if (allCandidates.length === 0) reason = 'no xhr endpoints found in html/js bundles';
      else if (anyFetchBlocked) reason = 'xhr fetch blocked/unauthorized (see response_preview)';
      else if (totalFound > 0 && totalPassing === 0) reason = 'contracts found but none passed volume>50 filter';
      else if (totalFound === 0) reason = 'endpoint returned no contracts';

      await sendNoDataFoundAlert(slackAlerter, 'ingest-options-flow', {
        sourcesAttempted: ['Barchart via Firecrawl XHR'],
        reason: `${reason} | endpoint=${chosenEndpointTemplate.slice(0, 120)} | found=${totalFound} passed=${totalPassing}`,
      });

      await supabase.from('function_status').insert({
        function_name: 'ingest-options-flow',
        executed_at: new Date().toISOString(),
        status: 'warning',
        rows_inserted: 0,
        rows_skipped: totalFound,
        duration_ms: Date.now() - startTime,
        source_used: 'Firecrawl_Barchart_XHR',
        error_message: reason,
        metadata: {
          version: 'v10_xhr_discovery',
          reason,
          endpoint_template: chosenEndpointTemplate,
          html_candidates_found: htmlCandidates.length,
          candidates_used_count: allCandidates.length,
          tickers,
          per_ticker: perTicker,
          debug_mode: debug,
        },
      });

      return new Response(
        JSON.stringify({
          success: true,
          count: 0,
          source: 'Firecrawl_Barchart_XHR',
          version: 'v10_xhr_discovery',
          endpoint_template: chosenEndpointTemplate,
          reason,
          per_ticker: perTicker,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let inserted = 0;
    for (let i = 0; i < allOptions.length; i += 50) {
      const batch = allOptions.slice(i, i + 50);
      const { data, error } = await supabase.from('options_flow').insert(batch).select('id');
      if (error) {
        console.error('Insert error:', error.message);
      } else {
        inserted += (data?.length || 0);
      }
    }

    console.log(`✅ Inserted ${inserted} options records`);

    await slackAlerter.sendLiveAlert({
      etlName: 'ingest-options-flow',
      status: inserted > 0 ? 'success' : 'partial',
      rowsInserted: inserted,
      rowsSkipped: allOptions.length - inserted,
      sourceUsed: 'Firecrawl_Barchart_XHR',
      duration: Date.now() - startTime,
    });

    const totalContractsFound = Object.values(perTicker).reduce((sum: number, s: any) => sum + (s.contracts_found || 0), 0);
    const totalPassing = Object.values(perTicker).reduce((sum: number, s: any) => sum + (s.contracts_passing_filter || 0), 0);

    await supabase.from('function_status').insert({
      function_name: 'ingest-options-flow',
      executed_at: new Date().toISOString(),
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: Math.max(0, totalPassing - inserted),
      duration_ms: Date.now() - startTime,
      source_used: 'Firecrawl_Barchart_XHR',
      metadata: {
        version: 'v10_xhr_discovery',
        endpoint_template: chosenEndpointTemplate,
        contracts_found: totalContractsFound,
        contracts_passed_filter: totalPassing,
        tickers_processed: tickers.length,
        debug_mode: debug,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        count: inserted,
        source: 'Firecrawl_Barchart_XHR',
        version: 'v10_xhr_discovery',
        endpoint_template: chosenEndpointTemplate,
        per_ticker: perTicker,
        message: `Inserted ${inserted} options records`,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('Error:', error);
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'ingest-options-flow',
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown'}`,
    });
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
