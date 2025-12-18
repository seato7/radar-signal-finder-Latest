import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  const slackAlerter = new SlackAlerter();

  try {
    const { reminderType } = await req.json();

    let message = '';
    let emoji = '📋';

    if (reminderType === '13f-holdings') {
      emoji = '💼';
      message = `*🔔 QUARTERLY 13F HOLDINGS REMINDER* 💼\n\n` +
        `📅 *Deadline:* 45 days after quarter end\n\n` +
        `*What to do:*\n` +
        `1. Visit SEC EDGAR: https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=13F-HR&dateb=&owner=include&count=40\n` +
        `2. Download latest 13F-HR filings (XML format)\n` +
        `3. Upload via \`ingest-sec-13f-edgar\` endpoint\n\n` +
        `*🎯 Priority Filers (by AUM):*\n` +
        `• Vanguard Group - CIK: 0001067983\n` +
        `• BlackRock - CIK: 0001364742\n` +
        `• State Street - CIK: 0001364846\n` +
        `• Fidelity - CIK: 0000315066\n` +
        `• Berkshire Hathaway - CIK: 0001067983\n` +
        `• Bridgewater Associates - CIK: 0001350694\n` +
        `• Renaissance Technologies - CIK: 0001037389\n\n` +
        `*📊 Quarter Schedule:*\n` +
        `• Q1 (Jan-Mar) → Due May 15\n` +
        `• Q2 (Apr-Jun) → Due Aug 14\n` +
        `• Q3 (Jul-Sep) → Due Nov 14\n` +
        `• Q4 (Oct-Dec) → Due Feb 14`;
    } else if (reminderType === 'etf-flows-weekly') {
      emoji = '📊';
      message = `*🔔 WEEKLY ETF FLOWS DATA CHECK* 📊\n\n` +
        `Time to verify ETF flows data is current!\n\n` +
        `*Auto-ingestion Status:*\n` +
        `The \`ingest-etf-flows\` function now runs automatically using Firecrawl + Lovable AI.\n\n` +
        `*Manual Check:*\n` +
        `If you have premium ETF flow data sources, you can supplement:\n` +
        `• ETF.com Premium Data\n` +
        `• Bloomberg Terminal exports\n` +
        `• Morningstar Direct exports\n\n` +
        `*Format for manual upload:*\n` +
        `CSV with columns: date, ticker, flow (in millions)\n\n` +
        `_This is optional - automatic ingestion handles major ETFs_`;
    } else if (reminderType === 'data-quality-check') {
      emoji = '🔍';
      message = `*🔔 WEEKLY DATA QUALITY CHECK* 🔍\n\n` +
        `Time for your weekly data integrity review!\n\n` +
        `*Check These Dashboards:*\n` +
        `1. Ingestion Health: /ingestion-health\n` +
        `2. Data Sources: /data-sources\n` +
        `3. Pipeline Tests: /pipeline-tests\n\n` +
        `*Key Metrics to Review:*\n` +
        `• Success rates > 95% for all functions\n` +
        `• No stale data > 24 hours\n` +
        `• Signal generation is active\n` +
        `• Theme scores are updating\n\n` +
        `*Common Issues to Watch:*\n` +
        `• API rate limits hit\n` +
        `• Firecrawl/Lovable AI errors\n` +
        `• Database connection issues\n` +
        `• Duplicate key errors`;
    } else if (reminderType === 'monthly-review') {
      emoji = '📈';
      message = `*🔔 MONTHLY DATA PIPELINE REVIEW* 📈\n\n` +
        `Time for comprehensive monthly review!\n\n` +
        `*Review Checklist:*\n` +
        `□ Check all 34 ingestion functions running\n` +
        `□ Review Firecrawl API usage/costs\n` +
        `□ Verify Twelve Data price ingestion\n` +
        `□ Check database storage usage\n` +
        `□ Review signal generation quality\n` +
        `□ Audit alert delivery logs\n\n` +
        `*Data Sources Health:*\n` +
        `• Firecrawl + Lovable AI (12 functions)\n` +
        `• SEC EDGAR (2 functions)\n` +
        `• Alpha Vantage (1 function)\n` +
        `• Reddit API (1 function)\n` +
        `• FRED API (1 function)\n` +
        `• Internal calculations (6 functions)\n\n` +
        `*Action Items:*\n` +
        `• Rotate API keys if needed\n` +
        `• Check Slack alert delivery\n` +
        `• Review error rates in function_status`;
    } else {
      message = `*🔔 REMINDER: ${reminderType}*\n\nPlease check the relevant ingestion function.`;
    }

    if (!SLACK_WEBHOOK_URL) {
      console.log('Reminder (no Slack webhook):', message);
      
      const duration = Date.now() - startTime;
      await slackAlerter.sendLiveAlert({
        etlName: 'remind-manual-ingestion',
        status: 'success',
        duration,
        latencyMs: duration,
        rowsInserted: 0,
      });
      
      return new Response(
        JSON.stringify({ success: true, message: 'Logged (no Slack webhook configured)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const slackPayload = {
      text: message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: message
          }
        },
        {
          type: 'divider'
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `_Sent by Insider Pulse Pipeline Monitor | ${new Date().toISOString()}_`
            }
          ]
        }
      ]
    };

    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload)
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    console.log(`✅ Sent ${reminderType} reminder to Slack`);

    const duration = Date.now() - startTime;
    await slackAlerter.sendLiveAlert({
      etlName: 'remind-manual-ingestion',
      status: 'success',
      duration,
      latencyMs: duration,
      rowsInserted: 1,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        reminderType,
        message: 'Reminder sent to Slack'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );

  } catch (error) {
    console.error('Error sending reminder:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    await slackAlerter.sendCriticalAlert({
      type: 'halted',
      etlName: 'remind-manual-ingestion',
      message: errorMessage,
    });
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
