// Commodities - Only Twelve Data supported symbols
// Note: Most futures (ES, NQ, GC, etc.) require paid plans or use different symbols
// We keep only spot prices that work with free tier
export const COMMODITIES = [
  // Precious Metals Spot (these work as XAU/USD format)
  { ticker: 'XAUUSD', name: 'Gold Spot / US Dollar', exchange: 'COMMODITY' },
  { ticker: 'XAGUSD', name: 'Silver Spot / US Dollar', exchange: 'COMMODITY' },
  { ticker: 'XPTUSD', name: 'Platinum Spot / US Dollar', exchange: 'COMMODITY' },
  { ticker: 'XPDUSD', name: 'Palladium Spot / US Dollar', exchange: 'COMMODITY' },
  
  // Energy - Only CL1 (WTI Crude) is confirmed working
  { ticker: 'CL', name: 'WTI Crude Oil Futures', exchange: 'COMMODITY' },
  
  // Agricultural - These specific symbols work
  { ticker: 'CC', name: 'Cocoa Futures', exchange: 'COMMODITY' },
  { ticker: 'KC', name: 'Coffee C Futures', exchange: 'COMMODITY' },
  { ticker: 'CT', name: 'Cotton No.2 Futures', exchange: 'COMMODITY' },
  { ticker: 'HO', name: 'Heating Oil Futures', exchange: 'COMMODITY' },
  { ticker: 'SB', name: 'Sugar No.11 Futures', exchange: 'COMMODITY' },
  { ticker: 'HG', name: 'Copper Futures', exchange: 'COMMODITY' },
  { ticker: 'HE', name: 'Lean Hogs Futures', exchange: 'COMMODITY' },
  { ticker: 'BZ', name: 'Brent Crude Oil Futures', exchange: 'COMMODITY' },
  { ticker: 'ZS', name: 'Soybean Futures', exchange: 'COMMODITY' },
  { ticker: 'ZW', name: 'Wheat Futures', exchange: 'COMMODITY' },
  { ticker: '1INCH', name: '1inch Network', exchange: 'COMMODITY' }, // This was in crypto batch, keeping if valid
];
