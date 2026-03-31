/**
 * Scrape and Extract - Unified scraping utility with retry logic
 * PRIMARY DATA SOURCE: Firecrawl
 * ZERO ESTIMATION - Returns empty/error if scrape fails
 */

import { scrapeUrl, searchWeb, FirecrawlResult } from './firecrawl-client.ts';

export interface ScrapeOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  timeout?: number;
  onlyMainContent?: boolean;
}

export interface ScrapedData {
  success: boolean;
  content?: string;
  url?: string;
  error?: string;
  source: 'firecrawl';
  retryCount: number;
}

const DEFAULT_OPTIONS: ScrapeOptions = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeout: 30000,
  onlyMainContent: true,
};

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Scrape a single URL with retry logic
 * NO ESTIMATION FALLBACK - Returns error if all retries fail
 */
export async function scrapeWithRetry(
  url: string,
  options?: ScrapeOptions
): Promise<ScrapedData> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError = '';
  
  for (let attempt = 0; attempt < (opts.maxRetries || 3); attempt++) {
    if (attempt > 0) {
      console.log(`[ScrapeAndExtract] Retry attempt ${attempt + 1}/${opts.maxRetries} for ${url}`);
      await sleep((opts.retryDelayMs || 1000) * attempt); // Exponential backoff
    }

    try {
      const result = await scrapeUrl(url, {
        formats: ['markdown'],
        onlyMainContent: opts.onlyMainContent,
      });

      if (result.success && result.data) {
        const content = result.data.markdown || result.data.content || '';
        if (content.length > 100) {
          return {
            success: true,
            content,
            url,
            source: 'firecrawl',
            retryCount: attempt,
          };
        }
        lastError = 'Content too short or empty';
      } else {
        lastError = result.error || 'Unknown error';
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`[ScrapeAndExtract] Attempt ${attempt + 1} failed: ${lastError}`);
    }
  }

  // ALL RETRIES FAILED - NO ESTIMATION, RETURN ERROR
  return {
    success: false,
    error: `All ${opts.maxRetries} attempts failed: ${lastError}`,
    url,
    source: 'firecrawl',
    retryCount: opts.maxRetries || 3,
  };
}

/**
 * Search and scrape multiple results with retry logic
 * NO ESTIMATION FALLBACK - Returns only successfully scraped results
 */
export async function searchAndScrapeWithRetry(
  query: string,
  maxResults: number = 5,
  options?: ScrapeOptions
): Promise<{
  success: boolean;
  results: ScrapedData[];
  totalFound: number;
  error?: string;
}> {
  console.log(`[ScrapeAndExtract] Searching: "${query}" (max ${maxResults} results)`);

  try {
    const searchResult = await searchWeb(query, {
      limit: maxResults,
      scrapeOptions: { formats: ['markdown'] },
    });

    if (!searchResult.success || !Array.isArray(searchResult.data)) {
      return {
        success: false,
        results: [],
        totalFound: 0,
        error: searchResult.error || 'Search returned no results',
      };
    }

    const results: ScrapedData[] = [];
    
    for (const item of searchResult.data) {
      const content = item.markdown || item.content || item.description || '';
      const url = item.url || item.link || '';
      
      if (content.length > 50) {
        results.push({
          success: true,
          content,
          url,
          source: 'firecrawl',
          retryCount: 0,
        });
      }
    }

    console.log(`[ScrapeAndExtract] Search returned ${results.length}/${searchResult.data.length} valid results`);

    return {
      success: results.length > 0,
      results,
      totalFound: searchResult.data.length,
      error: results.length === 0 ? 'No valid content found in search results' : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ScrapeAndExtract] Search failed: ${errorMessage}`);
    
    return {
      success: false,
      results: [],
      totalFound: 0,
      error: errorMessage,
    };
  }
}

/**
 * Scrape multiple URLs concurrently with rate limiting
 * NO ESTIMATION FALLBACK - Returns only successfully scraped results
 */
export async function scrapeMultipleUrls(
  urls: string[],
  options?: ScrapeOptions & { concurrency?: number; delayBetweenBatchesMs?: number }
): Promise<{
  success: boolean;
  results: ScrapedData[];
  failedUrls: string[];
}> {
  const concurrency = options?.concurrency || 3;
  const delayMs = options?.delayBetweenBatchesMs || 500;
  
  console.log(`[ScrapeAndExtract] Scraping ${urls.length} URLs (concurrency: ${concurrency})`);

  const results: ScrapedData[] = [];
  const failedUrls: string[] = [];

  // Process in batches to respect rate limits
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    
    const batchResults = await Promise.all(
      batch.map(url => scrapeWithRetry(url, options))
    );

    for (let j = 0; j < batchResults.length; j++) {
      if (batchResults[j].success) {
        results.push(batchResults[j]);
      } else {
        failedUrls.push(batch[j]);
      }
    }

    // Rate limiting delay between batches
    if (i + concurrency < urls.length) {
      await sleep(delayMs);
    }
  }

  console.log(`[ScrapeAndExtract] Completed: ${results.length}/${urls.length} successful`);

  return {
    success: results.length > 0,
    results,
    failedUrls,
  };
}

/**
 * Scrape a financial data page (specialized for tables/data)
 */
export async function scrapeFinancialPage(
  url: string,
  options?: ScrapeOptions
): Promise<ScrapedData> {
  console.log(`[ScrapeAndExtract] Scraping financial page: ${url}`);
  
  // Use raw HTML for financial pages to preserve tables
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  for (let attempt = 0; attempt < (opts.maxRetries || 3); attempt++) {
    if (attempt > 0) {
      await sleep((opts.retryDelayMs || 1000) * attempt);
    }

    try {
      const result = await scrapeUrl(url, {
        formats: ['markdown', 'html'],
        onlyMainContent: false, // Keep all content for financial data
        waitFor: 2000, // Wait for dynamic content to load
      });

      if (result.success && result.data) {
        // Prefer markdown but fallback to HTML
        const content = result.data.markdown || result.data.html || '';
        if (content.length > 200) {
          return {
            success: true,
            content,
            url,
            source: 'firecrawl',
            retryCount: attempt,
          };
        }
      }
    } catch (error) {
      console.error(`[ScrapeAndExtract] Financial scrape attempt ${attempt + 1} failed`);
    }
  }

  return {
    success: false,
    error: 'Failed to scrape financial page after all retries',
    url,
    source: 'firecrawl',
    retryCount: opts.maxRetries || 3,
  };
}
