// Comprehensive Forex pairs - Major, Minor, Exotic
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
  
  // Emerging market pairs (USD-based)
  { ticker: 'USD/CNY', name: 'US Dollar / Chinese Yuan', exchange: 'FOREX' },
  { ticker: 'USD/HKD', name: 'US Dollar / Hong Kong Dollar', exchange: 'FOREX' },
  { ticker: 'USD/SGD', name: 'US Dollar / Singapore Dollar', exchange: 'FOREX' },
  { ticker: 'USD/KRW', name: 'US Dollar / South Korean Won', exchange: 'FOREX' },
  { ticker: 'USD/THB', name: 'US Dollar / Thai Baht', exchange: 'FOREX' },
  { ticker: 'USD/INR', name: 'US Dollar / Indian Rupee', exchange: 'FOREX' },
  { ticker: 'USD/IDR', name: 'US Dollar / Indonesian Rupiah', exchange: 'FOREX' },
  { ticker: 'USD/PHP', name: 'US Dollar / Philippine Peso', exchange: 'FOREX' },
  { ticker: 'USD/MYR', name: 'US Dollar / Malaysian Ringgit', exchange: 'FOREX' },
  { ticker: 'USD/TWD', name: 'US Dollar / Taiwan Dollar', exchange: 'FOREX' },
  { ticker: 'USD/VND', name: 'US Dollar / Vietnamese Dong', exchange: 'FOREX' },
  { ticker: 'USD/ZAR', name: 'US Dollar / South African Rand', exchange: 'FOREX' },
  { ticker: 'USD/MXN', name: 'US Dollar / Mexican Peso', exchange: 'FOREX' },
  { ticker: 'USD/BRL', name: 'US Dollar / Brazilian Real', exchange: 'FOREX' },
  { ticker: 'USD/ARS', name: 'US Dollar / Argentine Peso', exchange: 'FOREX' },
  { ticker: 'USD/CLP', name: 'US Dollar / Chilean Peso', exchange: 'FOREX' },
  { ticker: 'USD/COP', name: 'US Dollar / Colombian Peso', exchange: 'FOREX' },
  { ticker: 'USD/PEN', name: 'US Dollar / Peruvian Sol', exchange: 'FOREX' },
  { ticker: 'USD/TRY', name: 'US Dollar / Turkish Lira', exchange: 'FOREX' },
  { ticker: 'USD/RUB', name: 'US Dollar / Russian Ruble', exchange: 'FOREX' },
  { ticker: 'USD/PLN', name: 'US Dollar / Polish Zloty', exchange: 'FOREX' },
  { ticker: 'USD/CZK', name: 'US Dollar / Czech Koruna', exchange: 'FOREX' },
  { ticker: 'USD/HUF', name: 'US Dollar / Hungarian Forint', exchange: 'FOREX' },
  { ticker: 'USD/RON', name: 'US Dollar / Romanian Leu', exchange: 'FOREX' },
  { ticker: 'USD/ILS', name: 'US Dollar / Israeli Shekel', exchange: 'FOREX' },
  { ticker: 'USD/SAR', name: 'US Dollar / Saudi Riyal', exchange: 'FOREX' },
  { ticker: 'USD/AED', name: 'US Dollar / UAE Dirham', exchange: 'FOREX' },
  { ticker: 'USD/KWD', name: 'US Dollar / Kuwaiti Dinar', exchange: 'FOREX' },
  { ticker: 'USD/QAR', name: 'US Dollar / Qatari Riyal', exchange: 'FOREX' },
  { ticker: 'USD/EGP', name: 'US Dollar / Egyptian Pound', exchange: 'FOREX' },
  { ticker: 'USD/NGN', name: 'US Dollar / Nigerian Naira', exchange: 'FOREX' },
  { ticker: 'USD/KES', name: 'US Dollar / Kenyan Shilling', exchange: 'FOREX' },
  
  // Scandinavian USD pairs
  { ticker: 'USD/SEK', name: 'US Dollar / Swedish Krona', exchange: 'FOREX' },
  { ticker: 'USD/NOK', name: 'US Dollar / Norwegian Krone', exchange: 'FOREX' },
  { ticker: 'USD/DKK', name: 'US Dollar / Danish Krone', exchange: 'FOREX' },
  { ticker: 'USD/ISK', name: 'US Dollar / Icelandic Krona', exchange: 'FOREX' },
];
