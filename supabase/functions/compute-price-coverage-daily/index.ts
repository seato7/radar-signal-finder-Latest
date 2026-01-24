import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Constants
const ASSET_PAGE_SIZE = 1000;
const PRICE_BATCH_SIZE = 100;
const UNSUPPORTED_THRESHOLD = 5; // N consecutive invalid_symbol logs = unsupported

interface CoverageRow {
  snapshot_date: string;
  asset_id: string | null;
  ticker: string;
  asset_class: string | null;
  vendor: string;
  last_price_date: string | null;
  days_stale: number;
  points_30d: number;
  points_90d: number;
  status: 'fresh' | 'stale' | 'missing' | 'unsupported';
  reason: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Parse inputs
    let snapshotDate: string;
    let freshnessDays = 7;
    let vendor = 'twelvedata';

    try {
      const body = await req.json();
      snapshotDate = body?.snapshot_date ?? new Date().toISOString().split('T')[0];
      freshnessDays = body?.freshness_days ?? 7;
      vendor = body?.vendor ?? 'twelvedata';
    } catch {
      snapshotDate = new Date().toISOString().split('T')[0];
    }

    console.log(`[PRICE-COVERAGE] Computing coverage for ${snapshotDate}, freshness=${freshnessDays}d, vendor=${vendor}`);

    // Calculate date boundaries
    const snapshotDateObj = new Date(snapshotDate);
    const date30dAgo = new Date(snapshotDateObj);
    date30dAgo.setDate(date30dAgo.getDate() - 30);
    const date90dAgo = new Date(snapshotDateObj);
    date90dAgo.setDate(date90dAgo.getDate() - 90);

    const date30dStr = date30dAgo.toISOString().split('T')[0];
    const date90dStr = date90dAgo.toISOString().split('T')[0];

    // Fetch all assets with pagination
    const allAssets: { id: string; ticker: string; asset_class: string | null }[] = [];
    let assetOffset = 0;
    while (true) {
      const { data: assetPage, error } = await supabase
        .from('assets')
        .select('id, ticker, asset_class')
        .range(assetOffset, assetOffset + ASSET_PAGE_SIZE - 1);

      if (error) throw error;
      if (!assetPage || assetPage.length === 0) break;

      allAssets.push(...assetPage);
      if (assetPage.length < ASSET_PAGE_SIZE) break;
      assetOffset += ASSET_PAGE_SIZE;
    }

    console.log(`[PRICE-COVERAGE] Loaded ${allAssets.length} assets`);

    // Fetch unsupported tickers from ingestion log (last N=5 entries all invalid_symbol)
    const unsupportedTickers = new Set<string>();
    const { data: ingestionLogs } = await supabase
      .from('price_ingestion_log')
      .select('ticker, vendor_status')
      .eq('vendor', vendor)
      .order('requested_at', { ascending: false })
      .limit(50000);

    if (ingestionLogs && ingestionLogs.length > 0) {
      // Group by ticker and check if last N are all invalid_symbol
      const tickerLogs = new Map<string, string[]>();
      for (const log of ingestionLogs) {
        if (!tickerLogs.has(log.ticker)) {
          tickerLogs.set(log.ticker, []);
        }
        const logs = tickerLogs.get(log.ticker)!;
        if (logs.length < UNSUPPORTED_THRESHOLD) {
          logs.push(log.vendor_status);
        }
      }

      for (const [ticker, statuses] of tickerLogs) {
        if (statuses.length >= UNSUPPORTED_THRESHOLD && statuses.every(s => s === 'invalid_symbol')) {
          unsupportedTickers.add(ticker);
        }
      }
    }

    console.log(`[PRICE-COVERAGE] Found ${unsupportedTickers.size} unsupported tickers from ingestion logs`);

    // Process assets in batches to compute coverage
    const coverageRows: CoverageRow[] = [];
    const assetUpdates: {
      id: string;
      price_status: string;
      last_price_date: string | null;
      days_stale: number;
      price_points_30d: number;
      rank_status: string;
    }[] = [];

    const stats = { fresh: 0, stale: 0, missing: 0, unsupported: 0 };

    for (let i = 0; i < allAssets.length; i += PRICE_BATCH_SIZE) {
      const batch = allAssets.slice(i, i + PRICE_BATCH_SIZE);
      const tickers = batch.map(a => a.ticker);

      // Fetch price stats for this batch using aggregates
      // Query: max(date), count in 30d, count in 90d per ticker
      const { data: priceStats, error: priceError } = await supabase
        .from('prices')
        .select('ticker, date')
        .in('ticker', tickers)
        .gte('date', date90dStr)
        .lte('date', snapshotDate)
        .order('date', { ascending: false });

      if (priceError) {
        console.error(`[PRICE-COVERAGE] Price query error: ${priceError.message}`);
        continue;
      }

      // Aggregate by ticker
      const tickerData = new Map<string, { lastDate: string | null; count30d: number; count90d: number }>();
      for (const p of priceStats || []) {
        if (!tickerData.has(p.ticker)) {
          tickerData.set(p.ticker, { lastDate: p.date, count30d: 0, count90d: 0 });
        }
        const data = tickerData.get(p.ticker)!;
        // Since ordered desc, first occurrence is max date
        if (!data.lastDate || p.date > data.lastDate) {
          data.lastDate = p.date;
        }
        if (p.date >= date30dStr) {
          data.count30d++;
        }
        data.count90d++;
      }

      // Process each asset in batch
      for (const asset of batch) {
        const data = tickerData.get(asset.ticker) || { lastDate: null, count30d: 0, count90d: 0 };
        const lastPriceDate = data.lastDate;
        const points30d = data.count30d;
        const points90d = data.count90d;

        let daysStale = 9999;
        if (lastPriceDate) {
          const lastDate = new Date(lastPriceDate);
          const diffMs = snapshotDateObj.getTime() - lastDate.getTime();
          daysStale = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }

        // Determine status and reason
        let status: 'fresh' | 'stale' | 'missing' | 'unsupported';
        let reason = '';
        let rankStatus = 'rankable';

        if (unsupportedTickers.has(asset.ticker)) {
          status = 'unsupported';
          reason = `Last ${UNSUPPORTED_THRESHOLD} ingestion attempts returned invalid_symbol`;
          rankStatus = 'unsupported';
          stats.unsupported++;
        } else if (!lastPriceDate) {
          status = 'missing';
          reason = 'No price data found in prices table';
          rankStatus = 'missing_price';
          stats.missing++;
        } else if (daysStale > freshnessDays) {
          status = 'stale';
          reason = `Last price ${daysStale} days ago (threshold: ${freshnessDays})`;
          rankStatus = 'stale_price';
          stats.stale++;
        } else {
          status = 'fresh';
          reason = `Last price ${daysStale} days ago`;
          rankStatus = 'rankable';
          stats.fresh++;
        }

        coverageRows.push({
          snapshot_date: snapshotDate,
          asset_id: asset.id,
          ticker: asset.ticker,
          asset_class: asset.asset_class,
          vendor,
          last_price_date: lastPriceDate,
          days_stale: daysStale,
          points_30d: points30d,
          points_90d: points90d,
          status,
          reason,
        });

        assetUpdates.push({
          id: asset.id,
          price_status: status,
          last_price_date: lastPriceDate,
          days_stale: daysStale,
          price_points_30d: points30d,
          rank_status: rankStatus,
        });
      }
    }

    console.log(`[PRICE-COVERAGE] Coverage computed: fresh=${stats.fresh}, stale=${stats.stale}, missing=${stats.missing}, unsupported=${stats.unsupported}`);

    // Upsert coverage rows in batches
    const UPSERT_BATCH_SIZE = 500;
    let upsertedCount = 0;
    for (let i = 0; i < coverageRows.length; i += UPSERT_BATCH_SIZE) {
      const batch = coverageRows.slice(i, i + UPSERT_BATCH_SIZE);
      const { error: upsertError } = await supabase
        .from('price_coverage_daily')
        .upsert(batch, { onConflict: 'snapshot_date,ticker,vendor' });

      if (upsertError) {
        console.error(`[PRICE-COVERAGE] Upsert error: ${upsertError.message}`);
      } else {
        upsertedCount += batch.length;
      }
    }

    console.log(`[PRICE-COVERAGE] Upserted ${upsertedCount} coverage rows`);

    // Update assets table with price status
    let assetsUpdated = 0;
    const UPDATE_BATCH_SIZE = 100;
    for (let i = 0; i < assetUpdates.length; i += UPDATE_BATCH_SIZE) {
      const batch = assetUpdates.slice(i, i + UPDATE_BATCH_SIZE);
      const promises = batch.map(u =>
        supabase
          .from('assets')
          .update({
            price_status: u.price_status,
            last_price_date: u.last_price_date,
            days_stale: u.days_stale,
            price_points_30d: u.price_points_30d,
            rank_status: u.rank_status,
          })
          .eq('id', u.id)
      );

      const results = await Promise.all(promises);
      assetsUpdated += results.filter(r => !r.error).length;
    }

    console.log(`[PRICE-COVERAGE] Updated ${assetsUpdated} assets`);

    const duration = Date.now() - startTime;

    // Log to function_status
    await supabase.from('function_status').insert({
      function_name: 'compute-price-coverage-daily',
      status: 'success',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      rows_inserted: upsertedCount,
      metadata: {
        snapshot_date: snapshotDate,
        freshness_days: freshnessDays,
        vendor,
        total_assets: allAssets.length,
        ...stats,
        assets_updated: assetsUpdated,
      },
    });

    return new Response(JSON.stringify({
      success: true,
      snapshot_date: snapshotDate,
      total_assets: allAssets.length,
      ...stats,
      coverage_rows_upserted: upsertedCount,
      assets_updated: assetsUpdated,
      duration_ms: duration,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[PRICE-COVERAGE] Error:', errorMessage);

    const duration = Date.now() - startTime;

    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      await supabase.from('function_status').insert({
        function_name: 'compute-price-coverage-daily',
        status: 'failure',
        executed_at: new Date().toISOString(),
        duration_ms: duration,
        error_message: errorMessage,
      });
    } catch {
      // Ignore logging errors
    }

    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
