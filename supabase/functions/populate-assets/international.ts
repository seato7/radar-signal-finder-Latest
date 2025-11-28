// Major International Stocks (ADRs and direct listings)
export const INTERNATIONAL_STOCKS = [
  // Chinese Tech & E-commerce
  { ticker: 'BABA', name: 'Alibaba Group Holding Limited', exchange: 'NYSE' },
  { ticker: 'BIDU', name: 'Baidu Inc.', exchange: 'NASDAQ' },
  { ticker: 'JD', name: 'JD.com Inc.', exchange: 'NASDAQ' },
  { ticker: 'PDD', name: 'PDD Holdings Inc.', exchange: 'NASDAQ' },
  { ticker: 'TCOM', name: 'Trip.com Group Limited', exchange: 'NASDAQ' },
  { ticker: 'BEKE', name: 'KE Holdings Inc.', exchange: 'NYSE' },
  { ticker: 'TME', name: 'Tencent Music Entertainment Group', exchange: 'NYSE' },
  { ticker: 'BILI', name: 'Bilibili Inc.', exchange: 'NASDAQ' },
  { ticker: 'VIPS', name: 'Vipshop Holdings Limited', exchange: 'NYSE' },
  { ticker: 'NTES', name: 'NetEase Inc.', exchange: 'NASDAQ' },
  
  // European Tech & Luxury
  { ticker: 'ASML', name: 'ASML Holding N.V.', exchange: 'NASDAQ' },
  { ticker: 'SAP', name: 'SAP SE', exchange: 'NYSE' },
  { ticker: 'NVO', name: 'Novo Nordisk A/S', exchange: 'NYSE' },
  { ticker: 'SHOP', name: 'Shopify Inc.', exchange: 'NYSE' },
  { ticker: 'SE', name: 'Sea Limited', exchange: 'NYSE' },
  { ticker: 'GRAB', name: 'Grab Holdings Limited', exchange: 'NASDAQ' },
  { ticker: 'SPOT', name: 'Spotify Technology S.A.', exchange: 'NYSE' },
  { ticker: 'ARM', name: 'Arm Holdings plc', exchange: 'NASDAQ' },
  
  // Japanese
  { ticker: 'SONY', name: 'Sony Group Corporation', exchange: 'NYSE' },
  { ticker: 'TM', name: 'Toyota Motor Corporation', exchange: 'NYSE' },
  { ticker: 'HMC', name: 'Honda Motor Co. Ltd.', exchange: 'NYSE' },
  { ticker: 'STLA', name: 'Stellantis N.V.', exchange: 'NYSE' },
  { ticker: 'NMR', name: 'Nomura Holdings Inc.', exchange: 'NYSE' },
  { ticker: 'SMFG', name: 'Sumitomo Mitsui Financial Group Inc.', exchange: 'NYSE' },
  { ticker: 'MFG', name: 'Mizuho Financial Group Inc.', exchange: 'NYSE' },
  { ticker: 'KB', name: 'KB Financial Group Inc.', exchange: 'NYSE' },
  
  // Korean
  { ticker: 'LPL', name: 'LG Display Co. Ltd.', exchange: 'NYSE' },
  
  // Brazilian
  { ticker: 'VALE', name: 'Vale S.A.', exchange: 'NYSE' },
  { ticker: 'PBR', name: 'Petróleo Brasileiro S.A. - Petrobras', exchange: 'NYSE' },
  { ticker: 'ITUB', name: 'Itaú Unibanco Holding S.A.', exchange: 'NYSE' },
  { ticker: 'BBD', name: 'Banco Bradesco S.A.', exchange: 'NYSE' },
  { ticker: 'NU', name: 'Nu Holdings Ltd.', exchange: 'NYSE' },
  
  // Australian
  { ticker: 'BHP', name: 'BHP Group Limited', exchange: 'NYSE' },
  { ticker: 'RIO', name: 'Rio Tinto Group', exchange: 'NYSE' },
  
  // Israeli
  { ticker: 'TEVA', name: 'Teva Pharmaceutical Industries Limited', exchange: 'NYSE' },
  { ticker: 'WIX', name: 'Wix.com Ltd.', exchange: 'NASDAQ' },
  { ticker: 'MNDY', name: 'monday.com Ltd.', exchange: 'NASDAQ' },
  { ticker: 'NICE', name: 'NICE Ltd.', exchange: 'NASDAQ' },
  { ticker: 'CHKP', name: 'Check Point Software Technologies Ltd.', exchange: 'NASDAQ' },
  { ticker: 'CYBR', name: 'CyberArk Software Ltd.', exchange: 'NASDAQ' },
  
  // Canadian
  { ticker: 'CNQ', name: 'Canadian Natural Resources Limited', exchange: 'NYSE' },
  { ticker: 'ENB', name: 'Enbridge Inc.', exchange: 'NYSE' },
  { ticker: 'TRP', name: 'TC Energy Corporation', exchange: 'NYSE' },
  { ticker: 'BMO', name: 'Bank of Montreal', exchange: 'NYSE' },
  { ticker: 'RY', name: 'Royal Bank of Canada', exchange: 'NYSE' },
  { ticker: 'TD', name: 'The Toronto-Dominion Bank', exchange: 'NYSE' },
  { ticker: 'BNS', name: 'The Bank of Nova Scotia', exchange: 'NYSE' },
  { ticker: 'CM', name: 'Canadian Imperial Bank of Commerce', exchange: 'NYSE' },
  
  // European Industrials
  { ticker: 'SIEGY', name: 'Siemens AG', exchange: 'OTC' },
  { ticker: 'SNY', name: 'Sanofi', exchange: 'NASDAQ' },
  { ticker: 'NVS', name: 'Novartis AG', exchange: 'NYSE' },
  { ticker: 'AZN', name: 'AstraZeneca PLC', exchange: 'NASDAQ' },
  { ticker: 'GSK', name: 'GSK plc', exchange: 'NYSE' },
  { ticker: 'BCS', name: 'Barclays PLC', exchange: 'NYSE' },
  { ticker: 'DB', name: 'Deutsche Bank AG', exchange: 'NYSE' },
  { ticker: 'UBS', name: 'UBS Group AG', exchange: 'NYSE' },
  { ticker: 'ING', name: 'ING Groep N.V.', exchange: 'NYSE' },
  { ticker: 'BBVA', name: 'Banco Bilbao Vizcaya Argentaria S.A.', exchange: 'NYSE' },
  { ticker: 'SAN', name: 'Banco Santander S.A.', exchange: 'NYSE' },
  { ticker: 'VOD', name: 'Vodafone Group Public Limited Company', exchange: 'NASDAQ' },
  { ticker: 'BT', name: 'BT Group plc', exchange: 'NYSE' },
  { ticker: 'TEF', name: 'Telefónica S.A.', exchange: 'NYSE' },
  { ticker: 'ORAN', name: 'Orange S.A.', exchange: 'NYSE' },
  { ticker: 'DT', name: 'Deutsche Telekom AG', exchange: 'NYSE' },
  { ticker: 'ERIC', name: 'Telefonaktiebolaget LM Ericsson', exchange: 'NASDAQ' },
  { ticker: 'NOK', name: 'Nokia Corporation', exchange: 'NYSE' },
  
  // Indian
  { ticker: 'INFY', name: 'Infosys Limited', exchange: 'NYSE' },
  { ticker: 'WIT', name: 'Wipro Limited', exchange: 'NYSE' },
  { ticker: 'HDB', name: 'HDFC Bank Limited', exchange: 'NYSE' },
  { ticker: 'IBN', name: 'ICICI Bank Limited', exchange: 'NYSE' },
  { ticker: 'VEDL', name: 'Vedanta Limited', exchange: 'NYSE' },
  
  // South Korean
  { ticker: 'KB', name: 'KB Financial Group Inc.', exchange: 'NYSE' },
  
  // Taiwanese
  { ticker: 'TSM', name: 'Taiwan Semiconductor Manufacturing Company Limited', exchange: 'NYSE' },
  { ticker: 'UMC', name: 'United Microelectronics Corporation', exchange: 'NYSE' },
  { ticker: 'ASX', name: 'ASE Technology Holding Co. Ltd.', exchange: 'NYSE' },
  
  // Mexican
  { ticker: 'AMX', name: 'América Móvil S.A.B. de C.V.', exchange: 'NYSE' },
  { ticker: 'TV', name: 'Grupo Televisa S.A.B.', exchange: 'NYSE' },
  
  // African & Middle Eastern
  { ticker: 'GOLD', name: 'Barrick Gold Corporation', exchange: 'NYSE' },
  { ticker: 'NEM', name: 'Newmont Corporation', exchange: 'NYSE' },
  { ticker: 'AU', name: 'AngloGold Ashanti Limited', exchange: 'NYSE' },
  { ticker: 'GFI', name: 'Gold Fields Limited', exchange: 'NYSE' },
  { ticker: 'HMY', name: 'Harmony Gold Mining Company Limited', exchange: 'NYSE' },
  { ticker: 'SBSW', name: 'Sibanye Stillwater Limited', exchange: 'NYSE' },
  { ticker: 'BTG', name: 'B2Gold Corp.', exchange: 'NYSE' },
  { ticker: 'KGC', name: 'Kinross Gold Corporation', exchange: 'NYSE' },
  { ticker: 'AEM', name: 'Agnico Eagle Mines Limited', exchange: 'NYSE' },
  { ticker: 'FNV', name: 'Franco-Nevada Corporation', exchange: 'NYSE' },
  { ticker: 'WPM', name: 'Wheaton Precious Metals Corp.', exchange: 'NYSE' },
  { ticker: 'OR', name: 'Osisko Gold Royalties Ltd.', exchange: 'NYSE' },
  
  // Emerging Markets Mixed
  { ticker: 'ERJ', name: 'Embraer S.A.', exchange: 'NYSE' },
  { ticker: 'SID', name: 'Companhia Siderúrgica Nacional', exchange: 'NYSE' },
  { ticker: 'GGB', name: 'Gerdau S.A.', exchange: 'NYSE' },
  { ticker: 'ABEV', name: 'Ambev S.A.', exchange: 'NYSE' },
  { ticker: 'CIG', name: 'Companhia Energética de Minas Gerais', exchange: 'NYSE' },
  { ticker: 'EBR', name: 'Centrais Elétricas Brasileiras S.A. - Eletrobrás', exchange: 'NYSE' },
];
