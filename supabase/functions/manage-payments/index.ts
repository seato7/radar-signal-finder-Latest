import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
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

  try {
    // Get plans endpoint (public)
    if (url.pathname.endsWith('/plans')) {
      return new Response(JSON.stringify({ plans: PLANS }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    // Get subscription status
    if (url.pathname.endsWith('/status')) {
      const { data: roleData } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();

      const plan = roleData?.role || 'free';
      const planDetails = PLANS.find(p => p.id === plan);

      return new Response(JSON.stringify({
        plan,
        features: planDetails?.features,
        status: 'active',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create checkout session
    if (req.method === 'POST' && url.pathname.endsWith('/checkout')) {
      const body = await req.json();
      const plan = body.plan || body.plan_id;
      const period = body.period || 'monthly';
      const successUrl = body.success_url;
      const cancelUrl = body.cancel_url;

      logStep('Checkout request', { plan, period });

      if (!plan || !PRICE_IDS[plan]) {
        throw new Error(`Invalid plan: ${plan}`);
      }
      if (period !== 'monthly' && period !== 'annual') {
        throw new Error(`Invalid period: ${period}`);
      }

      const priceId = PRICE_IDS[plan][period];
      if (!priceId) {
        throw new Error(`No price found for ${plan}/${period}`);
      }

      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
        apiVersion: '2024-11-20',
      });

      const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
      let customerId = customers.data[0]?.id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email!,
          metadata: { user_id: user.id },
        });
        customerId = customer.id;
      }

      logStep('Creating checkout session', { plan, period, priceId, customerId });

      const sessionParams: Record<string, unknown> = {
        customer: customerId,
        client_reference_id: user.id,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: successUrl || `${safeOrigin(req)}/pricing?success=true`,
        cancel_url: cancelUrl || `${safeOrigin(req)}/pricing?canceled=true`,
        metadata: {
          user_id: user.id,
          plan_id: plan,
          period,
        },
      };

      // 7-day free trial for starter monthly only
      if (plan === 'starter' && period === 'monthly') {
        sessionParams.subscription_data = {
          trial_period_days: 7,
        };
      }

      const session = await stripe.checkout.sessions.create(sessionParams as any);

      logStep('Checkout session created', { sessionId: session.id });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Webhook handler for Stripe events
    if (req.method === 'POST' && url.pathname.endsWith('/webhook')) {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
        apiVersion: '2024-11-20',
      });

      const signature = req.headers.get('stripe-signature') || '';
      const body = await req.text();

      const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

      let event;
      try {
        event = await stripe.webhooks.constructEventAsync(
          body,
          signature,
          webhookSecret
        );
      } catch (err) {
        return new Response(JSON.stringify({ error: 'Webhook signature verification failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Handle checkout completed
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as any;
        const userId = session.metadata?.user_id || session.client_reference_id;
        const planId = session.metadata?.plan_id;

        if (userId && planId) {
          try {
            await supabaseClient
              .from('user_roles')
              .upsert({
                user_id: userId,
                role: planId,
              });
          } catch (e) {
            logStep('Error upserting user role', { error: String(e) });
          }
        }
      }

      // Handle subscription updated/deleted
      if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as any;
        const customerId = subscription.customer;

        const customer = await stripe.customers.retrieve(customerId);
        const userId = (customer as any).metadata?.user_id;

        if (userId) {
          if (event.type === 'customer.subscription.deleted' || subscription.status !== 'active') {
            try {
              await supabaseClient
                .from('user_roles')
                .upsert({
                  user_id: userId,
                  role: 'free',
                });
            } catch (e) {
              logStep('Error resetting user role', { error: String(e) });
            }
          }
        }
      }

      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Customer portal
    if (url.pathname.endsWith('/portal')) {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
        apiVersion: '2024-11-20',
      });

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

    throw new Error('Not found');
  } catch (error) {
    const errorMessage = (error as Error).message;
    logStep('ERROR', { message: errorMessage });
    try {
      await sendErrorAlert('manage-payments', error, { url: req.url });
    } catch (_) { /* ignore alert failures */ }
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
