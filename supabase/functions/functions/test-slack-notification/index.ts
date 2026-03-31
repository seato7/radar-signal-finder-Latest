import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SlackAlerter } from "../_shared/slack-alerts.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🧪 Testing Slack notifications...');
    
    const slackAlerter = new SlackAlerter();
    const testId = crypto.randomUUID().substring(0, 8);
    
    // Test 1: Live Alert (Success)
    console.log('📤 Sending test success alert...');
    await slackAlerter.sendLiveAlert({
      etlName: 'test-slack-notification',
      status: 'success',
      duration: 1.5,
      latencyMs: 500,
      sourceUsed: 'Test Source',
      rowsInserted: 100,
      rowsSkipped: 5,
      metadata: { test_id: testId }
    });
    
    // Wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 2: Live Alert (Failed)
    console.log('📤 Sending test failure alert...');
    await slackAlerter.sendLiveAlert({
      etlName: 'test-slack-notification',
      status: 'failed',
      errorMessage: 'This is a test error message',
      metadata: { test_id: testId }
    });
    
    // Wait 2 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test 3: Critical Alert
    console.log('📤 Sending test critical alert...');
    await slackAlerter.sendCriticalAlert({
      type: 'api_reliability',
      etlName: 'test-slack-notification',
      message: '🧪 This is a TEST critical alert - all systems normal',
      details: {
        test_id: testId,
        purpose: 'Verification of Slack webhook',
        status: 'Testing notification system'
      }
    });
    
    console.log('✅ All test alerts sent successfully');
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Test alerts sent. Check your Slack channel!',
        test_id: testId,
        alerts_sent: 3
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('❌ Test failed:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
