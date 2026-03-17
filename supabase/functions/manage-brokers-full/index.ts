// redeployed 2026-03-17
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Secure encryption utilities using Web Crypto API
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(plaintext: string, masterKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(masterKey, salt);
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(plaintext)
  );
  
  // Combine salt + iv + encrypted data
  const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(encrypted), salt.length + iv.length);
  
  // Return as base64 for database storage
  // FIX: Chunked btoa to prevent stack overflow on large buffers
  let binaryStr = '';
  const chunkSize = 8192;
  for (let i = 0; i < combined.length; i += chunkSize) {
    binaryStr += String.fromCharCode(...combined.subarray(i, i + chunkSize));
  }
  return btoa(binaryStr);
}

async function decryptData(encryptedData: string, masterKey: string): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const encrypted = combined.slice(28);
  
  const key = await deriveKey(masterKey, salt);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    encrypted
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Alpaca Broker Adapter
class AlpacaBroker {
  constructor(private apiKey: string, private secretKey: string, private paperMode: boolean) {}
  
  get baseUrl() {
    return this.paperMode ? "https://paper-api.alpaca.markets" : "https://api.alpaca.markets";
  }
  
  get headers() {
    return {
      "APCA-API-KEY-ID": this.apiKey,
      "APCA-API-SECRET-KEY": this.secretKey,
      "Content-Type": "application/json"
    };
  }
  
  async getAccount() {
    const response = await fetch(`${this.baseUrl}/v2/account`, {
      headers: this.headers,
      method: 'GET'
    });
    return response.json();
  }
  
  async placeOrder(ticker: string, side: string, qty: number) {
    const response = await fetch(`${this.baseUrl}/v2/orders`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        symbol: ticker,
        qty: qty.toString(),
        side,
        type: "market",
        time_in_force: "day"
      })
    });
    return response.json();
  }
  
  async getPositions() {
    const response = await fetch(`${this.baseUrl}/v2/positions`, {
      headers: this.headers
    });
    return response.json();
  }
}

// Binance Broker Adapter
class BinanceBroker {
  constructor(private apiKey: string, private secretKey: string, private paperMode: boolean) {}
  
  get baseUrl() {
    return this.paperMode ? "https://testnet.binance.vision/api" : "https://api.binance.com/api";
  }
  
  private async sign(params: Record<string, any>) {
    const queryString = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    const encoder = new TextEncoder();
    const data = encoder.encode(queryString);
    const keyData = encoder.encode(this.secretKey);
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, data);
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  async getAccount() {
    const timestamp = Date.now();
    const params = { timestamp };
    const signature = await this.sign(params);
    
    const url = `${this.baseUrl}/v3/account?timestamp=${timestamp}&signature=${signature}`;
    const response = await fetch(url, {
      headers: { "X-MBX-APIKEY": this.apiKey }
    });
    return response.json();
  }
  
  async placeOrder(ticker: string, side: string, qty: number) {
    const timestamp = Date.now();
    const symbol = ticker.replace("-", "").replace("/", "");
    const params = { symbol, side: side.toUpperCase(), type: "MARKET", quantity: qty, timestamp };
    const signature = await this.sign(params);
    
    const queryString = Object.entries(params).map(([k, v]) => `${k}=${v}`).join('&');
    const response = await fetch(`${this.baseUrl}/v3/order?${queryString}&signature=${signature}`, {
      method: 'POST',
      headers: { "X-MBX-APIKEY": this.apiKey }
    });
    return response.json();
  }
}

// Coinbase Broker Adapter  
class CoinbaseBroker {
  constructor(private apiKey: string, private secretKey: string) {}
  
  get baseUrl() {
    return "https://api.coinbase.com/api/v3/brokerage";
  }
  
  async getAccount() {
    const response = await fetch(`${this.baseUrl}/accounts`, {
      headers: { "Authorization": `Bearer ${this.apiKey}` }
    });
    return response.json();
  }
  
  async placeOrder(ticker: string, side: string, qty: number) {
    const productId = ticker.includes("-") ? ticker : `${ticker}-USD`;
    const response = await fetch(`${this.baseUrl}/orders`, {
      method: 'POST',
      headers: {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product_id: productId,
        side: side.toUpperCase(),
        order_configuration: {
          market_market_ioc: { base_size: qty.toString() }
        }
      })
    });
    return response.json();
  }
}

// Kraken Broker Adapter
class KrakenBroker {
  constructor(private apiKey: string, private secretKey: string) {}
  
  get baseUrl() {
    return "https://api.kraken.com";
  }
  
  private async sign(endpoint: string, data: Record<string, any>) {
    const postdata = Object.entries(data).map(([k, v]) => `${k}=${v}`).join('&');
    const encoded = new TextEncoder().encode(`${data.nonce}${postdata}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const message = new Uint8Array([...new TextEncoder().encode(endpoint), ...new Uint8Array(hashBuffer)]);
    
    const decoder = new TextDecoder();
    const secretDecoded = atob(this.secretKey);
    const keyData = new Uint8Array(Array.from(secretDecoded).map(c => c.charCodeAt(0)));
    const cryptoKey = await crypto.subtle.importKey(
      "raw", keyData, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", cryptoKey, message);
    // FIX: Chunked btoa to prevent stack overflow
    const sigArray = new Uint8Array(signature);
    let sigBinaryStr = '';
    for (let i = 0; i < sigArray.length; i += 8192) {
      sigBinaryStr += String.fromCharCode(...sigArray.subarray(i, i + 8192));
    }
    return btoa(sigBinaryStr);
  }
  
  async getAccount() {
    const endpoint = "/0/private/Balance";
    const nonce = Date.now() * 1000;
    const data = { nonce };
    const signature = await this.sign(endpoint, data);
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        "API-Key": this.apiKey,
        "API-Sign": signature
      },
      body: new URLSearchParams(data as any)
    });
    return response.json();
  }
}

// IBKR Broker Adapter
class IBKRBroker {
  constructor(private apiKey: string, private sessionToken: string) {}
  
  get baseUrl() {
    return "https://api.ibkr.com/v1/api";
  }
  
  async getAccount() {
    const response = await fetch(`${this.baseUrl}/portfolio/accounts`);
    return response.json();
  }
  
  async placeOrder(ticker: string, side: string, qty: number) {
    const response = await fetch(`${this.baseUrl}/iserver/account/orders`, {
      method: 'POST',
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conid: ticker,
        orderType: "MKT",
        side: side === "buy" ? "BUY" : "SELL",
        quantity: qty
      })
    });
    return response.json();
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const url = new URL(req.url);
    const path = url.pathname;

    // GET / - List supported brokers (no auth required)
    if (req.method === 'GET' && !path.includes('/list')) {
      return new Response(JSON.stringify({
        brokers: [
          // FOREX BROKERS
          { id: "oanda", name: "Oanda", description: "Leading forex broker with competitive spreads", supports_paper: true, assets: ["forex", "commodity"], regions: ["global"], url: "https://www.oanda.com/" },
          { id: "forex_com", name: "Forex.com", description: "Major US-based forex broker", supports_paper: true, assets: ["forex", "commodity", "crypto"], regions: ["us", "global"], url: "https://www.forex.com/" },
          { id: "ig", name: "IG Markets", description: "UK-based multi-asset broker", supports_paper: true, assets: ["forex", "stocks", "commodity", "crypto"], regions: ["uk", "eu", "global"], url: "https://www.ig.com/" },
          { id: "pepperstone", name: "Pepperstone", description: "Australian forex and CFD broker", supports_paper: false, assets: ["forex", "commodity", "stocks"], regions: ["au", "global"], url: "https://www.pepperstone.com/" },
          { id: "fxcm", name: "FXCM", description: "Global forex broker", supports_paper: true, assets: ["forex", "commodity"], regions: ["global"], url: "https://www.fxcm.com/" },
          
          // CRYPTO BROKERS
          { id: "binance", name: "Binance", description: "World's largest crypto exchange", supports_paper: false, assets: ["crypto"], regions: ["global"], url: "https://www.binance.com/" },
          { id: "coinbase", name: "Coinbase", description: "US-regulated crypto exchange", supports_paper: false, assets: ["crypto"], regions: ["us", "global"], url: "https://www.coinbase.com/" },
          { id: "kraken", name: "Kraken", description: "Secure crypto exchange", supports_paper: false, assets: ["crypto"], regions: ["us", "eu", "global"], url: "https://www.kraken.com/" },
          { id: "gemini", name: "Gemini", description: "Regulated US crypto exchange", supports_paper: false, assets: ["crypto"], regions: ["us"], url: "https://www.gemini.com/" },
          { id: "kucoin", name: "KuCoin", description: "Global crypto exchange with wide selection", supports_paper: false, assets: ["crypto"], regions: ["global"], url: "https://www.kucoin.com/" },
          { id: "bybit", name: "Bybit", description: "Crypto derivatives exchange", supports_paper: true, assets: ["crypto"], regions: ["global"], url: "https://www.bybit.com/" },
          
          // STOCK BROKERS
          { id: "alpaca", name: "Alpaca Markets", description: "Commission-free US stocks and crypto trading", supports_paper: true, assets: ["stocks", "crypto"], regions: ["us", "global"], url: "https://alpaca.markets/" },
          { id: "ibkr", name: "Interactive Brokers", description: "Professional multi-asset trading platform", supports_paper: true, assets: ["stocks", "options", "futures", "forex", "bonds", "crypto", "commodity"], regions: ["global"], url: "https://www.interactivebrokers.com/" },
          { id: "tastytrade", name: "tastytrade", description: "Options-focused broker", supports_paper: true, assets: ["stocks", "options"], regions: ["us"], url: "https://tastytrade.com/" },
          { id: "tradier", name: "Tradier", description: "API-focused brokerage platform", supports_paper: true, assets: ["stocks", "options"], regions: ["us"], url: "https://tradier.com/" },
          { id: "etrade", name: "E*TRADE", description: "Major US retail broker", supports_paper: true, assets: ["stocks", "options", "etfs"], regions: ["us"], url: "https://us.etrade.com/" },
          { id: "schwab", name: "Charles Schwab", description: "Full-service US broker", supports_paper: false, assets: ["stocks", "options", "etfs", "futures"], regions: ["us"], url: "https://www.schwab.com/" },
          
          // COMMODITY BROKERS
          { id: "amp_futures", name: "AMP Futures", description: "Futures and commodities trading", supports_paper: true, assets: ["futures", "commodity"], regions: ["us"], url: "https://ampfutures.com/" }
        ]
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // All other routes require authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    );
    
    if (authError || !user) throw new Error('Unauthorized');


    // GET /supported - List brokers (kept for backwards compatibility — delegates to main GET handler)
    if (req.method === 'GET' && path.includes('/supported')) {
      // FIX: Duplicate broker list removed — forward to the same list defined in the GET / handler above
      // This prevents the two lists from diverging when brokers are added/removed
      const forwardReq = new Request(req.url.replace('/supported', ''), { method: 'GET', headers: req.headers });
      return new Response(JSON.stringify({ message: 'Use GET / for broker list' }), {
        status: 301,
        headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Location': req.url.replace('/supported', '') }
      });
    }


    // POST /connect - Connect broker
    if (req.method === 'POST' && path.includes('/connect')) {
      const { exchange, api_key, secret_key, paper_mode = true } = await req.json();
      
      // Test connection
      let broker: any;
      let testResult: any;
      
      try {
        switch (exchange) {
          case 'alpaca':
            broker = new AlpacaBroker(api_key, secret_key, paper_mode);
            testResult = await broker.getAccount();
            break;
          case 'binance':
            broker = new BinanceBroker(api_key, secret_key, paper_mode);
            testResult = await broker.getAccount();
            break;
          case 'coinbase':
            broker = new CoinbaseBroker(api_key, secret_key);
            testResult = await broker.getAccount();
            break;
          case 'kraken':
            broker = new KrakenBroker(api_key, secret_key);
            testResult = await broker.getAccount();
            break;
          case 'ibkr':
            broker = new IBKRBroker(api_key, secret_key);
            testResult = await broker.getAccount();
            break;
          default:
            throw new Error('Unsupported broker');
        }
        
        if (testResult.error || testResult.code) {
          throw new Error('Invalid credentials');
        }
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Could not validate credentials' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // Get encryption key from environment
      const encryptionKey = Deno.env.get('BROKER_ENCRYPTION_KEY');
      if (!encryptionKey) {
        throw new Error('Server configuration error: encryption key not set');
      }

      // Encrypt credentials using AES-GCM
      const encryptedApiKey = await encryptData(api_key, encryptionKey);
      const encryptedSecret = await encryptData(secret_key, encryptionKey);

      // Store encrypted credentials
      const { data: existing } = await supabaseClient
        .from('broker_keys')
        .select('*')
        .eq('user_id', user.id)
        .eq('exchange', exchange)
        .single();
      
      if (existing) {
        await supabaseClient
          .from('broker_keys')
          .update({
            api_key_encrypted: encryptedApiKey,
            secret_key_encrypted: encryptedSecret,
            paper_mode,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        await supabaseClient
          .from('broker_keys')
          .insert({
            user_id: user.id,
            exchange,
            api_key_encrypted: encryptedApiKey,
            secret_key_encrypted: encryptedSecret,
            paper_mode
          });
      }
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // GET /list - List user's brokers
    if (req.method === 'GET' && path.includes('/list')) {
      const { data: keys } = await supabaseClient
        .from('broker_keys')
        .select('id, exchange, paper_mode, created_at')
        .eq('user_id', user.id);
      
      return new Response(JSON.stringify({ brokers: keys || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error('Not found');
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
