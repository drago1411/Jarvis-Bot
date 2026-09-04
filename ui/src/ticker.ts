/**
 * JARVIS UI — Live Telemetry & Market Ticker Strip
 */

interface TickerData {
  btc: string;
  eth: string;
  sol: string;
  gold: string;
  usdinr: string;
}

export async function fetchMarketTicker(): Promise<TickerData> {
  let btc = '$—';
  let eth = '$—';
  let sol = '$—';
  let gold = '$—';
  let usdinr = '—';

  try {
    const cryptoRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true');
    if (cryptoRes.ok) {
      const data = await cryptoRes.json();
      if (data.bitcoin) btc = `$${data.bitcoin.usd.toLocaleString()}`;
      if (data.ethereum) eth = `$${data.ethereum.usd.toLocaleString()}`;
      if (data.solana) sol = `$${data.solana.usd.toLocaleString()}`;
    }
  } catch {
    // Network or rate limit fallback
  }

  try {
    const goldRes = await fetch('https://api.gold-api.com/price/XAU');
    if (goldRes.ok) {
      const data = await goldRes.json();
      if (data.price) gold = `$${data.price.toLocaleString()}/oz`;
    }
  } catch {
    // fallback
  }

  try {
    const fxRes = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
    if (fxRes.ok) {
      const data = await fxRes.json();
      if (data.rates?.INR) usdinr = `₹${data.rates.INR.toFixed(2)}`;
    }
  } catch {
    // fallback
  }

  return { btc, eth, sol, gold, usdinr };
}

export function startTickerPolling(onUpdate: (data: TickerData) => void): void {
  // Initial fetch
  fetchMarketTicker().then(onUpdate);

  // Poll every 60s
  setInterval(() => {
    fetchMarketTicker().then(onUpdate);
  }, 60000);
}
