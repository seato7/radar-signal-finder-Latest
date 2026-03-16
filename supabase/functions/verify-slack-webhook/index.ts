import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    
    if (!webhookUrl) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'SLACK_WEBHOOK_URL not configured',
          configured: false
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    console.log('🧪 Testing Slack webhook...');
    console.log('Webhook URL configured:', webhookUrl.substring(0, 30) + '...');
    
    const testMessage = {
      text: '🧪 *Slack Webhook Test*',
      attachments: [{
        color: '#36a64f',
        fields: [
          {
            title: 'Status',
            value: 'Testing notification system',
            short: true
          },
          {
            title: 'Test ID',
            value: crypto.randomUUID().substring(0, 8),
            short: true
          },
          {
            title: 'Timestamp',
            value: new Date().toISOString(),
            short: false
          }
        ],
        footer: 'InsiderPulse Slack Integration Test'
      }]
    };
    
    console.log('📤 Sending test message to Slack...');
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testMessage)
    });
    
    const responseText = await response.text();
    console.log('Slack API response:', response.status, responseText);
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Slack webhook returned ${response.status}`,
          response_body: responseText,
          configured: true,
          webhook_working: false
        }),
        { 
          status: 502, // Return 502 so caller can detect failure from status code
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
    
    console.log('✅ Slack webhook test successful!');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: '✅ Slack webhook is working! Check your Slack channel for the test message.',
        configured: true,
        webhook_working: true,
        response_status: response.status,
        response_body: responseText
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('❌ Webhook test failed:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error',
        configured: !!Deno.env.get('SLACK_WEBHOOK_URL'),
        webhook_working: false
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
