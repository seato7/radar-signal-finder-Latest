// Real-time price lookup via TwelveData /price. Use this anywhere a function
// needs a current market price for a decision. DO NOT use Tavily for prices —
// Tavily extracts numbers from article text and produced catastrophic false
// exits when it matched numbers from unrelated context.

export async function getTwelveDataPrice(
  ticker: string
): Promise<number | null> {
  const apiKey = Deno.env.get('TWELVEDATA_API_KEY');
  if (!apiKey) return null;

  try {
    // Normalize ticker for TwelveData format (BTC-USD → BTC/USD)
    const symbol = ticker.replace('-', '/');

    const response = await fetch(
      `https://api.twelvedata.com/price?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) return null;
    const data = await response.json();

    if (data.status === 'error' || !data.price) return null;

    const price = parseFloat(data.price);
    return isNaN(price) || price <= 0 ? null : price;
  } catch {
    return null;
  }
}
