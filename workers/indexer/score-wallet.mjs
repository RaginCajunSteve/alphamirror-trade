/**
 * Risk-adjusted ROI scoring from Etherscan tokentx rows.
 */

export const WINDOW_DAYS = { "30d": 30, "90d": 90, "180d": 180 };

const STABLE_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "USDBC",
  "USDC.E",
  "USD+",
  "LUSD",
  "FRAX",
  "CRVUSD",
  "USDE",
]);

const WETH_SYMBOLS = new Set(["WETH", "ETH"]);
const WBTC_SYMBOLS = new Set(["WBTC", "BTC"]);
const ETH_USD_ESTIMATE = 3_500;
const BTC_USD_ESTIMATE = 100_000;
const MIN_TRADE_USD = 8;

/** Known stable / WETH contracts for USD estimation when symbol is missing (RPC logs). */
const TOKEN_USD_KIND = {
  "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "stable",
  "0xdac17f958d2ee523a2206206994597c13d831ec7": "stable",
  "0x6b175474e89094c44da98b954eedeac495271d0f": "stable",
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "weth",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "stable",
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca": "stable",
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": "stable",
  "0xaf88d065e77c8cc2239327c5edb3a432268e5831": "stable",
  "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8": "stable",
  "0x4200000000000000000000000000000000000006": "weth",
  "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f": "wbtc",
  "0xcbbtc0000000000000000000000000000000006": "wbtc",
  "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599": "wbtc",
  // Polygon
  "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359": "stable",
  "0x2791bca1f2de4661ed88a30c99a7a9449aa84174": "stable",
  "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619": "weth",
  // Linea
  "0x176211869ca2b568f2a7d4ee941e073a821ee58ff": "stable",
  "0xe5d7c2a44ffddf6b295a15c148167daaaf5bb34": "weth",
  // Blast
  "0x4300000000000000000000000000000000000003": "stable",
  "0x4300000000000000000000000000000000000004": "weth",
  // Optimism
  "0x0b2c639c533813f4aa9d7837caf62653d097ff85": "stable",
  "0x7f5c764cbc14f9669b88837ca1490cca17c31607": "stable",
  // BSC
  "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": "stable",
  "0x55d398326f99059ff775485246999027b3197955": "stable",
  "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": "weth",
  // Avalanche
  "0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e": "stable",
  "0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7": "stable",
  "0x49d5c2bdffac6ce2bfdb0a09eb45dcbead8a169c": "weth",
  "0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7": "weth",
  // Scroll
  "0x06efdbff2a14a7c8e15944d869061ffcD156d9c0": "stable",
  "0x5300000000000000000000000000000000000004": "weth",
};

export function transferUsdEstimate(transfer) {
  const sym = (transfer.tokenSymbol || "").toUpperCase();
  const contract = transfer.contractAddress?.toLowerCase();
  const kind = contract ? TOKEN_USD_KIND[contract] : null;
  const decimals = Number(transfer.tokenDecimal ?? 18);
  const raw = BigInt(transfer.value ?? "0");
  const amount = Number(raw) / 10 ** decimals;
  if (amount <= 0) return 0;
  if (STABLE_SYMBOLS.has(sym) || kind === "stable") return amount;
  if (WETH_SYMBOLS.has(sym) || kind === "weth") return amount * ETH_USD_ESTIMATE;
  if (WBTC_SYMBOLS.has(sym) || kind === "wbtc") return amount * BTC_USD_ESTIMATE;
  return 0;
}

function emptyScore(wallet, window, windowDays) {
  return {
    wallet,
    window,
    roi: 0,
    maxDrawdown: 0.01,
    riskAdjRoi: 0,
    winRate: 0,
    avgWinnerGain: 0,
    percentile: 0,
    tradeCount: 0,
    volumeUsd: 0,
    windowDays,
  };
}

export function scoreTransfers(
  address,
  transfers,
  windowDays,
  nowSec = Math.floor(Date.now() / 1000),
) {
  const cutoff = nowSec - windowDays * 86_400;
  const wallet = address.toLowerCase();
  const inWindow = transfers
    .filter((t) => Number(t.timeStamp) >= cutoff)
    .sort((a, b) => Number(a.timeStamp) - Number(b.timeStamp));

  if (inWindow.length === 0) {
    return {
      ...emptyScore(address, `${windowDays}d`, windowDays),
      equityCurve: [],
      closedTrades: [],
    };
  }

  const lots = new Map();
  const closedTrades = [];
  let volumeUsd = 0;
  const equityPoints = [{ date: new Date(cutoff * 1000).toISOString().slice(0, 10), cumulativePnlPct: 0 }];
  let cumulativePnlUsd = 0;
  let capitalDeployed = 0;

  for (const tx of inWindow) {
    const usd = transferUsdEstimate(tx);
    if (usd <= 0) continue;

    const token = (tx.contractAddress || tx.tokenSymbol || "unknown").toLowerCase();
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase();
    const ts = Number(tx.timeStamp);

    if (to === wallet) {
      volumeUsd += usd;
      capitalDeployed += usd;
      const stack = lots.get(token) ?? [];
      stack.push({ usd, ts });
      lots.set(token, stack);
      continue;
    }

    if (from === wallet) {
      volumeUsd += usd;
      const stack = lots.get(token) ?? [];
      if (stack.length === 0) continue;

      let sellUsd = usd;
      let costUsd = 0;
      let buyTs = ts;

      while (sellUsd > 0.0001 && stack.length > 0) {
        const lot = stack[0];
        const matched = Math.min(sellUsd, lot.usd);
        costUsd += matched;
        buyTs = lot.ts;
        lot.usd -= matched;
        sellUsd -= matched;
        if (lot.usd <= 0.0001) stack.shift();
      }
      lots.set(token, stack);

      if (costUsd < MIN_TRADE_USD || usd < MIN_TRADE_USD) continue;

      const pnlUsd = usd - costUsd;
      const pnlPct = pnlUsd / costUsd;
      const holdDays = Math.max((ts - buyTs) / 86_400, 0.1);
      closedTrades.push({ pnlUsd, pnlPct, holdDays, costUsd, sellUsd: usd });

      cumulativePnlUsd += pnlUsd;
      const roiOnCapital = capitalDeployed > 0 ? cumulativePnlUsd / capitalDeployed : 0;
      equityPoints.push({
        date: new Date(ts * 1000).toISOString().slice(0, 10),
        cumulativePnlPct: roiOnCapital,
      });
    }
  }

  const tradeCount = closedTrades.length;
  const winners = closedTrades.filter((t) => t.pnlUsd > 0);
  const winRate = tradeCount > 0 ? winners.length / tradeCount : 0;
  const avgWinnerGain =
    winners.length > 0
      ? winners.reduce((s, t) => s + t.pnlPct, 0) / winners.length
      : 0;

  const roi = capitalDeployed > 0 ? cumulativePnlUsd / capitalDeployed : 0;

  let peak = 0;
  let maxDrawdown = 0.01;
  for (const point of equityPoints) {
    peak = Math.max(peak, point.cumulativePnlPct);
    const dd = peak - point.cumulativePnlPct;
    maxDrawdown = Math.max(maxDrawdown, dd);
  }
  maxDrawdown = Math.max(maxDrawdown, 0.01);

  const riskAdjRoi = roi / maxDrawdown;

  return {
    wallet: address,
    window: null,
    roi,
    maxDrawdown,
    riskAdjRoi,
    winRate,
    avgWinnerGain,
    percentile: 0,
    tradeCount,
    volumeUsd,
    windowDays,
    equityCurve: equityPoints,
    closedTrades,
  };
}

export function inferChains(transfers) {
  const chains = new Set();
  for (const t of transfers) {
    if (t.chain) chains.add(t.chain);
  }
  return [...chains];
}

export function scoreWalletAllWindows(address, transfers) {
  const scores = {};
  const equityCurve = {};
  for (const [window, days] of Object.entries(WINDOW_DAYS)) {
    const result = scoreTransfers(address, transfers, days);
    scores[window] = {
      wallet: address,
      window,
      roi: result.roi,
      maxDrawdown: result.maxDrawdown,
      riskAdjRoi: result.riskAdjRoi,
      winRate: result.winRate,
      avgWinnerGain: result.avgWinnerGain,
      percentile: 0,
      tradeCount: result.tradeCount,
      volumeUsd: result.volumeUsd,
    };
    equityCurve[window] = result.equityCurve;
  }
  return {
    scores,
    equityCurve,
    chainsActive: inferChains(transfers),
    closedTrades90d: scoreTransfers(address, transfers, 90).closedTrades,
  };
}