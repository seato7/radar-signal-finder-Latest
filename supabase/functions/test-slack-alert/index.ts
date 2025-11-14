/**
 * TEST FUNCTION: Send live Slack alert and verify alert_history logging
 * This function tests the complete alert pipeline:
 * 1. Sends a test message to Slack webhook
 * 2. Logs to alert_history table
 * 3. Tests deduplication (call twice within 10min)
 */

import { SlackAlerter } from '../_shared/slack-alerts.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const slackAlerter = new SlackAlerter();
    const testTimestamp = new Date().toISOString();

    console.log('🧪 SLACK ALERT TEST - Starting validation...');
    console.log(`Timestamp: ${testTimestamp}`);

    // Test 1: Send critical alert
    console.log('📤 Test 1: Sending critical alert...');
    await slackAlerter.sendCriticalAlert({
      type: 'api_reliability',
      etlName: 'test-slack-alert',
      message: `🧪 PRODUCTION TEST ALERT - ${testTimestamp}`,
      details: {
        test_run: 'manual_validation',
        timestamp: testTimestamp,
        purpose: 'Verify Slack webhook + alert_history logging',
      }
    });

    // Test 2: Send live alert
    console.log('📤 Test 2: Sending live alert...');
    await slackAlerter.sendLiveAlert({
      etlName: 'test-slack-alert',
      status: 'success',
      duration: 1.5,
      rowsInserted: 999,
      sourceUsed: 'Test Source',
      metadata: {
        test_run: 'manual_validation',
        timestamp: testTimestamp,
      }
    });

    // Wait 2 seconds then send duplicate to test deduplication
    console.log('⏳ Waiting 2s before sending duplicate alert...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('📤 Test 3: Sending duplicate alert (should be suppressed)...');
    await slackAlerter.sendCriticalAlert({
      type: 'api_reliability',
      etlName: 'test-slack-alert',
      message: `🧪 DUPLICATE TEST - Should be suppressed`,
      details: {
        test_run: 'deduplication_test',
        expected: 'This should NOT appear in Slack or alert_history',
      }
    });

    // Check alert_history for results
    console.log('🔍 Querying alert_history for test results...');
    const { data: alerts, error: alertError } = await supabase
      .from('alert_history')
      .select('*')
      .eq('function_name', 'test-slack-alert')
      .order('created_at', { ascending: false })
      .limit(5);

    if (alertError) {
      console.error('❌ Failed to query alert_history:', alertError);
    } else {
      console.log(`✅ Found ${alerts?.length || 0} alerts in alert_history`);
      console.log(JSON.stringify(alerts, null, 2));
    }

    // Check Slack webhook configuration
    const webhookConfigured = !!Deno.env.get('SLACK_WEBHOOK_URL');
    console.log(`🔗 Slack webhook configured: ${webhookConfigured ? '✅ YES' : '❌ NO'}`);

    const results = {
      success: true,
      webhook_configured: webhookConfigured,
      alerts_sent: 3,
      alerts_logged: alerts?.length || 0,
      deduplication_test: alerts?.length === 2 ? 'PASSED' : 'FAILED',
      alert_history_records: alerts || [],
      timestamp: testTimestamp,
      instructions: [
        '1. Check your Slack channel for 2 messages (3rd should be deduplicated)',
        '2. Verify alert_history table has 2 records (not 3)',
        '3. Confirm deduplication worked within 10-minute window',
      ],
    };

    return new Response(
      JSON.stringify(results, null, 2),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Test failed:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message,
        stack: error.stack,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
