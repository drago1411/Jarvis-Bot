import type { ToolDefinition } from '../types.js';

/**
 * Realistic browser headers to bypass basic bot blockers.
 */
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

/**
 * Helper: Search Google News RSS (never CAPTCHA-blocked, completely free).
 */
async function searchGoogleNewsRSS(query: string): Promise<string | null> {
  try {
    const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-IN&gl=IN&ceid=IN:en`;
    const res = await fetch(rssUrl, { headers: BROWSER_HEADERS });
    if (!res.ok) return null;

    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
    if (items.length === 0) return null;

    const results: string[] = [];
    for (let i = 0; i < Math.min(items.length, 5); i++) {
      const item = items[i];
      if (!item) continue;
      const title = (item.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const pubDate = (item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || '').trim();
      if (title) {
        results.push(`• **${title}** (${pubDate})`);
      }
    }
    return results.length > 0 ? results.join('\n\n') : null;
  } catch {
    return null;
  }
}

/**
 * Helper: Free public gold & silver live spot price API.
 */
async function getMetalPrice(metal: 'gold' | 'silver'): Promise<string | null> {
  try {
    const symbol = metal === 'gold' ? 'XAU' : 'XAG';
    // Free public gold price API
    const res = await fetch(`https://api.gold-api.com/price/${symbol}`, { headers: BROWSER_HEADERS });
    if (!res.ok) return null;

    const data = await res.json() as { price?: number; updatedAt?: string };
    if (!data.price) return null;

    // Get live USD to INR rate to give accurate India pricing
    const inrRateRes = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
    const inrData = inrRateRes.ok ? await inrRateRes.json() as { rates?: { INR?: number } } : null;
    const usdToInr = inrData?.rates?.INR || 86.5;

    // 1 Troy Ounce = 31.1034768 grams
    const pricePerGramUSD = data.price / 31.1034768;
    const pricePerGramINR = pricePerGramUSD * usdToInr;
    const price10gINR_24K = Math.round(pricePerGramINR * 10);
    const price10gINR_22K = Math.round(price10gINR_24K * (22 / 24));

    return `Live Spot Price for ${metal.toUpperCase()} (Live Market Feed):
• International Spot: $${data.price.toFixed(2)} USD / oz
• USD/INR Reference: ₹${usdToInr.toFixed(2)}
• India 24K Gold (approx spot / 10g): ₹${price10gINR_24K.toLocaleString('en-IN')}
• India 22K Gold (approx standard / 10g): ₹${price10gINR_22K.toLocaleString('en-IN')}
(Note: Excludes local import duties, GST, and jeweler making charges)`;
  } catch {
    return null;
  }
}

/**
 * Helper: Free public currency / exchange rate API (frankfurter.dev - no API key needed).
 */
async function getExchangeRate(base: string, target: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${base}&symbols=${target}`);
    if (!res.ok) return null;
    const data = await res.json() as { rates?: Record<string, number>; date?: string };
    if (data.rates && data.rates[target]) {
      return `Current live exchange rate (as of ${data.date}): 1 ${base} = ${data.rates[target]} ${target}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Helper: DuckDuckGo Instant Answer API (JSON, no CAPTCHA).
 */
async function searchDuckDuckGoAPI(query: string): Promise<string | null> {
  try {
    const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(apiUrl, { headers: BROWSER_HEADERS });
    if (!res.ok) return null;
    const data = await res.json() as {
      AbstractText?: string;
      AbstractURL?: string;
      RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>;
    };

    const lines: string[] = [];
    if (data.AbstractText) {
      lines.push(`Summary: ${data.AbstractText}\nSource: ${data.AbstractURL}`);
    }
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      for (const topic of data.RelatedTopics.slice(0, 4)) {
        if (topic.Text) lines.push(`• ${topic.Text}`);
      }
    }
    return lines.length > 0 ? lines.join('\n\n') : null;
  } catch {
    return null;
  }
}

/**
 * Helper: DuckDuckGo HTML search with fallback parsing.
 */
async function searchDuckDuckGoHTML(query: string): Promise<string | null> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: BROWSER_HEADERS });
    if (!response.ok) return null;

    const html = await response.text();

    // Check if blocked by bot detection
    if (html.includes('Select all squares containing a duck') || html.includes('bots use DuckDuckGo too')) {
      return null;
    }

    const results: string[] = [];
    const resultBlocks = html.split('<div class="result results_links results_links_deep web-result ">');

    for (let i = 1; i < Math.min(resultBlocks.length, 6); i++) {
      const block = resultBlocks[i];
      if (!block) continue;

      const titleMatch = block.match(/<h2 class="result__title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
      const urlMatch = block.match(/<a class="result__url"[^>]*href="([^"]+)"/);
      const snippetMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/);

      const title = titleMatch && titleMatch[1] ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const snippet = snippetMatch && snippetMatch[1] ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const link = urlMatch && urlMatch[1] ? urlMatch[1].trim() : '';

      if (title && snippet) {
        results.push(`• **${title}**\n  ${snippet}\n  ${link}`);
      }
    }

    return results.length > 0 ? results.join('\n\n') : null;
  } catch {
    return null;
  }
}

/**
 * TOOL: web_search
 * Multi-provider search engine that automatically falls back to alternative sources
 * when any provider triggers rate limiting or CAPTCHAs.
 */
async function webSearchHandler(args: Record<string, unknown>): Promise<string> {
  const query = args['query'] as string;
  if (!query || query.trim().length === 0) {
    return '❌ Error: Search query is empty.';
  }

  // 1. Check if it's a gold or silver query
  if (/gold\s*(price|rate)/i.test(query)) {
    const metalPrice = await getMetalPrice('gold');
    if (metalPrice) return metalPrice;
  }
  if (/silver\s*(price|rate)/i.test(query)) {
    const metalPrice = await getMetalPrice('silver');
    if (metalPrice) return metalPrice;
  }

  // 2. Check if it's an exchange rate query
  const rateMatch = query.match(/([a-z]{3})\s+to\s+([a-z]{3})/i);
  if (rateMatch && rateMatch[1] && rateMatch[2]) {
    const rate = await getExchangeRate(rateMatch[1].toUpperCase(), rateMatch[2].toUpperCase());
    if (rate) return `📈 Live Exchange Rate Data:\n${rate}`;
  }

  // 2. Try DuckDuckGo HTML first
  const htmlResults = await searchDuckDuckGoHTML(query);
  if (htmlResults) {
    return `Live Web Results for "${query}":\n\n${htmlResults}`;
  }

  // 3. Fallback: Google News RSS (always reliable, no CAPTCHA)
  const newsResults = await searchGoogleNewsRSS(query);
  if (newsResults) {
    return `Live News & Search Results for "${query}":\n\n${newsResults}`;
  }

  // 4. Fallback: DuckDuckGo Instant API
  const apiResults = await searchDuckDuckGoAPI(query);
  if (apiResults) {
    return `Summary Results for "${query}":\n\n${apiResults}`;
  }

  return `⚠️ Unable to complete live search for "${query}". Multiple search mirrors hit rate limits. Try rephrasing your search or querying a specific news/data source.`;
}

/**
 * TOOL: fetch_page
 * Enhanced page fetcher with anti-bot headers and tag filtering.
 */
async function fetchPageHandler(args: Record<string, unknown>): Promise<string> {
  const url = args['url'] as string;
  if (!url) return '❌ Error: URL is required.';

  try {
    const response = await fetch(url, {
      headers: BROWSER_HEADERS,
      redirect: 'follow',
    });

    if (!response.ok) {
      return `❌ Failed to fetch page: HTTP ${response.status} (${response.statusText})`;
    }

    const html = await response.text();

    // Clean scripts, styles, navigations, footers
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();

    return `Page Content from ${url}:\n\n${cleanText.slice(0, 4000)}`;
  } catch (err) {
    return `❌ Failed to fetch "${url}": ${(err as Error).message}`;
  }
}

export const webTools: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the live internet for news, real-time prices, exchange rates, technical docs, or current information. Uses multi-engine fallback to bypass CAPTCHAs.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "gold price 10g India", "USD to INR exchange rate")',
        },
      },
      required: ['query'],
    },
    execute: webSearchHandler,
  },
  {
    name: 'fetch_page',
    description: 'Fetch and read clean text content from a web page URL.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to fetch',
        },
      },
      required: ['url'],
    },
    execute: fetchPageHandler,
  },
];
