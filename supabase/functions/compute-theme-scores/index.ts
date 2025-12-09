import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Theme {
  id: string;
  name: string;
  tickers: string[];
  keywords: string[];
}

interface ComponentScores {
  technical: number;
  pattern: number;
  sentiment: number;
  institutionalFlow: number;
  insiderActivity: number;
  optionsFlow: number;
  cryptoOnchain: number;
  momentum: number;
  earnings: number;
  shortInterest: number;
}

// Component weights - aligned with asset scoring
const WEIGHTS: Record<string, number> = {
  technical: 1.0,
  pattern: 0.8,
  sentiment: 0.8,
  institutionalFlow: 1.0,
  insiderActivity: 0.8,
  optionsFlow: 0.7,
  cryptoOnchain: 0.5,
  momentum: 0.9,
  earnings: 0.6,
  shortInterest: 0.5,
};

// Helper to build lookup maps
function buildMap(data: any[] | null, key: string = "ticker"): Map<string, any[]> {
  const map = new Map<string, any[]>();
  (data || []).forEach((item) => {
    const ticker = (item[key] || "").toUpperCase();
    if (!map.has(ticker)) map.set(ticker, []);
    map.get(ticker)!.push(item);
  });
  return map;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all themes with their tickers
    const { data: themes, error: themesError } = await supabase
      .from("themes")
      .select("id, name, tickers, keywords");

    if (themesError) throw themesError;
    if (!themes || themes.length === 0) {
      return new Response(JSON.stringify({ error: "No themes found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Collect all unique tickers from all themes
    const allTickers = new Set<string>();
    themes.forEach((theme: Theme) => {
      (theme.tickers || []).forEach((t: string) => allTickers.add(t.toUpperCase()));
    });
    const tickerList = Array.from(allTickers);

    console.log(`[THEME-SCORING] Computing scores for ${themes.length} themes with ${tickerList.length} unique tickers`);
    console.log(`[THEME-SCORING] Tickers: ${tickerList.slice(0, 20).join(", ")}${tickerList.length > 20 ? "..." : ""}`);

    // Date ranges
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch ALL data sources in parallel - same as asset scoring (15+ data sources)
    const [
      advancedTechnicalsResult,
      pricesResult,
      darkPoolResult,
      patternRecognitionResult,
      newsSentimentResult,
      optionsFlowResult,
      congressionalResult,
      smartMoneyResult,
      cryptoOnchainResult,
      form4Result,
      shortInterestResult,
      earningsResult,
      forexSentimentResult,
      forexTechnicalsResult,
      cotReportsResult,
    ] = await Promise.all([
      // 1. Advanced technicals
      supabase
        .from("advanced_technicals")
        .select("ticker, stochastic_signal, trend_strength, breakout_signal, adx, price_vs_vwap_pct")
        .in("ticker", tickerList)
        .order("timestamp", { ascending: false }),

      // 2. Prices for momentum (from TwelveData)
      supabase
        .from("prices")
        .select("ticker, close, change_percent, updated_at")
        .in("ticker", tickerList)
        .order("updated_at", { ascending: false }),

      // 3. Dark pool activity
      supabase
        .from("dark_pool_activity")
        .select("ticker, signal_strength, signal_type, dark_pool_percentage")
        .in("ticker", tickerList)
        .gte("trade_date", thirtyDaysAgo)
        .order("trade_date", { ascending: false }),

      // 4. Pattern recognition
      supabase
        .from("pattern_recognition")
        .select("ticker, pattern_type, confidence_score, pattern_category")
        .in("ticker", tickerList)
        .gte("detected_at", thirtyDaysAgo)
        .order("detected_at", { ascending: false }),

      // 5. News sentiment
      supabase
        .from("news_sentiment_aggregate")
        .select("ticker, sentiment_score, sentiment_label, buzz_score")
        .in("ticker", tickerList)
        .gte("date", sevenDaysAgo)
        .order("date", { ascending: false }),

      // 6. Options flow
      supabase
        .from("options_flow")
        .select("ticker, sentiment, flow_type, premium")
        .in("ticker", tickerList)
        .gte("trade_date", thirtyDaysAgo)
        .order("trade_date", { ascending: false }),

      // 7. Congressional trades
      supabase
        .from("congressional_trades")
        .select("ticker, transaction_type, amount_min, representative")
        .in("ticker", tickerList)
        .gte("transaction_date", ninetyDaysAgo)
        .order("transaction_date", { ascending: false }),

      // 8. Smart money flow
      supabase
        .from("smart_money_flow")
        .select("ticker, smart_money_signal, institutional_net_flow, smart_money_index")
        .in("ticker", tickerList)
        .gte("timestamp", thirtyDaysAgo)
        .order("timestamp", { ascending: false }),

      // 9. Crypto onchain
      supabase
        .from("crypto_onchain_metrics")
        .select("ticker, whale_signal, exchange_flow_signal, fear_greed_index")
        .in("ticker", tickerList)
        .order("timestamp", { ascending: false }),

      // 10. Form 4 insider trading
      supabase
        .from("form4_filings")
        .select("ticker, transaction_type, shares_traded, ownership_type")
        .in("ticker", tickerList)
        .gte("filing_date", ninetyDaysAgo)
        .order("filing_date", { ascending: false }),

      // 11. Short interest
      supabase
        .from("short_interest")
        .select("ticker, float_percentage, days_to_cover")
        .in("ticker", tickerList)
        .order("report_date", { ascending: false }),

      // 12. Earnings sentiment
      supabase
        .from("earnings_sentiment")
        .select("ticker, earnings_surprise, sentiment_score")
        .in("ticker", tickerList)
        .order("earnings_date", { ascending: false }),

      // 13. Forex sentiment (for currency themes)
      supabase
        .from("forex_sentiment")
        .select("ticker, retail_sentiment, news_sentiment_score")
        .in("ticker", tickerList)
        .order("timestamp", { ascending: false }),

      // 14. Forex technicals
      supabase
        .from("forex_technicals")
        .select("ticker, rsi_signal, macd_crossover, ma_crossover")
        .in("ticker", tickerList)
        .order("timestamp", { ascending: false }),

      // 15. COT reports
      supabase
        .from("cot_reports")
        .select("ticker, sentiment, noncommercial_net")
        .in("ticker", tickerList)
        .order("report_date", { ascending: false }),
    ]);

    // Log data source counts
    console.log(`[THEME-SCORING] Data sources loaded:
      - Advanced Technicals: ${advancedTechnicalsResult.data?.length || 0}
      - Prices (TwelveData): ${pricesResult.data?.length || 0}
      - Dark Pool: ${darkPoolResult.data?.length || 0}
      - Pattern Recognition: ${patternRecognitionResult.data?.length || 0}
      - News Sentiment: ${newsSentimentResult.data?.length || 0}
      - Options Flow: ${optionsFlowResult.data?.length || 0}
      - Congressional: ${congressionalResult.data?.length || 0}
      - Smart Money: ${smartMoneyResult.data?.length || 0}
      - Crypto Onchain: ${cryptoOnchainResult.data?.length || 0}
      - Form 4: ${form4Result.data?.length || 0}
      - Short Interest: ${shortInterestResult.data?.length || 0}
      - Earnings: ${earningsResult.data?.length || 0}
      - Forex Sentiment: ${forexSentimentResult.data?.length || 0}
      - Forex Technicals: ${forexTechnicalsResult.data?.length || 0}
      - COT Reports: ${cotReportsResult.data?.length || 0}`);

    // Build lookup maps for each data source
    const technicalsMap = buildMap(advancedTechnicalsResult.data);
    const pricesMap = buildMap(pricesResult.data);
    const darkPoolMap = buildMap(darkPoolResult.data);
    const patternsMap = buildMap(patternRecognitionResult.data);
    const newsMap = buildMap(newsSentimentResult.data);
    const optionsMap = buildMap(optionsFlowResult.data);
    const congressMap = buildMap(congressionalResult.data);
    const smartMoneyMap = buildMap(smartMoneyResult.data);
    const cryptoMap = buildMap(cryptoOnchainResult.data);
    const form4Map = buildMap(form4Result.data);
    const shortInterestMap = buildMap(shortInterestResult.data);
    const earningsMap = buildMap(earningsResult.data);
    const forexSentimentMap = buildMap(forexSentimentResult.data);
    const forexTechnicalsMap = buildMap(forexTechnicalsResult.data);
    const cotMap = buildMap(cotReportsResult.data);

    // Calculate score for each theme by aggregating ticker scores
    const themeScores: Array<{
      theme_id: string;
      theme_name: string;
      score: number;
      components: ComponentScores;
      positives: string[];
      ticker_count: number;
      data_coverage: number;
    }> = [];

    for (const theme of themes) {
      const themeTickers = (theme.tickers || []).map((t: string) => t.toUpperCase());
      if (themeTickers.length === 0) {
        console.log(`[THEME-SCORING] Theme "${theme.name}" has no tickers, skipping`);
        continue;
      }

      // Aggregate scores across all tickers in the theme
      const componentSums: ComponentScores = {
        technical: 0,
        pattern: 0,
        sentiment: 0,
        institutionalFlow: 0,
        insiderActivity: 0,
        optionsFlow: 0,
        cryptoOnchain: 0,
        momentum: 0,
        earnings: 0,
        shortInterest: 0,
      };
      const componentCounts: Record<string, number> = {};
      let tickersWithData = 0;

      for (const ticker of themeTickers) {
        let hasData = false;

        // ═══════════════════════════════════════════════════════════════════
        // 1. TECHNICAL STRENGTH (Weight: 1.0)
        // ═══════════════════════════════════════════════════════════════════
        const techs = technicalsMap.get(ticker) || [];
        if (techs.length > 0) {
          hasData = true;
          const tech = techs[0];
          let score = 50;

          const stochSignal = (tech.stochastic_signal || "").toLowerCase();
          if (stochSignal === "oversold") score += 15;
          else if (stochSignal === "overbought") score -= 10;

          const trend = (tech.trend_strength || "").toLowerCase();
          if (trend.includes("strong") && trend.includes("up")) score += 12;
          else if (trend.includes("strong") && trend.includes("down")) score -= 12;
          else if (trend.includes("weak") && trend.includes("up")) score += 5;
          else if (trend.includes("weak") && trend.includes("down")) score -= 5;

          const breakout = (tech.breakout_signal || "").toLowerCase();
          if (breakout.includes("bull")) score += 10;
          else if (breakout.includes("bear")) score -= 10;

          if (tech.adx && Number(tech.adx) > 25) score += 5;

          componentSums.technical += Math.max(0, Math.min(100, score));
          componentCounts.technical = (componentCounts.technical || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 2. MOMENTUM FROM PRICES (Weight: 0.9) - Uses TwelveData
        // ═══════════════════════════════════════════════════════════════════
        const prices = pricesMap.get(ticker) || [];
        if (prices.length > 0) {
          hasData = true;
          let score = 50;
          const latestPrice = prices[0];

          // Use change_percent from TwelveData
          if (latestPrice.change_percent !== null && latestPrice.change_percent !== undefined) {
            const changePct = Number(latestPrice.change_percent);
            if (changePct > 5) score += 25;
            else if (changePct > 3) score += 20;
            else if (changePct > 1) score += 10;
            else if (changePct > 0) score += 5;
            else if (changePct < -5) score -= 20;
            else if (changePct < -3) score -= 15;
            else if (changePct < -1) score -= 8;
          }

          componentSums.momentum += Math.max(0, Math.min(100, score));
          componentCounts.momentum = (componentCounts.momentum || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 3. PATTERN RECOGNITION (Weight: 0.8)
        // ═══════════════════════════════════════════════════════════════════
        const patterns = patternsMap.get(ticker) || [];
        if (patterns.length > 0) {
          hasData = true;
          let score = 50;
          patterns.slice(0, 3).forEach((p: any) => {
            const confidence = p.confidence_score || 0.5;
            const patternType = (p.pattern_type || "").toLowerCase();
            if (patternType.includes("bullish") || patternType.includes("ascending")) {
              score += 10 * confidence;
            } else if (patternType.includes("bearish") || patternType.includes("descending")) {
              score -= 10 * confidence;
            }
          });
          componentSums.pattern += Math.max(0, Math.min(100, score));
          componentCounts.pattern = (componentCounts.pattern || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 4. SENTIMENT (Weight: 0.8) - News + Forex
        // ═══════════════════════════════════════════════════════════════════
        const news = newsMap.get(ticker) || [];
        const forexSent = forexSentimentMap.get(ticker) || [];
        if (news.length > 0 || forexSent.length > 0) {
          hasData = true;
          let score = 50;

          if (news.length > 0) {
            const n = news[0];
            if (n.sentiment_score !== null) {
              score = 50 + Number(n.sentiment_score) * 40;
            } else if (n.sentiment_label) {
              if (n.sentiment_label === "bullish" || n.sentiment_label === "positive") score = 70;
              else if (n.sentiment_label === "bearish" || n.sentiment_label === "negative") score = 30;
            }
            // Buzz score bonus
            if (n.buzz_score && Number(n.buzz_score) > 50) score += 5;
          }

          if (forexSent.length > 0) {
            const fs = forexSent[0];
            if (fs.retail_sentiment === "bullish") score += 10;
            else if (fs.retail_sentiment === "bearish") score -= 10;
          }

          componentSums.sentiment += Math.max(0, Math.min(100, score));
          componentCounts.sentiment = (componentCounts.sentiment || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 5. INSTITUTIONAL FLOW (Weight: 1.0) - Dark Pool + Smart Money
        // ═══════════════════════════════════════════════════════════════════
        const darkPool = darkPoolMap.get(ticker) || [];
        const smartMoney = smartMoneyMap.get(ticker) || [];
        if (darkPool.length > 0 || smartMoney.length > 0) {
          hasData = true;
          let score = 50;

          darkPool.slice(0, 5).forEach((dp: any) => {
            if (dp.signal_strength === "strong" && dp.signal_type === "accumulation") score += 10;
            else if (dp.signal_strength === "strong" && dp.signal_type === "distribution") score -= 10;
            else if (dp.signal_type === "accumulation") score += 5;
            else if (dp.signal_type === "distribution") score -= 5;
          });

          if (smartMoney.length > 0) {
            const sm = smartMoney[0];
            if (sm.smart_money_signal === "bullish" || sm.institutional_net_flow > 0) score += 12;
            else if (sm.smart_money_signal === "bearish" || sm.institutional_net_flow < 0) score -= 12;
          }

          componentSums.institutionalFlow += Math.max(0, Math.min(100, score));
          componentCounts.institutionalFlow = (componentCounts.institutionalFlow || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 6. INSIDER ACTIVITY (Weight: 0.8) - Congressional + Form4
        // ═══════════════════════════════════════════════════════════════════
        const congress = congressMap.get(ticker) || [];
        const form4 = form4Map.get(ticker) || [];
        if (congress.length > 0 || form4.length > 0) {
          hasData = true;
          let score = 50;

          congress.forEach((c: any) => {
            const amount = c.amount_min || 0;
            const weight = amount > 100000 ? 2 : 1;
            if (c.transaction_type === "purchase" || c.transaction_type === "buy") score += 10 * weight;
            else if (c.transaction_type === "sale" || c.transaction_type === "sell") score -= 6 * weight;
          });

          form4.slice(0, 10).forEach((f: any) => {
            if (f.transaction_type === "P" || f.transaction_type === "purchase") score += 5;
            else if (f.transaction_type === "S" || f.transaction_type === "sale") score -= 3;
          });

          componentSums.insiderActivity += Math.max(0, Math.min(100, score));
          componentCounts.insiderActivity = (componentCounts.insiderActivity || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 7. OPTIONS FLOW (Weight: 0.7)
        // ═══════════════════════════════════════════════════════════════════
        const options = optionsMap.get(ticker) || [];
        if (options.length > 0) {
          hasData = true;
          let score = 50;
          options.slice(0, 10).forEach((o: any) => {
            if (o.sentiment === "bullish" || o.flow_type === "unusual_call") score += 5;
            else if (o.sentiment === "bearish" || o.flow_type === "unusual_put") score -= 5;
          });
          componentSums.optionsFlow += Math.max(0, Math.min(100, score));
          componentCounts.optionsFlow = (componentCounts.optionsFlow || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 8. CRYPTO ON-CHAIN (Weight: 0.5)
        // ═══════════════════════════════════════════════════════════════════
        const crypto = cryptoMap.get(ticker) || [];
        if (crypto.length > 0) {
          hasData = true;
          const c = crypto[0];
          let score = 50;
          if (c.whale_signal === "accumulation") score += 18;
          else if (c.whale_signal === "distribution") score -= 18;
          if (c.exchange_flow_signal === "bullish") score += 12;
          else if (c.exchange_flow_signal === "bearish") score -= 12;
          if (c.fear_greed_index !== null) {
            if (c.fear_greed_index < 25) score += 10; // Extreme fear = buy opportunity
            else if (c.fear_greed_index > 75) score -= 10; // Extreme greed = caution
          }
          componentSums.cryptoOnchain += Math.max(0, Math.min(100, score));
          componentCounts.cryptoOnchain = (componentCounts.cryptoOnchain || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 9. EARNINGS (Weight: 0.6)
        // ═══════════════════════════════════════════════════════════════════
        const earnings = earningsMap.get(ticker) || [];
        if (earnings.length > 0) {
          hasData = true;
          const e = earnings[0];
          let score = 50;
          if (e.earnings_surprise > 15) score += 20;
          else if (e.earnings_surprise > 5) score += 12;
          else if (e.earnings_surprise > 0) score += 6;
          else if (e.earnings_surprise < -15) score -= 20;
          else if (e.earnings_surprise < -5) score -= 12;
          else if (e.earnings_surprise < 0) score -= 6;
          componentSums.earnings += Math.max(0, Math.min(100, score));
          componentCounts.earnings = (componentCounts.earnings || 0) + 1;
        }

        // ═══════════════════════════════════════════════════════════════════
        // 10. SHORT INTEREST (Weight: 0.5)
        // ═══════════════════════════════════════════════════════════════════
        const shorts = shortInterestMap.get(ticker) || [];
        if (shorts.length > 0) {
          hasData = true;
          const s = shorts[0];
          let score = 50;
          // High short interest can be bullish (squeeze potential)
          if (s.float_percentage > 25) score += 15; // High squeeze potential
          else if (s.float_percentage > 15) score += 10;
          else if (s.float_percentage > 10) score += 5;
          if (s.days_to_cover > 7) score += 8;
          else if (s.days_to_cover > 4) score += 4;
          componentSums.shortInterest += Math.max(0, Math.min(100, score));
          componentCounts.shortInterest = (componentCounts.shortInterest || 0) + 1;
        }

        if (hasData) tickersWithData++;
      }

      // Calculate average scores for each component
      const avgComponents: ComponentScores = {
        technical: componentCounts.technical ? componentSums.technical / componentCounts.technical : 50,
        pattern: componentCounts.pattern ? componentSums.pattern / componentCounts.pattern : 50,
        sentiment: componentCounts.sentiment ? componentSums.sentiment / componentCounts.sentiment : 50,
        institutionalFlow: componentCounts.institutionalFlow ? componentSums.institutionalFlow / componentCounts.institutionalFlow : 50,
        insiderActivity: componentCounts.insiderActivity ? componentSums.insiderActivity / componentCounts.insiderActivity : 50,
        optionsFlow: componentCounts.optionsFlow ? componentSums.optionsFlow / componentCounts.optionsFlow : 50,
        cryptoOnchain: componentCounts.cryptoOnchain ? componentSums.cryptoOnchain / componentCounts.cryptoOnchain : 50,
        momentum: componentCounts.momentum ? componentSums.momentum / componentCounts.momentum : 50,
        earnings: componentCounts.earnings ? componentSums.earnings / componentCounts.earnings : 50,
        shortInterest: componentCounts.shortInterest ? componentSums.shortInterest / componentCounts.shortInterest : 50,
      };

      // Calculate weighted final score - only use components with actual data
      let totalWeightedScore = 0;
      let totalWeight = 0;
      const positives: string[] = [];

      for (const [component, weight] of Object.entries(WEIGHTS)) {
        const score = avgComponents[component as keyof ComponentScores];
        const count = componentCounts[component] || 0;

        if (count > 0) {
          totalWeightedScore += score * weight;
          totalWeight += weight;

          // Track positive components (above neutral)
          if (score > 55) {
            positives.push(component);
          }
        }
      }

      const finalScore = totalWeight > 0 ? Math.round(totalWeightedScore / totalWeight) : 50;
      const dataCoverage = themeTickers.length > 0 ? Math.round((tickersWithData / themeTickers.length) * 100) : 0;

      themeScores.push({
        theme_id: theme.id,
        theme_name: theme.name,
        score: finalScore,
        components: avgComponents,
        positives,
        ticker_count: themeTickers.length,
        data_coverage: dataCoverage,
      });

      console.log(`[THEME-SCORING] ${theme.name}: score=${finalScore}, tickers=${themeTickers.length}, coverage=${dataCoverage}%, positives=[${positives.join(", ")}]`);
    }

    // Sort by score descending
    themeScores.sort((a, b) => b.score - a.score);

    // Store scores in theme_scores table
    const now = new Date().toISOString();
    let updatedCount = 0;

    for (const ts of themeScores) {
      const { error: upsertError } = await supabase.from("theme_scores").upsert({
        theme_id: ts.theme_id,
        score: ts.score,
        component_scores: ts.components,
        positive_components: ts.positives,
        signal_count: ts.ticker_count,
        computed_at: now,
      }, {
        onConflict: "theme_id",
      });

      if (!upsertError) {
        // Update theme score cache
        await supabase.from("themes").update({
          score: ts.score,
          updated_at: now,
        }).eq("id", ts.theme_id);
        updatedCount++;
      } else {
        console.error(`[THEME-SCORING] Failed to update ${ts.theme_name}:`, upsertError);
      }
    }

    const durationMs = Date.now() - startTime;

    // Log success
    await supabase.from("function_status").insert({
      function_name: "compute-theme-scores",
      status: "success",
      rows_inserted: updatedCount,
      duration_ms: durationMs,
      metadata: {
        themes_processed: themes.length,
        unique_tickers: tickerList.length,
        data_sources_used: 15,
        scores: themeScores.map(t => ({ name: t.theme_name, score: t.score, coverage: t.data_coverage })),
      },
    });

    console.log(`[THEME-SCORING] ✅ Complete: ${updatedCount}/${themes.length} themes updated in ${durationMs}ms`);

    return new Response(JSON.stringify({
      success: true,
      themes: themeScores,
      metadata: {
        themes_processed: themes.length,
        themes_updated: updatedCount,
        unique_tickers: tickerList.length,
        data_sources_used: 15,
        duration_ms: durationMs,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[THEME-SCORING] ❌ Error:", errorMessage);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await supabase.from("function_status").insert({
      function_name: "compute-theme-scores",
      status: "error",
      error_message: errorMessage,
      duration_ms: Date.now() - startTime,
    });

    return new Response(JSON.stringify({
      error: errorMessage,
      success: false,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
