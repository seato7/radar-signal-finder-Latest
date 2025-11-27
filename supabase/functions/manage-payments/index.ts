import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { sendErrorAlert } from '../_shared/error-alerter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLANS = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'AUD',
    features: {
      max_bots: 1,
      max_alerts: 10,
      backtest_days: 30,
      live_trading: false,
      exports: false,
      analytics: false
    }
  },
  {
    id: 'lite',
    name: 'Lite',
    price: 19,
    currency: 'AUD',
    stripe_price_id: 'price_lite_monthly',
    features: {
      max_bots: 3,
      max_alerts: 50,
      backtest_days: 90,
      live_trading: false,
      exports: true,
      analytics: false
    }
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 49,
    currency: 'AUD',
    stripe_price_id: 'price_pro_monthly',
    features: {
      max_bots: 10,
      max_alerts: 200,
      backtest_days: 365,
      live_trading: true,
      exports: true,
      analytics: true
    }
  }
];

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
        status: 'active'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create checkout session
    if (req.method === 'POST' && url.pathname.endsWith('/checkout')) {
      const { plan_id } = await req.json();
      const plan = PLANS.find(p => p.id === plan_id);
      
      if (!plan || !plan.stripe_price_id) {
        throw new Error('Invalid plan');
      }

      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
        apiVersion: '2025-08-27.basil',
      });

      const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
      let customerId = customers.data[0]?.id;

      if (!customerId) {
        const customer = await stripe.customers.create({ 
          email: user.email!,
          metadata: { user_id: user.id }
        });
        customerId = customer.id;
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        client_reference_id: user.id,
        line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
        mode: 'subscription',
        success_url: `${req.headers.get('origin')}/settings?success=true`,
        cancel_url: `${req.headers.get('origin')}/pricing`,
        metadata: {
          user_id: user.id,
          plan_id: plan.id
        }
      });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Webhook handler for Stripe events
    if (req.method === 'POST' && url.pathname.endsWith('/webhook')) {
      const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
        apiVersion: '2025-08-27.basil',
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
          await supabaseClient
            .from('user_roles')
            .upsert({
              user_id: userId,
              role: planId
            });
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
            await supabaseClient
              .from('user_roles')
              .upsert({
                user_id: userId,
                role: 'free'
              });
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
        apiVersion: '2025-08-27.basil',
      });

      const customers = await stripe.customers.list({ email: user.email!, limit: 1 });
      if (!customers.data[0]) throw new Error('No subscription found');

      const session = await stripe.billingPortal.sessions.create({
        customer: customers.data[0].id,
        return_url: `${req.headers.get('origin')}/settings`,
      });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Not found');
  } catch (error) {
    await sendErrorAlert('manage-payments', error, { url: req.url });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
