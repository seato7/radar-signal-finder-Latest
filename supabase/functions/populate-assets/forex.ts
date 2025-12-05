// Forex pairs supported by Twelve Data - Major and Minor crosses only
export const FOREX_PAIRS = [
  // Major pairs (USD-based)
  { ticker: 'EUR/USD', name: 'Euro / US Dollar', exchange: 'FOREX' },
  { ticker: 'GBP/USD', name: 'British Pound / US Dollar', exchange: 'FOREX' },
  { ticker: 'USD/JPY', name: 'US Dollar / Japanese Yen', exchange: 'FOREX' },
  { ticker: 'USD/CHF', name: 'US Dollar / Swiss Franc', exchange: 'FOREX' },
  { ticker: 'USD/CAD', name: 'US Dollar / Canadian Dollar', exchange: 'FOREX' },
  { ticker: 'AUD/USD', name: 'Australian Dollar / US Dollar', exchange: 'FOREX' },
  { ticker: 'NZD/USD', name: 'New Zealand Dollar / US Dollar', exchange: 'FOREX' },
  
  // Cross pairs (EUR-based)
  { ticker: 'EUR/GBP', name: 'Euro / British Pound', exchange: 'FOREX' },
  { ticker: 'EUR/JPY', name: 'Euro / Japanese Yen', exchange: 'FOREX' },
  { ticker: 'EUR/CHF', name: 'Euro / Swiss Franc', exchange: 'FOREX' },
  { ticker: 'EUR/AUD', name: 'Euro / Australian Dollar', exchange: 'FOREX' },
  { ticker: 'EUR/CAD', name: 'Euro / Canadian Dollar', exchange: 'FOREX' },
  { ticker: 'EUR/NZD', name: 'Euro / New Zealand Dollar', exchange: 'FOREX' },
  { ticker: 'EUR/SEK', name: 'Euro / Swedish Krona', exchange: 'FOREX' },
  { ticker: 'EUR/NOK', name: 'Euro / Norwegian Krone', exchange: 'FOREX' },
  { ticker: 'EUR/DKK', name: 'Euro / Danish Krone', exchange: 'FOREX' },
  { ticker: 'EUR/PLN', name: 'Euro / Polish Zloty', exchange: 'FOREX' },
  { ticker: 'EUR/HUF', name: 'Euro / Hungarian Forint', exchange: 'FOREX' },
  { ticker: 'EUR/CZK', name: 'Euro / Czech Koruna', exchange: 'FOREX' },
  { ticker: 'EUR/TRY', name: 'Euro / Turkish Lira', exchange: 'FOREX' },
  { ticker: 'EUR/ZAR', name: 'Euro / South African Rand', exchange: 'FOREX' },
  
  // Cross pairs (GBP-based)
  { ticker: 'GBP/CHF', name: 'British Pound / Swiss Franc', exchange: 'FOREX' },
  { ticker: 'GBP/JPY', name: 'British Pound / Japanese Yen', exchange: 'FOREX' },
  { ticker: 'GBP/AUD', name: 'British Pound / Australian Dollar', exchange: 'FOREX' },
  { ticker: 'GBP/CAD', name: 'British Pound / Canadian Dollar', exchange: 'FOREX' },
  { ticker: 'GBP/NZD', name: 'British Pound / New Zealand Dollar', exchange: 'FOREX' },
  { ticker: 'GBP/SEK', name: 'British Pound / Swedish Krona', exchange: 'FOREX' },
  { ticker: 'GBP/NOK', name: 'British Pound / Norwegian Krone', exchange: 'FOREX' },
  { ticker: 'GBP/DKK', name: 'British Pound / Danish Krone', exchange: 'FOREX' },
  { ticker: 'GBP/PLN', name: 'British Pound / Polish Zloty', exchange: 'FOREX' },
  { ticker: 'GBP/ZAR', name: 'British Pound / South African Rand', exchange: 'FOREX' },
  
  // Cross pairs (JPY-based)
  { ticker: 'AUD/JPY', name: 'Australian Dollar / Japanese Yen', exchange: 'FOREX' },
  { ticker: 'NZD/JPY', name: 'New Zealand Dollar / Japanese Yen', exchange: 'FOREX' },
  { ticker: 'CAD/JPY', name: 'Canadian Dollar / Japanese Yen', exchange: 'FOREX' },
  { ticker: 'CHF/JPY', name: 'Swiss Franc / Japanese Yen', exchange: 'FOREX' },
  { ticker: 'SGD/JPY', name: 'Singapore Dollar / Japanese Yen', exchange: 'FOREX' },
  { ticker: 'HKD/JPY', name: 'Hong Kong Dollar / Japanese Yen', exchange: 'FOREX' },
  
  // Cross pairs (AUD-based)
  { ticker: 'AUD/CAD', name: 'Australian Dollar / Canadian Dollar', exchange: 'FOREX' },
  { ticker: 'AUD/CHF', name: 'Australian Dollar / Swiss Franc', exchange: 'FOREX' },
  { ticker: 'AUD/NZD', name: 'Australian Dollar / New Zealand Dollar', exchange: 'FOREX' },
  { ticker: 'AUD/SGD', name: 'Australian Dollar / Singapore Dollar', exchange: 'FOREX' },
  
  // Cross pairs (CAD-based)
  { ticker: 'CAD/CHF', name: 'Canadian Dollar / Swiss Franc', exchange: 'FOREX' },
  { ticker: 'CAD/SGD', name: 'Canadian Dollar / Singapore Dollar', exchange: 'FOREX' },
  
  // Cross pairs (NZD-based)
  { ticker: 'NZD/CAD', name: 'New Zealand Dollar / Canadian Dollar', exchange: 'FOREX' },
  { ticker: 'NZD/CHF', name: 'New Zealand Dollar / Swiss Franc', exchange: 'FOREX' },
  { ticker: 'NZD/SGD', name: 'New Zealand Dollar / Singapore Dollar', exchange: 'FOREX' },
  
  // Cross pairs (CHF-based)
  { ticker: 'CHF/SGD', name: 'Swiss Franc / Singapore Dollar', exchange: 'FOREX' },
  
  // Scandinavian crosses
  { ticker: 'NOK/SEK', name: 'Norwegian Krone / Swedish Krona', exchange: 'FOREX' },
  { ticker: 'SEK/NOK', name: 'Swedish Krona / Norwegian Krone', exchange: 'FOREX' },
  { ticker: 'DKK/SEK', name: 'Danish Krone / Swedish Krona', exchange: 'FOREX' },
  { ticker: 'DKK/NOK', name: 'Danish Krone / Norwegian Krone', exchange: 'FOREX' },
];
