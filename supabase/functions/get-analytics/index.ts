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

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
  );

  try {
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) throw new Error('Unauthorized');

    // Get all bot orders and positions for the user
    const { data: bots } = await supabaseClient
      .from('bots')
      .select('id, name, strategy')
      .eq('user_id', user.id);

    if (!bots || bots.length === 0) {
      return new Response(JSON.stringify({
        total_pnl: 0,
        win_rate: 0,
        total_trades: 0,
        max_drawdown: 0,
        bot_performance: [],
        sharpe_ratio: 0,
        volatility: 0,
        profit_factor: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const botIds = bots.map(b => b.id);

    // Get all orders for these bots
    const { data: orders } = await supabaseClient
      .from('bot_orders')
      .select('*')
      .in('bot_id', botIds);

    // Get all positions for these bots
    const { data: positions } = await supabaseClient
      .from('bot_positions')
      .select('*')
      .in('bot_id', botIds);

    // Calculate analytics
    let totalPnl = 0;
    let totalTrades = orders?.length || 0;
    let winningTrades = 0;
    const botPerformance: any[] = [];

    // Per-bot analytics
    for (const bot of bots) {
      const botOrders = orders?.filter(o => o.bot_id === bot.id) || [];
      const botPositions = positions?.filter(p => p.bot_id === bot.id) || [];
      
      let botPnl = 0;
      let botWins = 0;

      // Calculate PnL from positions
      for (const pos of botPositions) {
        botPnl += (pos.realized_pnl || 0) + (pos.unrealized_pnl || 0);
      }

      // Simple win calculation: compare buy and sell prices
      const buyOrders = botOrders.filter(o => o.side === 'buy');
      const sellOrders = botOrders.filter(o => o.side === 'sell');
      
      for (const sell of sellOrders) {
        const matchingBuy = buyOrders.find(b => b.ticker === sell.ticker);
        if (matchingBuy && sell.price > matchingBuy.price) {
          botWins++;
        }
      }

      totalPnl += botPnl;
      winningTrades += botWins;

      botPerformance.push({
        bot_id: bot.id,
        name: bot.name,
        strategy: bot.strategy,
        trades: botOrders.length,
        pnl: botPnl,
        win_rate: botOrders.length > 0 ? (botWins / botOrders.length) * 100 : 0
      });
    }

    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    
    // Calculate max drawdown (simplified)
    let peak = 0;
    let maxDrawdown = 0;
    let runningPnl = 0;
    
    if (orders) {
      const sortedOrders = orders.sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      
      for (const order of sortedOrders) {
        // Simplified PnL calculation
        if (order.side === 'sell') {
          runningPnl += order.price * order.qty;
        } else {
          runningPnl -= order.price * order.qty;
        }
        
        if (runningPnl > peak) {
          peak = runningPnl;
        }
        
        const drawdown = ((peak - runningPnl) / Math.max(peak, 1)) * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
        }
      }
    }

    // Calculate Sharpe ratio (simplified - assumes risk-free rate of 0)
    const returns = botPerformance.map(b => b.pnl);
    const avgReturn = returns.reduce((a, b) => a + b, 0) / Math.max(returns.length, 1);
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / Math.max(returns.length, 1);
    const stdDev = Math.sqrt(variance);
    const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

    // Calculate profit factor
    const profits = returns.filter(r => r > 0).reduce((a, b) => a + b, 0);
    const losses = Math.abs(returns.filter(r => r < 0).reduce((a, b) => a + b, 0));
    const profitFactor = losses > 0 ? profits / losses : profits > 0 ? 999 : 0;

    return new Response(JSON.stringify({
      total_pnl: totalPnl,
      win_rate: winRate,
      total_trades: totalTrades,
      max_drawdown: maxDrawdown,
      bot_performance: botPerformance,
      sharpe_ratio: sharpeRatio,
      volatility: stdDev,
      profit_factor: profitFactor
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
