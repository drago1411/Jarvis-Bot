import type { ToolDefinition } from '../types.js';

/**
 * TOOL: web_search
 * Searches the live web using DuckDuckGo HTML search (free, zero API keys required)
 * and returns snippets and titles of real-time search results.
 */
async function webSearchHandler(args: Record<string, unknown>): Promise<string> {
  const query = args['query'] as string;
  if (!query || query.trim().length === 0) {
    return '❌ Error: Search query is empty.';
  }

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return `❌ Web search failed: HTTP status ${response.status}`;
    }

    const html = await response.text();

    // Parse simple snippets and titles from DuckDuckGo HTML results
    const results: { title: string; link: string; snippet: string }[] = [];
    const regex = /<h2 class="result__title">[\s\S]*?<a class="result__url" href="([^"]+)">[\s\S]*?<\/a>[\s\S]*?<a class="result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

    // Simpler fallback parsing for standard DDG HTML blocks
    const resultBlocks = html.split('<div class="result results_links results_links_deep web-result ">');
    for (let i = 1; i < Math.min(resultBlocks.length, 6); i++) {
      const block = resultBlocks[i];
      if (!block) continue;
      
      const titleMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/);
      const urlMatch = block.match(/href="([^"]+)"/);
      const snippetMatch = block.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/);

      const title = block.match(/<h2 class="result__title">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
      const cleanTitle = title && title[1] ? title[1].replace(/<[^>]+>/g, '').trim() : 'Search Result';
      const cleanSnippet = snippetMatch && snippetMatch[1] ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';

      if (cleanSnippet) {
        results.push({
          title: cleanTitle,
          link: urlMatch && urlMatch[1] ? urlMatch[1] : '',
          snippet: cleanSnippet,
        });
      }
    }

    if (results.length === 0) {
      // Fallback: strip tags from body and grab first 800 characters if regex failed
      const textOnly = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return `Live search results for "${query}":\n${textOnly.slice(0, 1000)}`;
    }

    const formatted = results.map((r, idx) => `${idx + 1}. **${r.title}**\n   ${r.snippet}\n`).join('\n');
    return `Live Web Results for "${query}":\n\n${formatted}`;
  } catch (err) {
    return `❌ Web search error: ${(err as Error).message}`;
  }
}

/**
 * TOOL: fetch_page
 * Fetches and returns readable text content from a web page URL.
 */
async function fetchPageHandler(args: Record<string, unknown>): Promise<string> {
  const url = args['url'] as string;
  if (!url) return '❌ Error: URL is required.';

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) return `❌ Failed to fetch page: HTTP ${response.status}`;

    const html = await response.text();
    // Strip scripts, styles, and tags
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return `Page Content from ${url}:\n\n${cleanText.slice(0, 3000)}`;
  } catch (err) {
    return `❌ Failed to fetch "${url}": ${(err as Error).message}`;
  }
}

export const webTools: ToolDefinition[] = [
  {
    name: 'web_search',
    description: 'Search the live internet for current events, breaking news, live documentation, weather, or real-time info. Use whenever asked about recent/current topics or external APIs.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query (e.g. "Ireland breaking news", "latest Vite documentation")',
        },
      },
      required: ['query'],
    },
    execute: webSearchHandler,
  },
  {
    name: 'fetch_page',
    description: 'Fetch readable text content from a specific web URL.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The full URL to fetch',
        },
      },
      required: ['url'],
    },
    execute: fetchPageHandler,
  },
];
