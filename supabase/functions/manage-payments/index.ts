import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { sendErrorAlert } from '../_shared/error-alerter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_ORIGINS = [
  'https://insiderpulse.org',
  'https://www.insiderpulse.org',
  'http://localhost:3000',
  'http://localhost:5173',
];

function safeOrigin(req: Request): string {
  const origin = req.headers.get('origin') || '';
  return ALLOWED_ORIGINS.includes(origin) ? origin : 'https://insiderpulse.org';
}

// Price ID mapping: plan → period → Stripe price ID
const PRICE_IDS: Record<string, Record<string, string>> = {
  starter: {
    monthly: 'price_1THJR2RxVAVJnFJ46CgqT52b',
    annual:  'price_1THJRxRxVAVJnFJ4PCujKFhL',
  },
  pro: {
    monthly: 'price_1THJSSRxVAVJnFJ4mRtkJkfS',
    annual:  'price_1THJUnRxVAVJnFJ45jLNUNdU',
  },
  premium: {
    monthly: 'price_1THJVJRxVAVJnFJ4wm3RXfx8',
    annual:  'price_1THJVoRxVAVJnFJ4JJVYi2Sv',
  },
};

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    features: {
      max_bots: 0,
      max_alerts: 0,
      backtest_days: 0,
      live_trading: false,
      exports: false,
      analytics: false,
    },
  },
  {
    id: 'starter',
    name: 'Starter',
    monthly_price: 9.99,
    annual_price: 89,
    currency: 'USD',
    features: {
      max_bots: 0,
      max_alerts: 1,
      backtest_days: 30,
      live_trading: false,
      exports: false,
      analytics: false,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    monthly_price: 34.99,
    annual_price: 299,
    currency: 'USD',
    features: {
      max_bots: 0,
      max_alerts: 5,
      backtest_days: 90,
      live_trading: false,
      exports: false,
      analytics: false,
    },
  },
  {
    id: 'premium',
    name: 'Premium',
    monthly_price: 89.99,
    annual_price: 799,
    currency: 'USD',
    features: {
      max_bots: -1,
      max_alerts: -1,
      backtest_days: -1,
      live_trading: true,
      exports: true,
      analytics: true,
    },
  },
];

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MANAGE-PAYMENTS] ${step}${detailsStr}`);
};

// Startup check — log whether critical env vars are present
logStep('STARTUP', {
  stripe_key_present: !!Deno.env.get('STRIPE_SECRET_KEY'),
  stripe_webhook_secret_present: !!Deno.env.get('STRIPE_WEBHOOK_SECRET'),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  const url = new URL(req.url);

  // ── Webhook: must read raw text before any JSON parsing ──
  // Detect webhook by path suffix OR stripe-signature header presence
  if (url.pathname.endsWith('/webhook') || req.headers.get('stripe-signature')) {
    logStep('REQUEST', { method: req.method, path: url.pathname, route: 'webhook' });
    try {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });
      const signature = req.headers.get('stripe-signature') || '';
      const rawBody = await req.text();
      const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

      let event;
      try {
        event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
      } catch {
        return new Response(JSON.stringify({ error: 'Webhook signature verification failed' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Use service role key so webhook DB writes bypass RLS
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const userId = session.metadata?.user_id || session.client_reference_id;
        const planId = session.metadata?.plan_id;
        logStep('Webhook: checkout.session.completed', { userId, planId });
        if (userId && planId) {
          const { error: upsertError } = await supabaseAdmin
            .from('user_roles')
            .upsert({ user_id: userId, role: planId }, { onConflict: 'user_id' });
          if (upsertError) {
            logStep('Error upserting user role', { error: upsertError.message });
          } else {
            logStep('User role updated', { userId, role: planId });
          }
        } else {
          logStep('Webhook: missing userId or planId — cannot update role', { userId, planId });
        }
      }

      if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as any;
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userId = (customer as any).metadata?.user_id;
        logStep('Webhook: subscription event', { type: event.type, status: subscription.status, userId });
        if (userId && (event.type === 'customer.subscription.deleted' || subscription.status !== 'active')) {
          const { error: upsertError } = await supabaseAdmin
            .from('user_roles')
            .upsert({ user_id: userId, role: 'free' }, { onConflict: 'user_id' });
          if (upsertError) {
            logStep('Error resetting user role', { error: upsertError.message });
          } else {
            logStep('User role reset to free', { userId });
          }
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // ── All other routes: read body ONCE here ──
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { body = {}; }
  }

  // Resolve action: body.action first, then path suffix fallback
  let action = (body.action as string) || '';
  if (!action) {
    if (url.pathname.endsWith('/plans'))    action = 'plans';
    else if (url.pathname.endsWith('/checkout')) action = 'checkout';
    else if (url.pathname.endsWith('/status'))   action = 'status';
    else if (url.pathname.endsWith('/portal'))   action = 'portal';
  }

  logStep('REQUEST', { method: req.method, path: url.pathname, action });

  try {
    // Plans — public, no auth required
    if (action === 'plans') {
      return new Response(JSON.stringify({ plans: PLANS }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // All remaining actions require authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    // Status
    if (action === 'status') {
      const { data: roleData } = await supabaseClient
        .from('user_roles').select('role').eq('user_id', user.id).single();
      const plan = roleData?.role || 'free';
      const planDetails = PLANS.find(p => p.id === plan);
      return new Response(JSON.stringify({ plan, features: planDetails?.features, status: 'active' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Checkout
    if (action === 'checkout') {
      try {
        const plan = (body.plan || body.plan_id) as string;
        const period = (body.period as string) || 'monthly';
        const successUrl = body.success_url as string;
        const cancelUrl = body.cancel_url as string;

        logStep('Checkout request', { plan, period, user_id: user.id, user_email: user.email });

        const stripeKey = Deno.env.get('STRIPE_SECRET_KEY');
        if (!stripeKey) {
          logStep('ERROR: STRIPE_SECRET_KEY not set');
          return new Response(JSON.stringify({ error: 'Payment service not configured — STRIPE_SECRET_KEY missing' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        logStep('Stripe key present', { prefix: stripeKey.substring(0, 7) });

        if (!plan || !PRICE_IDS[plan]) {
          return new Response(JSON.stringify({ error: `Invalid plan: "${plan}". Valid: starter, pro, premium` }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (period !== 'monthly' && period !== 'annual') {
          return new Response(JSON.stringify({ error: `Invalid period: "${period}". Must be monthly or annual` }), {
            status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const priceId = PRICE_IDS[plan][period];
        logStep('Resolved price ID', { plan, period, priceId });

        const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' });

        const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
        let customerId = customers.data[0]?.id;
        logStep('Customer lookup', { found: !!customerId, customerId });

        if (!customerId) {
          const customer = await stripe.customers.create({ email: user.email!, metadata: { user_id: user.id } });
          customerId = customer.id;
          logStep('Customer created', { customerId });
        }

        const sessionParams: Record<string, unknown> = {
          customer: customerId,
          client_reference_id: user.id,
          line_items: [{ price: priceId, quantity: 1 }],
          mode: 'subscription',
          success_url: successUrl || `${safeOrigin(req)}/pricing?success=true`,
          cancel_url: cancelUrl || `${safeOrigin(req)}/pricing?canceled=true`,
          metadata: { user_id: user.id, plan_id: plan, period },
        };

        if (plan === 'starter' && period === 'monthly') {
          sessionParams.subscription_data = { trial_period_days: 7 };
          sessionParams.payment_method_collection = 'always';
        }

        logStep('Creating Stripe checkout session', { plan, period, priceId, customerId });
        const session = await stripe.checkout.sessions.create(sessionParams as any);
        logStep('Checkout session created', { sessionId: session.id, url: session.url?.substring(0, 60) });

        return new Response(JSON.stringify({ url: session.url }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      } catch (checkoutError: any) {
        const stripeCode = checkoutError?.raw?.code || checkoutError?.code || 'unknown';
        const stripeType = checkoutError?.raw?.type || checkoutError?.type || 'unknown';
        const message = checkoutError?.message || 'Checkout failed';
        logStep('CHECKOUT ERROR', { message, stripeCode, stripeType, stack: checkoutError?.stack?.substring(0, 300) });
        return new Response(JSON.stringify({ error: message, code: stripeCode, type: stripeType }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Pause
    if (action === 'pause') {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });
      logStep('Pause: looking up customer', { email: user.email });
      const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
      if (!customers.data[0]) throw new Error('No Stripe customer found for this account');
      const customerId = customers.data[0].id;
      logStep('Pause: finding active or trialing subscription', { customerId });
      const [activeSubs, trialSubs] = await Promise.all([
        stripe.subscriptions.list({ customer: customerId, status: 'active', limit: 1 }),
        stripe.subscriptions.list({ customer: customerId, status: 'trialing', limit: 1 }),
      ]);
      const subscription = activeSubs.data[0] || trialSubs.data[0];
      if (!subscription) throw new Error('No active subscription found');
      const subscriptionId = subscription.id;
      const resumesAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      logStep('Pause: pausing subscription', { subscriptionId, resumesAt });
      await stripe.subscriptions.update(subscriptionId, {
        pause_collection: {
          behavior: 'mark_uncollectable',
          resumes_at: resumesAt,
        },
      } as any);
      logStep('Pause: subscription paused successfully', { subscriptionId, resumesAt });
      return new Response(JSON.stringify({ success: true, resumes_at: resumesAt }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Portal
    if (action === 'portal') {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', { apiVersion: '2023-10-16' });
      const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
      if (!customers.data[0]) throw new Error('No subscription found');
      const session = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: `${safeOrigin(req)}/settings`,
      });
      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error(`Not found — unrecognised action: "${action}"`);

  } catch (error) {
    const errorMessage = (error as Error).message;
    logStep('ERROR', { message: errorMessage });
    try { await sendErrorAlert('manage-payments', error, { url: req.url }); } catch (_) { /* ignore */ }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
