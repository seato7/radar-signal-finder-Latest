import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Signal {
  id: string;
  signal_type: string;
  observed_at: string;
  magnitude: number;
  ticker: string;
  value_text?: string;
}

interface Theme {
  id: string;
  name: string;
  keywords: string[];
}

// Component weights from backend/scoring.py
const WEIGHTS = {
  "PolicyMomentum": 1.0,
  "FlowPressure": 1.0,
  "BigMoneyConfirm": 1.0,
  "InsiderPoliticianConfirm": 0.8,
  "Attention": 0.5,
  "TechEdge": 0.4,
  "RiskFlags": -1.0,
  "CapexMomentum": 0.6,
};

const HALF_LIFE_DAYS = 14; // Default from backend config

function exponentialDecay(daysAgo: number, halfLife: number = HALF_LIFE_DAYS): number {
  if (daysAgo <= 0) return 1.0;
  return Math.exp(-Math.log(2) * daysAgo / halfLife);
}

function computeComponentScores(signals: Signal[], asOf: Date = new Date()): Record<string, number> {
  const components: Record<string, number> = {};
  for (const key in WEIGHTS) {
    components[key] = 0.0;
  }

  for (const signal of signals) {
    const observedAt = new Date(signal.observed_at);
    const daysAgo = (asOf.getTime() - observedAt.getTime()) / (1000 * 60 * 60 * 24);
    const decay = exponentialDecay(daysAgo);
    
    const magnitude = signal.magnitude || 1.0;
    const contribution = magnitude * decay;
    
    // === UPDATED SIGNAL TYPE MAPPINGS (all 32 sources) ===
    
    // PolicyMomentum: policy-related signals
    if (['policy_keyword', 'policy_mention', 'policy_approval', 'policy_regulatory'].includes(signal.signal_type)) {
      components.PolicyMomentum += contribution;
    } 
    
    // FlowPressure: capital flows and crypto movements
    else if (['flow_pressure', 'flow_pressure_etf', 'etf_flow', 'crypto_whale_activity', 'crypto_exchange_outflow'].includes(signal.signal_type)) {
      components.FlowPressure += contribution;
    } 
    
    // BigMoneyConfirm: institutional money and dark pool
    else if ([
      'filing_13f_new', 'filing_13f_increase', 'institutional_13f',
      'smart_money_flow', 'dark_pool_activity', 'cot_positioning',
      'unusual_options'
    ].includes(signal.signal_type)) {
      components.BigMoneyConfirm += contribution;
    } 
    
    // InsiderPoliticianConfirm: insider trading
    else if (['insider_buy', 'politician_buy', 'insider_sell', 'politician_sell', 'insider_trading'].includes(signal.signal_type)) {
      components.InsiderPoliticianConfirm += contribution;
    } 
    
    // Attention: sentiment and social signals
    else if ([
      'social_mention', 'news_mention', 'sentiment_extreme',
      'social_sentiment_reddit', 'social_sentiment_stocktwits',
      'search_interest'
    ].includes(signal.signal_type)) {
      components.Attention += contribution;
    } 
    
    // TechEdge: technical analysis and innovation
    else if ([
      'technical_stochastic', 'technical_ma_crossover', 'technical_rsi', 
      'chart_pattern', 'innovation_patent', 'earnings_surprise'
    ].includes(signal.signal_type)) {
      components.TechEdge += contribution;
    } 
    
    // CapexMomentum: capital expenditure indicators (hiring, expansion, supply chain)
    else if ([
      'capex_hiring', 'capex_expansion', 'facility_expansion',
      'supply_chain_indicator'
    ].includes(signal.signal_type)) {
      components.CapexMomentum += contribution;
    }
    
    // RiskFlags: risk-related signals (short interest)
    else if (signal.signal_type.startsWith('risk_') || signal.signal_type === 'short_interest') {
      components.RiskFlags += contribution;
    }
  }

  return components;
}

function computeThemeScore(signals: Signal[], asOf: Date = new Date()): {
  score: number;
  components: Record<string, number>;
  positives: string[];
} {
  const rawComponents = computeComponentScores(signals, asOf);
  
  // Normalize and cap each component individually
  const normalizedComponents: Record<string, number> = {};
  let rawScore = 0.0;
  
  for (const [component, rawValue] of Object.entries(rawComponents)) {
    const weight = WEIGHTS[component as keyof typeof WEIGHTS];
    
    // Normalize using logarithmic scale with adjusted multiplier for better score distribution
    // Multiplier of 30 allows components to reach higher scores while maintaining diminishing returns
    const normalized = rawValue > 0 ? Math.log10(1 + rawValue) * 30 : 0;
    
    // Cap each component at 100 after normalization
    const capped = Math.min(normalized, 100);
    
    // Store the normalized value for display
    normalizedComponents[component] = capped;
    
    rawScore += weight * capped;
  }
  
  // Final score: normalize based on ACTIVE components only
  // This prevents penalizing themes for missing data sources
  const activeMaxScore = Object.entries(normalizedComponents)
    .filter(([comp, val]) => val > 0 && WEIGHTS[comp as keyof typeof WEIGHTS] > 0)
    .reduce((sum, [comp, val]) => sum + WEIGHTS[comp as keyof typeof WEIGHTS] * 100, 0);
  
  // Fallback to 0 if no components active
  const score = activeMaxScore === 0 ? 0 : Math.max(0, Math.min(100, (rawScore / activeMaxScore) * 100));
  
  // Identify positive components (using lower threshold for logarithmic scale)
  const positives = Object.entries(normalizedComponents)
    .filter(([k, v]) => v > 0.1 && WEIGHTS[k as keyof typeof WEIGHTS] > 0)
    .map(([k]) => k);
  
  // Validation: Alert if any component exceeds 100 (should never happen)
  for (const [component, value] of Object.entries(normalizedComponents)) {
    if (value > 100) {
      console.error(`[THEME-SCORING] ⚠️ VALIDATION ERROR: ${component} exceeds 100 (${value.toFixed(2)})`);
    }
  }
  
  // Validation: Alert if final score is suspiciously high
  if (score > 95) {
    console.warn(`[THEME-SCORING] ⚠️ HIGH SCORE ALERT: Theme scored ${score.toFixed(2)}/100 with ${signals.length} signals`);
  }
  
  return { score, components: normalizedComponents, positives };
}

// Calculate relevance between signal and theme based on keyword matching
function calculateRelevance(signal: Signal, theme: Theme): number {
  // HIGH-VALUE SIGNALS: Always relevant regardless of keywords
  // These institutional/capex signals represent broad market forces
  const highValueSignalTypes = [
    'dark_pool_activity',
    'cot_positioning', 
    'capex_hiring',
    'politician_buy',
    'politician_sell',
    'filing_13f_new',
    'filing_13f_increase',
    'smart_money_flow'
  ];
  
  // Give high-value signals automatic minimum relevance
  if (highValueSignalTypes.includes(signal.signal_type)) {
    return 0.8; // High relevance - these always matter
  }
  
  // Combine ticker, signal type, and value_text for matching
  const signalText = `${signal.ticker} ${signal.signal_type} ${(signal as any).value_text || ''}`.toLowerCase();
  
  // Also check if ticker is a major tech stock for tech themes
  const techTickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA', 'ADBE', 'NFLX'];
  const isTechStock = techTickers.includes(signal.ticker.toUpperCase());
  
  let matchCount = 0;
  let weightedScore = 0;
  
  for (const keyword of theme.keywords) {
    const lowerKeyword = keyword.toLowerCase();
    
    // Direct keyword match in signal text
    if (signalText.includes(lowerKeyword)) {
      matchCount++;
      weightedScore += 1.0;
    }
    
    // Special case: tech-related themes get bonus for tech stocks
    if (isTechStock && ['tech', 'technology', 'innovation', 'growth'].includes(lowerKeyword)) {
      weightedScore += 0.5;
    }
    
    // Signal type matching
    if (signal.signal_type.includes('institutional') && ['institutional', 'smart money', 'buying'].includes(lowerKeyword)) {
      weightedScore += 0.5;
    }
    
    if (signal.signal_type.includes('technical') && ['technical', 'chart', 'pattern'].includes(lowerKeyword)) {
      weightedScore += 0.3;
    }
  }
  
  // Calculate relevance as percentage of keywords matched, with weighting
  const keywordMatchRatio = theme.keywords.length > 0 ? matchCount / theme.keywords.length : 0;
  const weightedRatio = theme.keywords.length > 0 ? weightedScore / theme.keywords.length : 0;
  
  // Use the higher of the two ratios
  const relevance = Math.max(keywordMatchRatio, weightedRatio);
  
  return Math.min(relevance, 1.0);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const url = new URL(req.url);
    const days = parseInt(url.searchParams.get('days') || '30');
    const themeId = url.searchParams.get('theme_id');

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    console.log('[THEME-SCORING] Starting theme score computation...');

    const since = new Date();
    since.setDate(since.getDate() - days);

    if (themeId) {
      // Get specific theme
      const { data: theme, error: themeError } = await supabaseClient
        .from('themes')
        .select('*')
        .eq('id', themeId)
        .single();

      if (themeError) throw themeError;

      // Get signals via signal_theme_map with asset ticker
      const { data: mappings, error: mappingsError} = await supabaseClient
        .from('signal_theme_map')
        .select(`
          signal_id,
          signals(id, signal_type, observed_at, magnitude, asset_id, value_text, direction)
        `)
        .eq('theme_id', themeId);

      if (mappingsError) throw mappingsError;
      
      // Get asset tickers for mapped signals
      const signalData = mappings?.map((m: any) => m.signals).filter(Boolean) || [];
      const assetIds = [...new Set(signalData.map(s => s.asset_id).filter(Boolean))]; // Filter out nulls
      
      let assets: any[] = [];
      let assetsError = null;
      
      if (assetIds.length > 0) {
        const result = await supabaseClient
          .from('assets')
          .select('id, ticker')
          .in('id', assetIds);
        assets = result.data || [];
        assetsError = result.error;
      }
        
      if (assetsError) throw assetsError;
      
      const assetMap = new Map(assets?.map(a => [a.id, a.ticker]) || []);
      
      const signals: Signal[] = signalData.map(s => ({
        ...s,
        ticker: assetMap.get(s.asset_id) || ''
      }));

      console.log(`[THEME-SCORING] Theme: ${theme.name}, Signals found: ${signals?.length || 0}`);
      if (signals && signals.length > 0) {
        console.log(`[THEME-SCORING] Sample signal:`, signals[0]);
        console.log(`[THEME-SCORING] Signal types:`, [...new Set(signals.map(s => s.signal_type))]);
      }

      const { score, components, positives } = computeThemeScore(signals || []);

      console.log(`[THEME-SCORING] Score: ${score}, Components:`, components);

      // Insert score into theme_scores table (trigger will update themes.score)
      const { error: insertError } = await supabaseClient
        .from('theme_scores')
        .insert({
          theme_id: themeId,
          score: Math.round(score),
          component_scores: components,
          positive_components: positives,
          signal_count: signals?.length || 0,
          computed_at: new Date().toISOString()
        });

      if (insertError) {
        console.error('[THEME-SCORING] ❌ Failed to insert theme score:', insertError);
      } else {
        console.log(`[THEME-SCORING] ✅ Inserted theme score: ${Math.round(score)}/100`);
      }

      console.log(`[THEME-SCORING] ✅ Computed score for ${theme.name}: ${score.toFixed(2)}`);

      return new Response(
        JSON.stringify({
          id: theme.id,
          name: theme.name,
          score: Math.round(score * 100) / 100,
          components: Object.fromEntries(
            Object.entries(components).map(([k, v]) => [k, Math.round(v * 100) / 100])
          ),
          positives,
          weights: WEIGHTS,
          signal_count: signals?.length || 0,
          as_of: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      // Get all themes
      const { data: themes, error: themesError } = await supabaseClient
        .from('themes')
        .select('*');

      if (themesError) throw themesError;

      // Get all recent signals with asset tickers
      const { data: recentSignals, error: signalsError } = await supabaseClient
        .from('signals')
        .select('id, signal_type, observed_at, magnitude, asset_id, value_text, direction')
        .gte('observed_at', since.toISOString())
        .limit(5000)
        .order('observed_at', { ascending: false });

      if (signalsError) throw signalsError;
      
      console.log(`[THEME-SCORING] Retrieved ${recentSignals?.length || 0} signals from database (since ${since.toISOString()})`);
      
      // Get asset tickers - batch queries to avoid "Bad Request" for large IN clauses
      const assetIds = [...new Set(recentSignals?.map(s => s.asset_id).filter(Boolean) || [])];
      
      let assets: any[] = [];
      const BATCH_SIZE = 100; // Reduced to avoid URL length limits
      
      if (assetIds.length > 0) {
        console.log(`[THEME-SCORING] Fetching tickers for ${assetIds.length} assets in batches of ${BATCH_SIZE}`);
        
        for (let i = 0; i < assetIds.length; i += BATCH_SIZE) {
          const batch = assetIds.slice(i, i + BATCH_SIZE);
          const { data: batchAssets, error: batchError } = await supabaseClient
            .from('assets')
            .select('id, ticker')
            .in('id', batch);
          
          if (batchError) {
            console.error(`[THEME-SCORING] Batch ${i / BATCH_SIZE + 1} error:`, batchError);
            throw batchError;
          }
          
          if (batchAssets) {
            assets = assets.concat(batchAssets);
          }
        }
        
        console.log(`[THEME-SCORING] Successfully fetched ${assets.length} asset tickers`);
      }
      
      const assetMap = new Map(assets?.map(a => [a.id, a.ticker]) || []);
      
      const allSignals: Signal[] = (recentSignals || []).map(s => ({
        ...s,
        ticker: assetMap.get(s.asset_id) || ''
      }));

      console.log(`[THEME-SCORING] Found ${themes?.length || 0} themes, ${allSignals?.length || 0} signals`);

      const results = [];
      let updatedCount = 0;
      let mappingsCreated = 0;

      for (const theme of themes || []) {
        // Map signals to this theme based on keyword relevance
        const relevantSignals: Array<{signal: Signal, relevance: number}> = [];
        
        for (const signal of allSignals || []) {
          const relevance = calculateRelevance(signal, theme);
          // Lower threshold from 0.1 to 0.05 to capture more relevant signals
          if (relevance > 0.05) {
            relevantSignals.push({ signal, relevance });
          }
        }

        if (relevantSignals.length === 0) {
          console.log(`[THEME-SCORING] Theme "${theme.name}": 0 relevant signals found`);
          continue;
        }
        
        console.log(`[THEME-SCORING] Theme "${theme.name}": ${relevantSignals.length} relevant signals (threshold: 0.05)`);

        // Check which mappings already exist to avoid counting duplicates
        const signalIds = relevantSignals.map(rs => rs.signal.id);
        const { data: existingMappings } = await supabaseClient
          .from('signal_theme_map')
          .select('signal_id')
          .eq('theme_id', theme.id)
          .in('signal_id', signalIds);
        
        const existingSignalIds = new Set(existingMappings?.map(m => m.signal_id) || []);
        
        // Insert signal-theme mappings
        const mappings = relevantSignals.map(({signal, relevance}) => ({
          signal_id: signal.id,
          theme_id: theme.id,
          relevance_score: relevance
        }));

        const { error: mappingError } = await supabaseClient
          .from('signal_theme_map')
          .upsert(mappings, { 
            onConflict: 'signal_id,theme_id',
            ignoreDuplicates: false 
          });

        if (!mappingError) {
          // Only count NEW mappings, not updates
          const newMappingsCount = mappings.filter(m => !existingSignalIds.has(m.signal_id)).length;
          mappingsCreated += newMappingsCount;
          console.log(`[THEME-SCORING] Theme "${theme.name}": Created ${newMappingsCount} new mappings, updated ${mappings.length - newMappingsCount} existing`);
        } else {
          console.error(`[THEME-SCORING] Theme "${theme.name}": Mapping error:`, mappingError);
        }

        const signals = relevantSignals.map(rs => rs.signal);
        const { score, components, positives } = computeThemeScore(signals);

        // Insert score into theme_scores table (trigger will update themes.score)
        const { error: insertError } = await supabaseClient
          .from('theme_scores')
          .insert({
            theme_id: theme.id,
            score: Math.round(score),
            component_scores: components,
            positive_components: positives,
            signal_count: signals.length,
            computed_at: new Date().toISOString()
          });

        if (!insertError) {
          updatedCount++;
        } else {
          console.error(`[THEME-SCORING] ❌ Failed to insert score for ${theme.name}:`, insertError);
        }

        results.push({
          id: theme.id,
          name: theme.name,
          score: Math.round(score * 100) / 100,
          signal_count: signals.length,
          components: Object.fromEntries(
            Object.entries(components).map(([k, v]) => [k, Math.round(v * 100) / 100])
          ),
          as_of: new Date().toISOString(),
          weights: WEIGHTS,
        });
      }

      // Sort by score descending
      results.sort((a, b) => b.score - a.score);

      const duration = Date.now() - startTime;

      // Log to function_status for monitoring
      await supabaseClient.from('function_status').insert({
        function_name: 'compute-theme-scores',
        status: 'success',
        executed_at: new Date().toISOString(),
        duration_ms: duration,
        rows_inserted: updatedCount + mappingsCreated,
        rows_skipped: (themes?.length || 0) - updatedCount,
        metadata: {
          themes_processed: themes?.length || 0,
          themes_updated: updatedCount,
          mappings_created: mappingsCreated,
          signals_processed: allSignals?.length || 0
        }
      });
      
      // Send Slack notification
      const slackAlerter = new SlackAlerter();
      await slackAlerter.sendLiveAlert({
        etlName: 'compute-theme-scores',
        status: 'success',
        duration: duration,
        rowsInserted: updatedCount + mappingsCreated,
        rowsSkipped: (themes?.length || 0) - updatedCount,
        sourceUsed: 'Theme Scoring Engine',
        metadata: {
          themes_processed: themes?.length || 0,
          themes_updated: updatedCount,
          new_mappings: mappingsCreated,
          signals_processed: allSignals?.length || 0
        }
      });

      console.log(`[THEME-SCORING] ✅ Computed scores for ${themes?.length || 0} themes (${updatedCount} updated, ${mappingsCreated} mappings) in ${duration}ms`);

      return new Response(
        JSON.stringify(results),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('[THEME-SCORING] ❌ Error:', error);
    
    // Add more detailed error logging
    if (error instanceof Error) {
      console.error('[THEME-SCORING] Error name:', error.name);
      console.error('[THEME-SCORING] Error message:', error.message);
      console.error('[THEME-SCORING] Error stack:', error.stack);
    }
    
    const duration = Date.now() - startTime;

    // Log failure to function_status
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    await supabaseClient.from('function_status').insert({
      function_name: 'compute-theme-scores',
      status: 'failure',
      executed_at: new Date().toISOString(),
      duration_ms: duration,
      error_message: error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error',
      metadata: {
        error_stack: error instanceof Error ? error.stack : null
      }
    });

    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        error_type: error instanceof Error ? error.name : 'UnknownError'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
