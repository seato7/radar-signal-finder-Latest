import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlphaRow {
  signal_type: string;
  horizon: '1d' | '3d' | '7d';
  avg_forward_return: number;
  hit_rate: number;
  sample_size: number;
  std_forward_return: number;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / (xs.length - 1);
  return Math.sqrt(v);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    console.log('Starting signal alpha computation...');

    // Get all unique signal types from recent signals
    const { data: signalTypes, error: stError } = await supabase
      .from('signals')
      .select('signal_type')
      .gte('observed_at', new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString())
      .not('asset_id', 'is', null);

    if (stError) throw stError;

    // Get unique signal types
    const uniqueTypes = [...new Set((signalTypes || []).map(s => s.signal_type))];
    console.log(`Found ${uniqueTypes.length} unique signal types to process`);

    const alphas: AlphaRow[] = [];
    let processedTypes = 0;

    // Process each signal type
    for (const signalType of uniqueTypes) {
      // Get signals of this type with their tickers
      const { data: signals, error: sigError } = await supabase
        .from('signals')
        .select(`
          observed_at,
          magnitude,
          direction,
          assets!inner(ticker)
        `)
        .eq('signal_type', signalType)
        .gte('observed_at', new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString())
        .not('asset_id', 'is', null)
        .limit(5000);

      if (sigError) {
        console.error(`Error fetching signals for ${signalType}:`, sigError);
        continue;
      }

      if (!signals || signals.length === 0) continue;

      // Group signals by ticker and date
      const signalsByTickerDate = new Map<string, { date: string; ticker: string; magnitude: number; direction: string }>();
      
      for (const s of signals) {
        const ticker = (s.assets as any)?.ticker;
        if (!ticker) continue;
        
        const dateStr = new Date(s.observed_at).toISOString().split('T')[0];
        const key = `${ticker}_${dateStr}`;
        
        // Keep only most recent signal per ticker/date
        if (!signalsByTickerDate.has(key)) {
          signalsByTickerDate.set(key, {
            date: dateStr,
            ticker,
            magnitude: s.magnitude || 1,
            direction: s.direction || 'neutral'
          });
        }
      }

      // Get unique tickers and date range
      const tickers = [...new Set([...signalsByTickerDate.values()].map(s => s.ticker))];
      const dates = [...new Set([...signalsByTickerDate.values()].map(s => s.date))].sort();

      if (tickers.length === 0 || dates.length === 0) continue;

      // Fetch prices for these tickers covering the date range
      const minDate = dates[0];
      const maxDate = new Date(new Date(dates[dates.length - 1]).getTime() + 8 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: prices, error: priceError } = await supabase
        .from('prices')
        .select('ticker, date, close')
        .in('ticker', tickers.slice(0, 500)) // Limit to avoid query size issues
        .gte('date', minDate)
        .lte('date', maxDate)
        .order('date', { ascending: true });

      if (priceError) {
        console.error(`Error fetching prices for ${signalType}:`, priceError);
        continue;
      }

      if (!prices || prices.length === 0) continue;

      // Build price lookup: ticker -> date -> close
      const priceLookup = new Map<string, Map<string, number>>();
      for (const p of prices) {
        if (!priceLookup.has(p.ticker)) {
          priceLookup.set(p.ticker, new Map());
        }
        priceLookup.get(p.ticker)!.set(p.date, p.close);
      }

      // Calculate forward returns for each horizon
      const returns1d: number[] = [];
      const returns3d: number[] = [];
      const returns7d: number[] = [];

      for (const [, signal] of signalsByTickerDate) {
        const tickerPrices = priceLookup.get(signal.ticker);
        if (!tickerPrices) continue;

        const p0 = tickerPrices.get(signal.date);
        if (!p0 || p0 === 0) continue;

        // Get sorted dates for this ticker after signal date
        const futureDates = [...tickerPrices.keys()]
          .filter(d => d > signal.date)
          .sort();

        // 1-day forward return
        if (futureDates.length >= 1) {
          const p1 = tickerPrices.get(futureDates[0]);
          if (p1) {
            const ret = (p1 / p0) - 1;
            // Apply direction multiplier: if signal was bearish, flip the return
            const dirMult = signal.direction === 'down' ? -1 : 1;
            returns1d.push(ret * dirMult);
          }
        }

        // 3-day forward return (use 3rd future date if available)
        if (futureDates.length >= 3) {
          const p3 = tickerPrices.get(futureDates[2]);
          if (p3) {
            const ret = (p3 / p0) - 1;
            const dirMult = signal.direction === 'down' ? -1 : 1;
            returns3d.push(ret * dirMult);
          }
        }

        // 7-day forward return (use 5th or 7th future date if available)
        if (futureDates.length >= 5) {
          const targetIdx = Math.min(6, futureDates.length - 1);
          const p7 = tickerPrices.get(futureDates[targetIdx]);
          if (p7) {
            const ret = (p7 / p0) - 1;
            const dirMult = signal.direction === 'down' ? -1 : 1;
            returns7d.push(ret * dirMult);
          }
        }
      }

      // Calculate stats for each horizon
      if (returns1d.length >= 10) {
        const m = mean(returns1d);
        const sd = std(returns1d);
        const hit = returns1d.filter(x => x > 0).length / returns1d.length;
        alphas.push({
          signal_type: signalType,
          horizon: '1d',
          avg_forward_return: m,
          hit_rate: hit,
          sample_size: returns1d.length,
          std_forward_return: sd,
        });
      }

      if (returns3d.length >= 10) {
        const m = mean(returns3d);
        const sd = std(returns3d);
        const hit = returns3d.filter(x => x > 0).length / returns3d.length;
        alphas.push({
          signal_type: signalType,
          horizon: '3d',
          avg_forward_return: m,
          hit_rate: hit,
          sample_size: returns3d.length,
          std_forward_return: sd,
        });
      }

      if (returns7d.length >= 10) {
        const m = mean(returns7d);
        const sd = std(returns7d);
        const hit = returns7d.filter(x => x > 0).length / returns7d.length;
        alphas.push({
          signal_type: signalType,
          horizon: '7d',
          avg_forward_return: m,
          hit_rate: hit,
          sample_size: returns7d.length,
          std_forward_return: sd,
        });
      }

      processedTypes++;
      if (processedTypes % 10 === 0) {
        console.log(`Processed ${processedTypes}/${uniqueTypes.length} signal types`);
      }
    }

    console.log(`Computed alpha for ${alphas.length} signal_type/horizon combinations`);

    // Upsert all alphas
    if (alphas.length > 0) {
      const { error: upsertError } = await supabase
        .from('signal_type_alpha')
        .upsert(
          alphas.map(a => ({
            signal_type: a.signal_type,
            horizon: a.horizon,
            avg_forward_return: a.avg_forward_return,
            hit_rate: a.hit_rate,
            sample_size: a.sample_size,
            std_forward_return: a.std_forward_return,
            updated_at: new Date().toISOString(),
          })),
          { onConflict: 'signal_type,horizon' }
        );

      if (upsertError) throw upsertError;
    }

    const duration = Date.now() - startTime;

    // Log function status
    await supabase.from('function_status').insert({
      function_name: 'compute-signal-alpha',
      status: 'success',
      rows_inserted: alphas.length,
      duration_ms: duration,
      metadata: {
        signal_types_processed: processedTypes,
        total_alpha_records: alphas.length,
        horizons: ['1d', '3d', '7d'],
      },
    });

    console.log(`compute-signal-alpha completed in ${duration}ms, updated ${alphas.length} records`);

    return new Response(
      JSON.stringify({
        ok: true,
        updated: alphas.length,
        signal_types_processed: processedTypes,
        duration_ms: duration,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('compute-signal-alpha error:', e);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (SUPABASE_URL && SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      await supabase.from('function_status').insert({
        function_name: 'compute-signal-alpha',
        status: 'error',
        error_message: String(e),
        duration_ms: Date.now() - startTime,
      });
    }

    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
