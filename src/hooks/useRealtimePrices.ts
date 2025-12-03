import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface Price {
  id: string;
  ticker: string;
  close: number;
  date: string;
  updated_at: string;
}

interface PriceMap {
  [ticker: string]: Price;
}

export function useRealtimePrices(tickers?: string[]) {
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial prices
  const fetchPrices = useCallback(async () => {
    try {
      let query = supabase
        .from('prices')
        .select('id, ticker, close, date, updated_at')
        .order('updated_at', { ascending: false });

      if (tickers && tickers.length > 0) {
        query = query.in('ticker', tickers);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const priceMap: PriceMap = {};
      (data as Price[] | null)?.forEach((p) => {
        // Only keep the latest price per ticker
        if (!priceMap[p.ticker] || new Date(p.updated_at) > new Date(priceMap[p.ticker].updated_at)) {
          priceMap[p.ticker] = p;
        }
      });

      setPrices(priceMap);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
    } finally {
      setLoading(false);
    }
  }, [tickers]);

  useEffect(() => {
    fetchPrices();

    // Subscribe to real-time updates
    const channel = supabase
      .channel('prices-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prices',
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const newPrice = payload.new as Price;
            
            // Filter if specific tickers requested
            if (tickers && tickers.length > 0 && !tickers.includes(newPrice.ticker)) {
              return;
            }

            setPrices((prev) => ({
              ...prev,
              [newPrice.ticker]: newPrice,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPrices, tickers]);

  const getPrice = useCallback((ticker: string) => prices[ticker], [prices]);
  
  const getPriceValue = useCallback((ticker: string) => prices[ticker]?.close ?? null, [prices]);

  return {
    prices,
    loading,
    error,
    getPrice,
    getPriceValue,
    refetch: fetchPrices,
  };
}

// Singleton for app-wide price access
let globalPrices: PriceMap = {};
let globalSubscription: ReturnType<typeof supabase.channel> | null = null;

export function initGlobalPriceSubscription() {
  if (globalSubscription) return;

  // Fetch all prices initially
  supabase
    .from('prices')
    .select('id, ticker, close, date, updated_at')
    .then(({ data }) => {
      if (data) {
        (data as Price[]).forEach((p) => {
          if (!globalPrices[p.ticker] || new Date(p.updated_at) > new Date(globalPrices[p.ticker].updated_at)) {
            globalPrices[p.ticker] = p;
          }
        });
      }
    });

  globalSubscription = supabase
    .channel('global-prices')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'prices',
      },
      (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const newPrice = payload.new as Price;
          globalPrices[newPrice.ticker] = newPrice;
        }
      }
    )
    .subscribe();
}

export function getGlobalPrice(ticker: string): Price | undefined {
  return globalPrices[ticker];
}

export function getGlobalPriceValue(ticker: string): number | null {
  return globalPrices[ticker]?.close ?? null;
}
