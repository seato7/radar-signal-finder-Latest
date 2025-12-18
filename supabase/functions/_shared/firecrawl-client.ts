/**
 * Firecrawl Client - Shared utility for web scraping and search
 * Replaces Perplexity for all web data fetching needs
 */

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1';

export interface FirecrawlScrapeOptions {
  formats?: ('markdown' | 'html' | 'rawHtml' | 'links' | 'screenshot')[];
  onlyMainContent?: boolean;
  waitFor?: number;
}

export interface FirecrawlSearchOptions {
  limit?: number;
  lang?: string;
  country?: string;
  scrapeOptions?: {
    formats?: ('markdown' | 'html')[];
  };
}

export interface FirecrawlMapOptions {
  search?: string;
  limit?: number;
  includeSubdomains?: boolean;
}

export interface FirecrawlCrawlOptions {
  limit?: number;
  maxDepth?: number;
  includePaths?: string[];
  excludePaths?: string[];
}

export interface FirecrawlResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Get API key from environment
 */
function getApiKey(): string {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    throw new Error('FIRECRAWL_API_KEY not configured');
  }
  return apiKey;
}

/**
 * Scrape a single URL
 */
export async function scrapeUrl(
  url: string, 
  options?: FirecrawlScrapeOptions
): Promise<FirecrawlResult> {
  const apiKey = getApiKey();
  
  // Normalize URL
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  console.log(`[Firecrawl] Scraping URL: ${normalizedUrl}`);

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/scrape`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: normalizedUrl,
        formats: options?.formats || ['markdown'],
        onlyMainContent: options?.onlyMainContent ?? true,
        waitFor: options?.waitFor,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Firecrawl] Scrape error: ${data.error || response.status}`);
      return { 
        success: false, 
        error: data.error || `Request failed with status ${response.status}` 
      };
    }

    console.log(`[Firecrawl] Scrape successful for ${normalizedUrl}`);
    return { success: true, data: data.data || data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Firecrawl] Scrape exception: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Search the web and optionally scrape results
 */
export async function searchWeb(
  query: string, 
  options?: FirecrawlSearchOptions
): Promise<FirecrawlResult> {
  const apiKey = getApiKey();

  console.log(`[Firecrawl] Searching: "${query}" (limit: ${options?.limit || 10})`);

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/search`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: options?.limit || 10,
        lang: options?.lang,
        country: options?.country,
        scrapeOptions: options?.scrapeOptions,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Firecrawl] Search error: ${data.error || response.status}`);
      return { 
        success: false, 
        error: data.error || `Request failed with status ${response.status}` 
      };
    }

    const resultCount = data.data?.length || 0;
    console.log(`[Firecrawl] Search returned ${resultCount} results`);
    return { success: true, data: data.data || data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Firecrawl] Search exception: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Map a website to discover all URLs (fast sitemap)
 */
export async function mapWebsite(
  url: string, 
  options?: FirecrawlMapOptions
): Promise<FirecrawlResult> {
  const apiKey = getApiKey();

  // Normalize URL
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  console.log(`[Firecrawl] Mapping website: ${normalizedUrl}`);

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/map`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: normalizedUrl,
        search: options?.search,
        limit: options?.limit || 100,
        includeSubdomains: options?.includeSubdomains ?? false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Firecrawl] Map error: ${data.error || response.status}`);
      return { 
        success: false, 
        error: data.error || `Request failed with status ${response.status}` 
      };
    }

    const linkCount = data.links?.length || 0;
    console.log(`[Firecrawl] Map found ${linkCount} URLs`);
    return { success: true, data: data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Firecrawl] Map exception: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Crawl an entire website recursively
 */
export async function crawlWebsite(
  url: string, 
  options?: FirecrawlCrawlOptions
): Promise<FirecrawlResult> {
  const apiKey = getApiKey();

  // Normalize URL
  let normalizedUrl = url.trim();
  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  console.log(`[Firecrawl] Starting crawl of: ${normalizedUrl} (limit: ${options?.limit || 50})`);

  try {
    const response = await fetch(`${FIRECRAWL_API_URL}/crawl`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: normalizedUrl,
        limit: options?.limit || 50,
        maxDepth: options?.maxDepth,
        includePaths: options?.includePaths,
        excludePaths: options?.excludePaths,
        scrapeOptions: {
          formats: ['markdown'],
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Firecrawl] Crawl error: ${data.error || response.status}`);
      return { 
        success: false, 
        error: data.error || `Request failed with status ${response.status}` 
      };
    }

    console.log(`[Firecrawl] Crawl initiated, status: ${data.status}`);
    return { success: true, data: data };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Firecrawl] Crawl exception: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}
