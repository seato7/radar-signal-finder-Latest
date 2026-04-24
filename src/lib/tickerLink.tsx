import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";

// Ticker text click navigates to our internal /asset/:ticker page.
// The adjacent external-link icon opens Yahoo Finance in a new tab.
// Both handlers call stopPropagation so the component can be nested
// inside parent cards that already have their own click/Link handlers.

export function tickerToYahooSymbol(ticker: string): string {
  // Crypto: BTC/USD -> BTC-USD
  if (/\/(USD|USDT|USDC)$/.test(ticker)) {
    return ticker.replace('/', '-');
  }
  // Forex: EUR/USD -> EURUSD=X
  const forexMatch = ticker.match(/^([A-Z]{3})\/([A-Z]{3})$/);
  if (forexMatch) {
    return `${forexMatch[1]}${forexMatch[2]}=X`;
  }
  // Single-letter share class: BRK.B -> BRK-B, HEI.A -> HEI-A.
  // Longer preferred suffixes (TFIN.PR etc.) are left as-is; Yahoo's
  // convention for those is inconsistent.
  if (/^[A-Z]+\.[A-Z]$/.test(ticker)) {
    return ticker.replace('.', '-');
  }
  return ticker;
}

export interface TickerLinkProps {
  ticker: string;
  className?: string;
  showIcon?: boolean;
  iconOnly?: boolean;
}

export function TickerLink({
  ticker,
  className = "",
  showIcon = true,
  iconOnly = false,
}: TickerLinkProps) {
  const yahooUrl = `https://finance.yahoo.com/quote/${tickerToYahooSymbol(ticker)}`;

  if (iconOnly) {
    return (
      <a
        href={yahooUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center opacity-60 hover:opacity-100 transition-opacity"
        aria-label={`View ${ticker} on Yahoo Finance`}
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLink className="w-3 h-3" />
      </a>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <Link
        to={`/asset/${encodeURIComponent(ticker)}`}
        className="hover:text-cyan-400 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        {ticker}
      </Link>
      {showIcon && (
        <a
          href={yahooUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center opacity-50 hover:opacity-100 transition-opacity"
          aria-label={`View ${ticker} on Yahoo Finance`}
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </span>
  );
}
