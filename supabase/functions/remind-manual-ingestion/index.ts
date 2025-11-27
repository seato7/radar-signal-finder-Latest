import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { reminderType } = await req.json();

    let message = '';
    let emoji = '📋';

    if (reminderType === '13f-holdings') {
      emoji = '💼';
      message = `*Quarterly 13F Holdings Reminder* 💼\n\n` +
        `Time to ingest the latest SEC 13F filings!\n\n` +
        `*What to do:*\n` +
        `• Visit SEC EDGAR for major institutional investors\n` +
        `• Download latest 13F-HR filings (XML format)\n` +
        `• Use \`ingest-13f-holdings\` function with filing data\n\n` +
        `*Major filers to check:*\n` +
        `• Vanguard Group (CIK: 0001067983)\n` +
        `• BlackRock (CIK: 0001364742)\n` +
        `• State Street (CIK: 0001364846)\n` +
        `• Fidelity (CIK: 0000315066)\n` +
        `• Berkshire Hathaway (CIK: 0001067983)\n\n` +
        `_Filings are due 45 days after quarter end_`;
    } else if (reminderType === 'prices-csv') {
      emoji = '📊';
      message = `*Monthly Price Data Import Reminder* 📊\n\n` +
        `Time to bulk import price data if you have new datasets!\n\n` +
        `*What to do:*\n` +
        `• Prepare CSV file with columns: ticker, date, close\n` +
        `• Use \`ingest-prices-csv\` function with your CSV data\n` +
        `• Verify date format: YYYY-MM-DD\n\n` +
        `*Good for:*\n` +
        `• Historical data backfills\n` +
        `• Alternative data sources\n` +
        `• Custom ticker imports\n\n` +
        `_Skip if you don't have new data this month_`;
    }

    if (!SLACK_WEBHOOK_URL) {
      console.log('Reminder:', message);
      return new Response(
        JSON.stringify({ success: true, message: 'Logged (no Slack webhook)' }),
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
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
