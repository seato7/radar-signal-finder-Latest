// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Require authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    // Verify user authentication
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    console.log(`Generating AI research report for user ${user.id}...`);
    const { ticker, report_type } = await req.json();

    if (!ticker) {
      throw new Error('Ticker is required');
    }

    console.log(`📊 Generating AI research report for ${ticker}...`);

    // Get asset
    const { data: asset } = await supabaseClient
      .from('assets')
      .select('*')
      .eq('ticker', ticker)
      .single();

    if (!asset) {
      throw new Error(`Asset ${ticker} not found`);
    }

    // Gather all available data for the asset
    const [signals, technicals, sentiment, patterns, onchain, smartMoney] = await Promise.all([
      supabaseClient.from('signals').select('*').eq('asset_id', asset.id).order('observed_at', { ascending: false }).limit(50),
      supabaseClient.from('advanced_technicals').select('*').eq('asset_id', asset.id).order('timestamp', { ascending: false }).limit(1),
      supabaseClient.from('news_sentiment_aggregate').select('*').eq('asset_id', asset.id).order('date', { ascending: false }).limit(1),
      supabaseClient.from('pattern_recognition').select('*').eq('asset_id', asset.id).eq('status', 'confirmed').limit(5),
      asset.asset_class === 'crypto' ? supabaseClient.from('crypto_onchain_metrics').select('*').eq('asset_id', asset.id).order('timestamp', { ascending: false }).limit(1) : { data: null },
      supabaseClient.from('smart_money_flow').select('*').eq('asset_id', asset.id).order('timestamp', { ascending: false }).limit(1),
    ]);

    // Prepare comprehensive context
    const context = {
      asset,
      signals: signals.data || [],
      technicals: technicals.data?.[0],
      sentiment: sentiment.data?.[0],
      patterns: patterns.data || [],
      onchain: onchain.data?.[0],
      smartMoney: smartMoney.data?.[0],
    };

    // Generate report using AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const prompt = buildResearchPrompt(context, report_type || 'comprehensive');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are an expert financial analyst generating professional research reports. Be analytical, data-driven, and provide actionable insights.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const aiData = await response.json();
    const reportContent = aiData.choices[0]?.message?.content;

    if (!reportContent) {
      throw new Error('No report generated');
    }

    // Parse AI response into structured format
    const report = parseAIReport(reportContent, context);

    // Store report
    const { data: savedReport, error: saveError } = await supabaseClient
      .from('ai_research_reports')
      .insert({
        ticker: asset.ticker,
        asset_id: asset.id,
        asset_class: asset.asset_class,
        report_type: report_type || 'comprehensive',
        ...report,
        generated_by: 'gemini-2.5-flash',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      })
      .select()
      .single();

    if (saveError) throw saveError;

    return new Response(
      JSON.stringify({
        success: true,
        report: savedReport,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error generating report:', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildResearchPrompt(context: any, reportType: string): string {
  const { asset, signals, technicals, sentiment, patterns } = context;

  return `Generate a professional ${reportType} research report for ${asset.name} (${asset.ticker}).

AVAILABLE DATA:
- Asset Class: ${asset.asset_class}
- Recent Signals (${signals.length}): ${signals.slice(0, 10).map((s: any) => `${s.signal_type}: ${s.value_text}`).join(', ')}
- Technical Indicators: ${JSON.stringify(technicals || 'No data')}
- Sentiment Score: ${sentiment?.sentiment_score || 'No data'}
- Active Patterns: ${patterns.map((p: any) => p.pattern_type).join(', ') || 'None'}

Generate a comprehensive report with:
1. EXECUTIVE SUMMARY (2-3 sentences, include clear recommendation)
2. KEY FINDINGS (3-5 bullet points)
3. TECHNICAL ANALYSIS (current trend, support/resistance, indicators)
4. SENTIMENT ANALYSIS (news sentiment, social sentiment if available)
5. RISK ASSESSMENT (key risks and mitigations)

At the end, provide:
- RECOMMENDATION: strong_buy, buy, hold, sell, or strong_sell
- CONFIDENCE SCORE: 0-100
- TARGET PRICE: Estimated fair value
- STOP LOSS: Risk management level
- TIME HORIZON: short_term (1-7d), medium_term (1-4w), or long_term (1-6m)

Format as clear markdown with headers.`;
}

function parseAIReport(content: string, context: any) {
  // Extract key sections (simplified parser)
  const lines = content.split('\n');
  
  let executive_summary = '';
  let technical_analysis = '';
  let sentiment_analysis = '';
  let risk_assessment = '';
  let recommendation = 'hold';
  let confidence_score = 50;
  let target_price = null;
  let stop_loss = null;
  let time_horizon = 'medium_term';

  // Simple extraction logic
  let currentSection = '';
  let summaryLines: string[] = [];
  let keyFindings: any[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('executive summary')) {
      currentSection = 'summary';
    } else if (lower.includes('key findings')) {
      currentSection = 'findings';
    } else if (lower.includes('technical analysis')) {
      currentSection = 'technical';
    } else if (lower.includes('sentiment analysis')) {
      currentSection = 'sentiment';
    } else if (lower.includes('risk assessment')) {
      currentSection = 'risk';
    } else if (lower.includes('recommendation:')) {
      const match = line.match(/(strong_buy|buy|hold|sell|strong_sell)/i);
      if (match) recommendation = match[1].toLowerCase();
    } else if (lower.includes('confidence score:') || lower.includes('confidence:')) {
      const match = line.match(/(\d+)/);
      if (match) {
        const parsed = parseInt(match[1]);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 100) {
          confidence_score = parsed;
        } else {
          console.warn(`[generate-ai-research] Confidence score out of range or NaN: ${match[1]}, keeping default 50`);
        }
      }
    } else if (currentSection === 'summary' && line.trim()) {
      summaryLines.push(line.trim());
    } else if (currentSection === 'technical' && line.trim()) {
      technical_analysis += line + '\n';
    } else if (currentSection === 'sentiment' && line.trim()) {
      sentiment_analysis += line + '\n';
    } else if (currentSection === 'risk' && line.trim()) {
      risk_assessment += line + '\n';
    } else if (currentSection === 'findings' && line.trim().startsWith('-')) {
      keyFindings.push(line.trim().substring(1).trim());
    }
  }

  executive_summary = summaryLines.join(' ').substring(0, 500) || 'Analysis pending';

  return {
    executive_summary,
    key_findings: keyFindings.length > 0 ? keyFindings : ['Analysis based on available signals', 'Technical indicators considered', 'Sentiment data reviewed'],
    technical_analysis: technical_analysis || 'Technical analysis in progress',
    sentiment_analysis: sentiment_analysis || 'Sentiment analysis in progress',
    risk_assessment: risk_assessment || 'Risk factors under evaluation',
    recommendation,
    confidence_score: Math.min(Math.max(confidence_score, 0), 100),
    target_price,
    stop_loss,
    time_horizon,
    data_sources: ['signals', 'technicals', 'sentiment', 'patterns'],
    signal_count: context.signals.length,
  };
}
