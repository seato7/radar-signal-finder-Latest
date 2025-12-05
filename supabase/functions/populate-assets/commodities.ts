// Comprehensive Commodities & Futures
export const COMMODITIES = [
  // Precious Metals
  { ticker: 'XAUUSD', name: 'Gold Spot / US Dollar', exchange: 'COMMODITY' },
  { ticker: 'XAGUSD', name: 'Silver Spot / US Dollar', exchange: 'COMMODITY' },
  { ticker: 'XPTUSD', name: 'Platinum Spot / US Dollar', exchange: 'COMMODITY' },
  { ticker: 'XPDUSD', name: 'Palladium Spot / US Dollar', exchange: 'COMMODITY' },
  { ticker: 'GC', name: 'Gold Futures', exchange: 'COMMODITY' },
  { ticker: 'SI', name: 'Silver Futures', exchange: 'COMMODITY' },
  { ticker: 'PL', name: 'Platinum Futures', exchange: 'COMMODITY' },
  { ticker: 'PA', name: 'Palladium Futures', exchange: 'COMMODITY' },
  
  // Energy
  { ticker: 'CRUDE', name: 'Crude Oil WTI', exchange: 'COMMODITY' },
  { ticker: 'BRENT', name: 'Brent Crude Oil', exchange: 'COMMODITY' },
  { ticker: 'NATGAS', name: 'Natural Gas', exchange: 'COMMODITY' },
  { ticker: 'CL', name: 'WTI Crude Oil Futures', exchange: 'COMMODITY' },
  { ticker: 'BZ', name: 'Brent Crude Oil Futures', exchange: 'COMMODITY' },
  { ticker: 'NG', name: 'Natural Gas Futures', exchange: 'COMMODITY' },
  { ticker: 'RB', name: 'RBOB Gasoline Futures', exchange: 'COMMODITY' },
  { ticker: 'HO', name: 'Heating Oil Futures', exchange: 'COMMODITY' },
  { ticker: 'QA', name: 'Low Sulfur Gasoil Futures', exchange: 'COMMODITY' },
  
  // Industrial Metals
  { ticker: 'COPPER', name: 'Copper Spot', exchange: 'COMMODITY' },
  { ticker: 'HG', name: 'Copper Futures', exchange: 'COMMODITY' },
  { ticker: 'ALI', name: 'Aluminum Futures', exchange: 'COMMODITY' },
  { ticker: 'ZINC', name: 'Zinc Futures', exchange: 'COMMODITY' },
  { ticker: 'NICKEL', name: 'Nickel Futures', exchange: 'COMMODITY' },
  { ticker: 'LEAD', name: 'Lead Futures', exchange: 'COMMODITY' },
  { ticker: 'TIN', name: 'Tin Futures', exchange: 'COMMODITY' },
  { ticker: 'STEEL', name: 'Steel Futures', exchange: 'COMMODITY' },
  { ticker: 'IRON', name: 'Iron Ore Futures', exchange: 'COMMODITY' },
  
  // Agricultural - Grains
  { ticker: 'ZC', name: 'Corn Futures', exchange: 'COMMODITY' },
  { ticker: 'ZS', name: 'Soybean Futures', exchange: 'COMMODITY' },
  { ticker: 'ZW', name: 'Wheat Futures', exchange: 'COMMODITY' },
  { ticker: 'ZL', name: 'Soybean Oil Futures', exchange: 'COMMODITY' },
  { ticker: 'ZM', name: 'Soybean Meal Futures', exchange: 'COMMODITY' },
  // ZO (Oat Futures) removed - not supported by Twelve Data
  { ticker: 'ZR', name: 'Rough Rice Futures', exchange: 'COMMODITY' },
  { ticker: 'KE', name: 'KC HRW Wheat Futures', exchange: 'COMMODITY' },
  { ticker: 'MWE', name: 'Spring Wheat Futures', exchange: 'COMMODITY' },
  
  // Agricultural - Softs
  { ticker: 'CC', name: 'Cocoa Futures', exchange: 'COMMODITY' },
  { ticker: 'KC', name: 'Coffee C Futures', exchange: 'COMMODITY' },
  { ticker: 'CT', name: 'Cotton No.2 Futures', exchange: 'COMMODITY' },
  { ticker: 'SB', name: 'Sugar No.11 Futures', exchange: 'COMMODITY' },
  { ticker: 'OJ', name: 'Orange Juice Futures', exchange: 'COMMODITY' },
  { ticker: 'LBS', name: 'Lumber Futures', exchange: 'COMMODITY' },
  
  // Livestock
  { ticker: 'LE', name: 'Live Cattle Futures', exchange: 'COMMODITY' },
  { ticker: 'GF', name: 'Feeder Cattle Futures', exchange: 'COMMODITY' },
  { ticker: 'HE', name: 'Lean Hogs Futures', exchange: 'COMMODITY' },
  { ticker: 'DC', name: 'Class III Milk Futures', exchange: 'COMMODITY' },
  
  // Volatility & Index Futures
  { ticker: 'VIX', name: 'CBOE Volatility Index', exchange: 'INDEX' },
  { ticker: 'ES', name: 'E-mini S&P 500 Futures', exchange: 'COMMODITY' },
  { ticker: 'NQ', name: 'E-mini NASDAQ-100 Futures', exchange: 'COMMODITY' },
  { ticker: 'YM', name: 'E-mini Dow Futures', exchange: 'COMMODITY' },
  { ticker: 'RTY', name: 'E-mini Russell 2000 Futures', exchange: 'COMMODITY' },
  
  // Rare Earths & Materials
  { ticker: 'LITHIUM', name: 'Lithium Carbonate', exchange: 'COMMODITY' },
  { ticker: 'COBALT', name: 'Cobalt', exchange: 'COMMODITY' },
  { ticker: 'URANIUM', name: 'Uranium', exchange: 'COMMODITY' },
  { ticker: 'RHODIUM', name: 'Rhodium', exchange: 'COMMODITY' },
];
