import type { ToolDefinition } from '../types.js';

interface CryptoPriceResponse {
  [key: string]: {
    usd: number;
    usd_24h_change?: number;
  };
}

/**
 * TOOL: get_crypto_price
 * Fetch live cryptocurrency prices using CoinGecko API (free, public).
 */
async function getCryptoPriceHandler(args: Record<string, unknown>): Promise<string> {
  const coins = (args['coins'] as string)?.toLowerCase().trim() || 'bitcoin,ethereum,solana';
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coins)}&vs_currencies=usd&include_24hr_change=true`;
    const res = await fetch(url);
    if (!res.ok) return `❌ Failed to retrieve crypto market data (status: ${res.status}).`;

    const data = (await res.json()) as CryptoPriceResponse;
    const entries = Object.entries(data);
    if (entries.length === 0) return `❌ No cryptocurrency found for identifier "${coins}".`;

    let report = `💎 **Live Crypto Telemetry:**\n`;
    for (const [coin, val] of entries) {
      const change = val.usd_24h_change !== undefined ? `${val.usd_24h_change >= 0 ? '+' : ''}${val.usd_24h_change.toFixed(2)}%` : '—';
      const indicator = (val.usd_24h_change ?? 0) >= 0 ? '🟢' : '🔴';
      report += `  • **${coin.toUpperCase()}**: $${val.usd.toLocaleString()} (${indicator} ${change} 24h)\n`;
    }
    return report;
  } catch (err) {
    return `❌ Error fetching crypto rates: ${(err as Error).message}`;
  }
}

/**
 * TOOL: get_market_rates
 * Fetch Gold, Silver, and Currency Exchange rates.
 */
async function getMarketRatesHandler(_args: Record<string, unknown>): Promise<string> {
  try {
    // 1. Fetch Gold/Silver from Gold API
    let goldStr = '—';
    let silverStr = '—';
    try {
      const gRes = await fetch('https://api.gold-api.com/price/XAU');
      if (gRes.ok) {
        const gData = (await gRes.json()) as { price?: number };
        if (gData.price) goldStr = `$${gData.price.toLocaleString()}/oz`;
      }
      const sRes = await fetch('https://api.gold-api.com/price/XAG');
      if (sRes.ok) {
        const sData = (await sRes.json()) as { price?: number };
        if (sData.price) silverStr = `$${sData.price.toLocaleString()}/oz`;
      }
    } catch {
      // fallback
    }

    // 2. Fetch Forex (USD to EUR, INR, GBP, JPY)
    let forexStr = '';
    try {
      const fRes = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR,EUR,GBP,JPY');
      if (fRes.ok) {
        const fData = (await fRes.json()) as { rates?: Record<string, number> };
        if (fData.rates) {
          forexStr = Object.entries(fData.rates)
            .map(([curr, rate]) => `1 USD = ${rate.toFixed(2)} ${curr}`)
            .join(' | ');
        }
      }
    } catch {
      // fallback
    }

    return `📊 **Commodities & Forex Telemetry:**\n` +
      `- 🥇 **Gold**: ${goldStr}\n` +
      `- 🥈 **Silver**: ${silverStr}\n` +
      (forexStr ? `- 💱 **Currencies**: ${forexStr}\n` : '');
  } catch (err) {
    return `❌ Error retrieving market rates: ${(err as Error).message}`;
  }
}

export const financeTools: ToolDefinition[] = [
  {
    name: 'get_crypto_price',
    description: 'Fetch live cryptocurrency prices and 24-hour percentage changes for coins like bitcoin, ethereum, solana, cardano, dogecoin.',
    parameters: {
      type: 'object',
      properties: {
        coins: {
          type: 'string',
          description: 'Comma-separated coin ids (e.g. "bitcoin,ethereum,solana,dogecoin")',
        },
      },
      required: ['coins'],
    },
    execute: getCryptoPriceHandler,
  },
  {
    name: 'get_market_rates',
    description: 'Fetch real-time global commodity rates (Gold, Silver) and key foreign exchange rates (USD/INR, USD/EUR, USD/GBP).',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: getMarketRatesHandler,
  },
];
