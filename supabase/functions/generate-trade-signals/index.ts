import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { logHeartbeat } from "../_shared/heartbeat.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TAVILY_NEGATIVE_KEYWORDS = [
  'bankrupt', 'fraud', 'sec ', 'sec.gov', 'delisted', 'delist',
  'lawsuit', 'investigation', 'crash', 'collapse', 'indicted', 'ponzi',
];

const TAVILY_POSITIVE_KEYWORDS = [
  'earnings beat', 'upgrade', 'buy rating', 'partnership', 'contract win',
  'fda approval', 'record revenue', 'breakout', 'rally', 'surge',
  'strong growth', 'raised guidance', 'analyst upgrade', 'price target raised',
  'institutional buying', 'beat expectations', 'outperform', 'strong buy',
];

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyCheckResult {
  blocked: boolean;
  reason: string | null;
  hasPositiveSignal: boolean;
  currentPrice: number | null;
  priceSource: string | null;
}

function extractPriceFromText(text: string): number | null {
  const patterns = [
    /\$\s*([\d]{1,6}(?:,\d{3})*(?:\.\d{1,4})?)/g,
    /trading at\s+\$?([\d]{1,6}(?:,\d{3})*(?:\.\d{1,4})?)/gi,
    /price of\s+\$?([\d]{1,6}(?:,\d{3})*(?:\.\d{1,4})?)/gi,
    /priced at\s+\$?([\d]{1,6}(?:,\d{3})*(?:\.\d{1,4})?)/gi,
  ];

  const candidates: number[] = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const val = parseFloat(match[1].replace(/,/g, ''));
      if (val >= 0.50 && val <= 100000) candidates.push(val);
    }
  }

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  candidates.sort((a, b) => a - b);
  return candidates[Math.floor(candidates.length / 2)];
}

async function checkTavilyNews(ticker: string): Promise<TavilyCheckResult> {
  const noCheck: TavilyCheckResult = { blocked: false, reason: null, hasPositiveSignal: false, currentPrice: null, priceSource: null };

  const apiKey = Deno.env.get('TAVILY_API_KEY');
  if (!apiKey) {
    console.log(`[GENERATE-TRADE-SIGNALS] TAVILY_API_KEY not set — skipping news check for ${ticker}`);
    return noCheck;
  }

  try {
    const year = new Date().getFullYear();
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: `${ticker} stock price today ${year}`,
        max_results: 3,
      }),
    });

    if (!response.ok) {
      console.warn(`[GENERATE-TRADE-SIGNALS] Tavily API error for ${ticker}: ${response.status} — proceeding without news check`);
      return noCheck;
    }

    const data = await response.json();
    const results: TavilyResult[] = data.results ?? [];

    console.log(`[GENERATE-TRADE-SIGNALS] Tavily found ${results.length} results for ${ticker}:`);
    for (const r of results) {
      console.log(`  - ${r.title}`);
    }

    let blocked = false;
    let reason: string | null = null;
    let hasPositiveSignal = false;
    let currentPrice: number | null = null;
    let priceSource: string | null = null;

    for (const result of results) {
      const text = `${result.title} ${result.content}`;
      const textLower = text.toLowerCase();

      // Check negative keywords — first match blocks the signal
      if (!blocked) {
        for (const keyword of TAVILY_NEGATIVE_KEYWORDS) {
          if (textLower.includes(keyword)) {
            reason = `negative keyword "${keyword}" in: "${result.title}"`;
            console.log(`[GENERATE-TRADE-SIGNALS] ${ticker}: BLOCKED — ${reason}`);
            blocked = true;
            break;
          }
        }
      }

      // Check positive keywords
      if (!hasPositiveSignal) {
        for (const keyword of TAVILY_POSITIVE_KEYWORDS) {
          if (textLower.includes(keyword)) {
            hasPositiveSignal = true;
            console.log(`[GENERATE-TRADE-SIGNALS] ${ticker}: positive signal found — "${keyword}" in "${result.title}"`);
            break;
          }
        }
      }

      // Extract current price from text if not yet found
      if (currentPrice == null) {
        const extracted = extractPriceFromText(text);
        if (extracted != null) {
          currentPrice = extracted;
          priceSource = result.url;
          console.log(`[GENERATE-TRADE-SIGNALS] ${ticker}: Tavily price extracted $${extracted} from "${result.title}"`);
        }
      }
    }

    if (!blocked) {
      console.log(`[GENERATE-TRADE-SIGNALS] ${ticker}: Tavily check passed — hasPositiveSignal=${hasPositiveSignal}, extractedPrice=${currentPrice ?? 'none'}`);
    }

    return { blocked, reason, hasPositiveSignal, currentPrice, priceSource };

  } catch (err) {
    console.warn(`[GENERATE-TRADE-SIGNALS] Tavily fetch failed for ${ticker}: ${err} — proceeding without news check`);
    return noCheck;
  }
}

const MOMENTUM_SIGNAL_TYPES = [
  'momentum_5d_strong_bullish',
  'momentum_5d_bullish',
  'momentum_20d_strong_bullish',
  'momentum_20d_bullish',
  'momentum_5d_strong_bullish_limited_data',
  'momentum_5d_bullish_limited_data',
  'momentum_20d_strong_bullish_limited_data',
  'momentum_20d_bullish_limited_data',
];

async function computeKellySize(supabase: any, sector: string | null, hybridScore: number, confidence: number): Promise<number> {
  // 1. Query model_daily_metrics for the last 30 days
  const { data: metrics } = await supabase
    .from('model_daily_metrics')
    .select('hit_rate, mean_return')
    .order('snapshot_date', { ascending: false })
    .limit(30);

  let kellyFraction: number;

  // 2. Fall back to conservative sizing if insufficient history
  if (!metrics || metrics.length < 10) {
    const baseSize = (hybridScore - 65) / 400 * confidence;
    const minSize = confidence >= 0.795 ? 0.05 : confidence >= 0.645 ? 0.03 : 0.01;
    kellyFraction = Math.min(0.10, Math.max(minSize, baseSize));
  } else {
    const n = metrics.length;
    const rawWinRate = metrics.reduce((s: number, r: any) => s + Number(r.hit_rate), 0) / n;
    const avgReturn = metrics.reduce((s: number, r: any) => s + Number(r.mean_return), 0) / n;

    // Blend win rate with AI confidence score
    const blendedWinRate = (rawWinRate * 0.4) + (confidence * 0.6);

    // Simplified Kelly using edge/odds ratio approach:
    // We know avg return across all trades and win rate.
    // Estimate: avgWin = avgReturn / winRate, avgLoss = avgReturn / (1 - winRate)
    // This gives us a reasonable win/loss split from what we have.
    const estimatedAvgWin = Math.abs(avgReturn) / Math.max(blendedWinRate, 0.01);
    const estimatedAvgLoss = Math.abs(avgReturn) / Math.max(1 - blendedWinRate, 0.01);

    // Kelly: f = (p*b - q*a) / b  where b=avgWin, p=winRate, q=1-winRate, a=avgLoss
    const f = (blendedWinRate * estimatedAvgWin - (1 - blendedWinRate) * estimatedAvgLoss) / estimatedAvgWin;

    // Apply confidence multiplier
    const confidenceMultiplier = Math.max(0.1, confidence);
    kellyFraction = f * confidenceMultiplier;

    if (kellyFraction <= 0) {
      kellyFraction = 0;
    } else if (kellyFraction > 0.20) {
      kellyFraction = 0.20;
    } else {
      kellyFraction = kellyFraction * 0.5; // half-Kelly for safety
    }

    // Apply confidence-tiered minimum AFTER half-Kelly
    // This ensures high-confidence assets always get a meaningful position
    const minSize = confidence >= 0.795 ? 0.05 : confidence >= 0.645 ? 0.03 : 0.01;
    kellyFraction = Math.max(minSize, kellyFraction);
  }

  // 5. Sector concentration check — reduce by 50% if sector already >= 35% allocated
  if (sector) {
    const { data: sectorAssets } = await supabase
      .from('assets')
      .select('ticker')
      .eq('sector', sector);

    const sectorTickers = (sectorAssets || []).map((a: any) => a.ticker);

    if (sectorTickers.length > 0) {
      const { data: sectorSignals } = await supabase
        .from('trade_signals')
        .select('position_size_pct')
        .eq('status', 'active')
        .in('ticker', sectorTickers);

      const totalSectorExposure = (sectorSignals || []).reduce(
        (sum: number, s: any) => sum + Number(s.position_size_pct ?? 0),
        0,
      );

      if (totalSectorExposure >= 0.35) {
        console.log(`[GENERATE-TRADE-SIGNALS] Sector "${sector}" exposure ${totalSectorExposure.toFixed(3)} >= 0.35 — halving Kelly size`);
        kellyFraction *= 0.5;
      }
    }
  }

  return Math.round(kellyFraction * 10000) / 10000;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  try {
    console.log('[GENERATE-TRADE-SIGNALS] Starting...');

    // 1. Fetch top 100 candidates by hybrid_score (lowered bar: >= 60)
    const { data: candidates, error: candidatesError } = await supabase
      .from('assets')
      .select('id, ticker, hybrid_score, sector, exchange')
      .gte('hybrid_score', 60)
      .order('hybrid_score', { ascending: false })
      .limit(100);

    if (candidatesError) throw candidatesError;
    if (!candidates || candidates.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabase, {
        function_name: 'generate-trade-signals',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'assets',
      });
      return new Response(
        JSON.stringify({ inserted: 0, skipped_active: 0, skipped_no_condition: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[GENERATE-TRADE-SIGNALS] ${candidates.length} candidates with hybrid_score >= 60`);

    const candidateTickers = candidates.map((c) => c.ticker);
    const candidateAssetIds = candidates.map((c) => c.id);

    // 2. Bulk fetch active trade signals — skip tickers already active
    const { data: activeSignals } = await supabase
      .from('trade_signals')
      .select('ticker')
      .eq('status', 'active')
      .in('ticker', candidateTickers);

    const activeTickers = new Set((activeSignals || []).map((s) => s.ticker));
    const eligible = candidates.filter((c) => !activeTickers.has(c.ticker));
    const skippedActive = candidates.length - eligible.length;

    console.log(`[GENERATE-TRADE-SIGNALS] ${skippedActive} skipped (active signal exists), ${eligible.length} eligible`);

    // Global active signal cap — max 5 at any time to keep quality high
    const { count: totalActiveCount } = await supabase
      .from('trade_signals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    if ((totalActiveCount ?? 0) >= 5) {
      console.log(`[GENERATE-TRADE-SIGNALS] Active signal cap reached (${totalActiveCount}/5) — skipping generation`);
      const duration = Date.now() - startTime;
      await logHeartbeat(supabase, {
        function_name: 'generate-trade-signals',
        status: 'success',
        rows_inserted: 0,
        rows_skipped: eligible.length,
        duration_ms: duration,
        source_used: 'assets',
      });
      return new Response(
        JSON.stringify({ inserted: 0, skipped_active: skippedActive, skipped_no_condition: 0, skipped_cap: eligible.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (eligible.length === 0) {
      const duration = Date.now() - startTime;
      await logHeartbeat(supabase, {
        function_name: 'generate-trade-signals',
        status: 'success',
        rows_inserted: 0,
        duration_ms: duration,
        source_used: 'assets',
      });
      return new Response(
        JSON.stringify({ inserted: 0, skipped_active: skippedActive, skipped_no_condition: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const eligibleIds = eligible.map((c) => c.id);
    const eligibleTickers = eligible.map((c) => c.ticker);

    // 3. Bulk fetch most recent ai_scores for eligible assets
    const { data: aiScoreRows } = await supabase
      .from('ai_scores')
      .select('asset_id, ai_score, confidence, direction, scored_at')
      .in('asset_id', eligibleIds)
      .order('scored_at', { ascending: false });

    // Keep only most recent per asset_id
    const aiScoreMap = new Map<string, { ai_score: number; confidence: number; direction: string }>();
    for (const row of aiScoreRows || []) {
      if (!aiScoreMap.has(row.asset_id)) {
        aiScoreMap.set(row.asset_id, {
          ai_score: Number(row.ai_score),
          confidence: Number(row.confidence),
          direction: String(row.direction),
        });
      }
    }

    // 4a. Bulk fetch breaking news signals in last 24h for eligible assets
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentNewsSignals } = await supabase
      .from('signals')
      .select('asset_id')
      .in('asset_id', eligibleIds)
      .in('signal_type', ['breaking_news_bullish', 'breaking_news_bearish'])
      .gte('observed_at', oneDayAgo);

    const newsBoostAssetIds = new Set((recentNewsSignals || []).map((s: any) => s.asset_id));

    // 4b. Bulk fetch momentum signals in last 7 days for eligible assets
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: momentumSignals } = await supabase
      .from('signals')
      .select('asset_id')
      .in('asset_id', eligibleIds)
      .in('signal_type', MOMENTUM_SIGNAL_TYPES)
      .eq('direction', 'up')
      .gte('observed_at', sevenDaysAgo);

    const momentumAssetIds = new Set((momentumSignals || []).map((s) => s.asset_id));

    // 5. Bulk fetch latest prices for eligible tickers
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const { data: priceRows } = await supabase
      .from('prices')
      .select('ticker, date, close')
      .in('ticker', eligibleTickers)
      .gte('date', thirtyDaysAgo)
      .order('ticker')
      .order('date', { ascending: false });

    // Keep most recent close per ticker
    const latestPriceMap = new Map<string, number>();
    for (const row of priceRows || []) {
      if (!latestPriceMap.has(row.ticker)) {
        latestPriceMap.set(row.ticker, Number(row.close));
      }
    }

    // 5b. Fetch most recent closed signals per eligible ticker (last 14d) for the
    // quality-based re-entry filter. Prevents immediately re-opening a name that just
    // stopped out, and enforces a short cooldown after a flat/negative expiry.
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentClosedRows } = await supabase
      .from('trade_signals')
      .select('ticker, status, exit_date, pnl_pct')
      .in('ticker', eligibleTickers)
      .in('status', ['stopped', 'expired', 'triggered'])
      .gte('exit_date', fourteenDaysAgo)
      .order('exit_date', { ascending: false });

    const mostRecentClosed = new Map<string, { status: string; exit_date: string; pnl_pct: number }>();
    for (const row of recentClosedRows || []) {
      if (!mostRecentClosed.has(row.ticker)) {
        mostRecentClosed.set(row.ticker, {
          status: String(row.status),
          exit_date: String(row.exit_date),
          pnl_pct: Number(row.pnl_pct ?? 0),
        });
      }
    }

    // 6. Evaluate entry conditions and build insert rows
    const toInsert: any[] = [];
    let skippedNoCondition = 0;

    for (const asset of eligible) {
      const aiScore = aiScoreMap.get(asset.id);
      const hasMomentum = momentumAssetIds.has(asset.id);
      const hasRecentNews = newsBoostAssetIds.has(asset.id);
      const entryPrice = latestPriceMap.get(asset.ticker);

      // Entry condition — AI score, direction, momentum/news, price data all required.
      // News-boosted path: allows through if hybrid_score >= 55 AND ai_score > 50,
      // bypassing the momentum requirement when recent breaking news confirms activity.
      if (!aiScore || aiScore.direction !== 'up' || entryPrice == null || entryPrice <= 0) {
        skippedNoCondition++;
        continue;
      }

      // Quality-based re-entry filter: skip names that just stopped out or expired flat.
      // Winners (triggered) are allowed to re-enter without a cooldown since the thesis
      // was validated.
      const recentClose = mostRecentClosed.get(asset.ticker);
      if (recentClose) {
        const daysSince = (Date.now() - new Date(recentClose.exit_date).getTime()) / (24 * 60 * 60 * 1000);
        if (recentClose.status === 'stopped' && daysSince < 7) {
          console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: skipped — stopped ${daysSince.toFixed(1)}d ago, 7d cooldown (pnl ${recentClose.pnl_pct}%)`);
          skippedNoCondition++;
          continue;
        }
        if (recentClose.status === 'expired' && recentClose.pnl_pct <= 0 && daysSince < 3) {
          console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: skipped — expired flat/negative ${daysSince.toFixed(1)}d ago, 3d cooldown`);
          skippedNoCondition++;
          continue;
        }
      }

      const newsBoostQualifies = hasRecentNews && Number(asset.hybrid_score) >= 55 && aiScore.ai_score > 50;
      const standardQualifies = aiScore.ai_score > 55 && hasMomentum;

      if (!newsBoostQualifies && !standardQualifies) {
        skippedNoCondition++;
        continue;
      }

      if (newsBoostQualifies && !standardQualifies) {
        console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: qualified via news boost path (hybrid=${asset.hybrid_score}, ai=${aiScore.ai_score})`);
      }

      // Quality filter 1: minimum price $1.00 — eliminates penny stocks and zero-price rows
      if (entryPrice <= 0 || entryPrice < 1.00) {
        console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: skipped — price $${entryPrice} below $1.00 minimum`);
        skippedNoCondition++;
        continue;
      }

      // Quality filter 2: OTC + price < $5.00 — skip low-liquidity OTC names
      const exchange = ((asset as any).exchange ?? '').toUpperCase();
      if ((exchange === 'OTC' || exchange === 'OTCMKTS' || exchange === 'PINK') && entryPrice < 5.00) {
        console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: skipped — OTC exchange with price $${entryPrice} below $5.00`);
        skippedNoCondition++;
        continue;
      }

      // Quality filter 3: minimum expected return 8%
      const expectedReturn = (Math.round(entryPrice * 1.15 * 100) / 100 - entryPrice) / entryPrice;
      if (expectedReturn < 0.08) {
        console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: skipped — expected return ${(expectedReturn * 100).toFixed(1)}% below 8% minimum`);
        skippedNoCondition++;
        continue;
      }

      // Tavily news verification — block negative news, confirm positive signals, verify price
      const tavilyCheck = await checkTavilyNews(asset.ticker);
      if (tavilyCheck.blocked) {
        console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: skipped — Tavily news block: ${tavilyCheck.reason}`);
        skippedNoCondition++;
        continue;
      }

      if (tavilyCheck.hasPositiveSignal) {
        console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: positive news signal confirmed ✓`);
      }

      // Use Tavily price if it differs from TwelveData by more than 5%
      let resolvedEntryPrice = entryPrice;
      if (tavilyCheck.currentPrice != null) {
        const priceDiff = Math.abs(tavilyCheck.currentPrice - entryPrice) / entryPrice;
        if (priceDiff > 0.05) {
          console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: price discrepancy >5% — TwelveData $${entryPrice} vs Tavily $${tavilyCheck.currentPrice} (${(priceDiff * 100).toFixed(1)}%) — using Tavily price`);
          resolvedEntryPrice = tavilyCheck.currentPrice;
        }
      }

      // Re-validate after Tavily resolution — the switched-in price must still clear
      // the $1.00 floor. A stale/bad Tavily extract can't sneak a penny stock through.
      if (resolvedEntryPrice <= 0 || resolvedEntryPrice < 1.00) {
        console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: skipped — resolved price $${resolvedEntryPrice} below $1.00 after Tavily`);
        skippedNoCondition++;
        continue;
      }

      // position_size_pct represents the MAXIMUM position size for this signal
      const positionSizePct = await computeKellySize(supabase, (asset as any).sector ?? null, Number(asset.hybrid_score), aiScore.confidence);
      console.log(`[GENERATE-TRADE-SIGNALS] ${asset.ticker}: confidence=${aiScore.confidence}, kelly=${positionSizePct}`);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      toInsert.push({
        ticker: asset.ticker,
        asset_id: asset.id,
        signal_type: 'entry',
        status: 'active',
        entry_price: resolvedEntryPrice,
        exit_target: Math.round(resolvedEntryPrice * 1.15 * 100) / 100,
        stop_loss: Math.round(resolvedEntryPrice * 0.90 * 100) / 100,
        peak_price: resolvedEntryPrice,
        position_size_pct: positionSizePct,
        score_at_entry: Number(asset.hybrid_score),
        ai_score_at_entry: aiScore.ai_score,
        expires_at: expiresAt,
        entry_date: new Date().toISOString(),
      });
    }

    console.log(`[GENERATE-TRADE-SIGNALS] ${toInsert.length} signals to insert, ${skippedNoCondition} skipped (no condition met)`);

    // 7. Insert new trade signals
    let inserted = 0;
    if (toInsert.length > 0) {
      const { data: insertedRows, error: insertError } = await supabase
        .from('trade_signals')
        .insert(toInsert)
        .select('id');

      if (insertError) {
        console.error('[GENERATE-TRADE-SIGNALS] Insert error:', insertError.message);
        throw insertError;
      }
      inserted = insertedRows?.length ?? 0;
    }

    console.log(`[GENERATE-TRADE-SIGNALS] ✅ Inserted ${inserted} trade signals`);

    const duration = Date.now() - startTime;
    await logHeartbeat(supabase, {
      function_name: 'generate-trade-signals',
      status: 'success',
      rows_inserted: inserted,
      rows_skipped: skippedActive + skippedNoCondition,
      duration_ms: duration,
      source_used: 'assets',
    });

    return new Response(
      JSON.stringify({ inserted, skipped_active: skippedActive, skipped_no_condition: skippedNoCondition }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('[GENERATE-TRADE-SIGNALS] ❌ Error:', error);
    const duration = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);

    await logHeartbeat(supabase, {
      function_name: 'generate-trade-signals',
      status: 'failure',
      duration_ms: duration,
      error_message: errMsg,
    });

    return new Response(
      JSON.stringify({ error: errMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
