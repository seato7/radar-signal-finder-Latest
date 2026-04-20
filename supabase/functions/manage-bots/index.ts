// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { sendErrorAlert } from '../_shared/error-alerter.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Trading Strategies
interface Strategy {
  evaluate(ticker: string, prices: any[], currentPosition: number, params: any): Order[];
}

interface Order {
  ticker: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  reason: string;
}

class GridStrategy implements Strategy {
  evaluate(ticker: string, prices: any[], currentPosition: number, params: any): Order[] {
    if (prices.length < 2) return [];
    
    const { lower = 0, upper = 0, grid_count = 10, base_qty = 1.0 } = params;
    const currentPrice = prices[prices.length - 1].close;
    const orders: Order[] = [];
    const gridStep = (upper - lower) / grid_count;
    
    for (let i = 0; i < grid_count; i++) {
      const levelPrice = lower + (i * gridStep);
      
      if (currentPosition <= 0 && Math.abs(currentPrice - levelPrice) < gridStep * 0.5) {
        if (currentPrice <= levelPrice) {
          orders.push({
            ticker,
            side: 'buy',
            qty: base_qty,
            price: currentPrice,
            reason: `Grid buy at ${levelPrice.toFixed(2)}`
          });
        }
      } else if (currentPosition > 0 && Math.abs(currentPrice - levelPrice) < gridStep * 0.5) {
        if (currentPrice >= levelPrice && i > grid_count / 2) {
          orders.push({
            ticker,
            side: 'sell',
            qty: Math.min(base_qty, currentPosition),
            price: currentPrice,
            reason: `Grid sell at ${levelPrice.toFixed(2)}`
          });
        }
      }
    }
    
    return orders;
  }
}

class MomentumStrategy implements Strategy {
  evaluate(ticker: string, prices: any[], currentPosition: number, params: any): Order[] {
    const { lookback = 20, z_entry = 2.0, z_exit = 0.5, base_qty = 1.0 } = params;
    
    if (prices.length < lookback + 1) return [];
    
    const recentPrices = prices.slice(-lookback).map(p => p.close);
    const currentPrice = prices[prices.length - 1].close;
    
    const mean = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const variance = recentPrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recentPrices.length;
    const stdev = Math.sqrt(variance) || 0.01;
    const zScore = (currentPrice - mean) / stdev;
    
    const orders: Order[] = [];
    
    if (currentPosition === 0 && zScore > z_entry) {
      orders.push({
        ticker,
        side: 'buy',
        qty: base_qty,
        price: currentPrice,
        reason: `Momentum entry z=${zScore.toFixed(2)}`
      });
    } else if (currentPosition > 0 && zScore < z_exit) {
      orders.push({
        ticker,
        side: 'sell',
        qty: currentPosition,
        price: currentPrice,
        reason: `Momentum exit z=${zScore.toFixed(2)}`
      });
    }
    
    return orders;
  }
}

class MeanReversionStrategy implements Strategy {
  evaluate(ticker: string, prices: any[], currentPosition: number, params: any): Order[] {
    const { lookback = 20, z_entry = -2.0, z_exit = 0.0, base_qty = 1.0 } = params;
    
    if (prices.length < lookback + 1) return [];
    
    const recentPrices = prices.slice(-lookback).map(p => p.close);
    const currentPrice = prices[prices.length - 1].close;
    
    const mean = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
    const variance = recentPrices.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / recentPrices.length;
    const stdev = Math.sqrt(variance) || 0.01;
    const zScore = (currentPrice - mean) / stdev;
    
    const orders: Order[] = [];
    
    if (currentPosition === 0 && zScore < z_entry) {
      orders.push({
        ticker,
        side: 'buy',
        qty: base_qty,
        price: currentPrice,
        reason: `Mean reversion entry z=${zScore.toFixed(2)}`
      });
    } else if (currentPosition > 0 && zScore > z_exit) {
      orders.push({
        ticker,
        side: 'sell',
        qty: currentPosition,
        price: currentPrice,
        reason: `Mean reversion exit z=${zScore.toFixed(2)}`
      });
    }
    
    return orders;
  }
}

const STRATEGIES = {
  grid: GridStrategy,
  momentum: MomentumStrategy,
  meanrev: MeanReversionStrategy
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } }
  );

  try {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    );
    
    if (authError || !user) throw new Error('Unauthorized');

    const url = new URL(req.url);
    const path = url.pathname;

    // GET /strategies - List available strategies
    if (req.method === 'GET' && path.includes('/strategies')) {
      return new Response(JSON.stringify({
        strategies: {
          grid: {
            description: "Place buy/sell orders in a grid between price levels",
            params: {
              lower: { type: "number", description: "Lower price bound" },
              upper: { type: "number", description: "Upper price bound" },
              grid_count: { type: "integer", default: 10 },
              base_qty: { type: "number", default: 1.0 }
            }
          },
          momentum: {
            description: "Enter on strong momentum, exit on reversal",
            params: {
              lookback: { type: "integer", default: 20 },
              z_entry: { type: "number", default: 2.0 },
              z_exit: { type: "number", default: 0.5 },
              base_qty: { type: "number", default: 1.0 }
            }
          },
          meanrev: {
            description: "Buy oversold, sell when returns to mean",
            params: {
              lookback: { type: "integer", default: 20 },
              z_entry: { type: "number", default: -2.0 },
              z_exit: { type: "number", default: 0.0 },
              base_qty: { type: "number", default: 1.0 }
            }
          }
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /create - Create new bot
    if (req.method === 'POST' && path.includes('/create')) {
      const bot = await req.json();
      
      // Check user role limits
      const { data: roleData } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .single();
      
      const userPlan = roleData?.role || 'free';
      
      // TODO: Check plan limits (free = 1 bot, lite = 3, pro = 10)
      
      bot.user_id = user.id;
      bot.status = 'stopped';
      bot.created_at = new Date().toISOString();
      bot.updated_at = new Date().toISOString();
      
      const { data, error } = await supabaseClient
        .from('bots')
        .insert(bot)
        .select()
        .single();
      
      if (error) throw error;
      
      return new Response(JSON.stringify({ bot_id: data.id, status: 'created' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // GET /:bot_id - Get bot details
    if (req.method === 'GET' && path.match(/\/[^/]+$/)) {
      const bot_id = path.split('/').pop();
      
      const { data: bot, error } = await supabaseClient
        .from('bots')
        .select('*')
        .eq('id', bot_id)
        .eq('user_id', user.id)
        .single();
      
      if (error) throw new Error('Bot not found');
      
      return new Response(JSON.stringify(bot), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /:bot_id/start - Start bot
    if (req.method === 'POST' && path.includes('/start')) {
      const segments = path.split('/').filter(Boolean);
      const bot_id = segments[segments.indexOf('start') - 1] || segments[segments.length - 2];
      
      await supabaseClient
        .from('bots')
        .update({ status: 'running', updated_at: new Date().toISOString() })
        .eq('id', bot_id)
        .eq('user_id', user.id);
      
      return new Response(JSON.stringify({ status: 'running' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /:bot_id/stop - Stop bot
    if (req.method === 'POST' && path.includes('/stop')) {
      const segments = path.split('/').filter(Boolean);
      const bot_id = segments[segments.indexOf('stop') - 1] || segments[segments.length - 2];
      
      await supabaseClient
        .from('bots')
        .update({ status: 'stopped', updated_at: new Date().toISOString() })
        .eq('id', bot_id)
        .eq('user_id', user.id);
      
      return new Response(JSON.stringify({ status: 'stopped' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // POST /:bot_id/simulate - Simulate bot
    if (req.method === 'POST' && path.includes('/simulate')) {
      const segments = path.split('/').filter(Boolean);
      const bot_id = segments[segments.indexOf('simulate') - 1] || segments[segments.length - 2];
      const { since_days = 30 } = await req.json();
      
      const { data: bot } = await supabaseClient
        .from('bots')
        .select('*')
        .eq('id', bot_id)
        .eq('user_id', user.id)
        .single();
      
      if (!bot) throw new Error('Bot not found');
      
      // Get strategy
      const StrategyClass = STRATEGIES[bot.strategy as keyof typeof STRATEGIES];
      if (!StrategyClass) throw new Error('Invalid strategy');
      
      const strategy = new StrategyClass();
      let totalPnl = 0;
      let maxDrawdown = 0;
      let peakValue = 0;
      const allTrades: any[] = [];
      
      // Simulate for each ticker
      for (const ticker of bot.tickers || []) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - since_days);
        
        const { data: prices } = await supabaseClient
          .from('prices')
          .select('*')
          .eq('ticker', ticker)
          .gte('date', cutoffDate.toISOString().split('T')[0])
          .order('date', { ascending: true });
        
        if (!prices || prices.length < 2) continue;
        
        let currentPosition = 0;
        let positionValue = 0;
        
        for (let i = 0; i < prices.length; i++) {
          const windowPrices = prices.slice(0, i + 1);
          const currentPrice = prices[i].close;
          
          const orders = strategy.evaluate(ticker, windowPrices, currentPosition, bot.params || {});
          
          for (const order of orders) {
            const slippage = 0.001 * order.price; // 10 bps slippage
            let fillPrice = order.price;
            
            if (order.side === 'buy') {
              fillPrice += slippage;
              currentPosition += order.qty;
              positionValue += order.qty * fillPrice;
            } else {
              fillPrice -= slippage;
              const realized = (fillPrice - (positionValue / currentPosition)) * order.qty;
              totalPnl += realized;
              currentPosition -= order.qty;
              positionValue = currentPosition > 0 ? currentPosition * (positionValue / (currentPosition + order.qty)) : 0;
            }
            
            allTrades.push({
              ticker: order.ticker,
              side: order.side,
              qty: order.qty,
              price: fillPrice,
              reason: order.reason,
              date: prices[i].date
            });
          }
          
          const unrealized = currentPosition > 0 ? (currentPrice * currentPosition) - positionValue : 0;
          const currentValue = positionValue + unrealized + totalPnl;
          peakValue = Math.max(peakValue, currentValue);
          
          if (peakValue > 0) {
            const drawdown = ((peakValue - currentValue) / peakValue) * 100;
            maxDrawdown = Math.max(maxDrawdown, drawdown);
          }
        }
      }
      
      const completedTrades = allTrades.filter((t, i) => i > 0 && t.side === 'sell' && allTrades[i-1].side === 'buy');
      const winningTrades = allTrades.filter((t, i) => i > 0 && t.side === 'sell' && allTrades[i-1].side === 'buy' && t.price > allTrades[i-1].price);
      const winRate = completedTrades.length > 0 ? (winningTrades.length / completedTrades.length) * 100 : 0;
      
      return new Response(JSON.stringify({
        trades: allTrades,
        pnl: totalPnl,
        max_drawdown: maxDrawdown,
        win_rate: winRate,
        total_trades: allTrades.length
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    throw new Error('Not found');
  } catch (error) {
    await sendErrorAlert('manage-bots', error, { url: req.url });
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
