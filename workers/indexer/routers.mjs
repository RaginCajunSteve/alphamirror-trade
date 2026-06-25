/** DEX routers for trader discovery (transfers/swaps into router). */
export const DISCOVERY_ROUTERS = {
  ethereum: [
    "0xE592427A0AEce92De3Edee1F18E0157C05861564",
    "0x68B3465833fB72A70Ecdf485E0E4C7B259FF2A24",
    "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  ],
  base: [
    "0x2626664c2603336E57B271c5C0b26F421741e481",
    "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  ],
  arbitrum: [
    "0x68B3465833fB72A70Ecdf485E0E4C7B259FF2A24",
    "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  ],
  polygon: [
    "0x68B3465833fB72A70Ecdf485E0E4C7B259FF2A24",
    "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
    "0xf5b509bB0909a69B278c265d9Db7A4c782518e92",
  ],
  unichain: [
    "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
    "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
  ],
  linea: [
    "0x68B3465833fB72A70Ecdf485E0E4C7B259FF2A24",
    "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  ],
  blast: [
    "0x2626664c2603336E57B271c5C0b26F421741e481",
    "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  ],
  optimism: [
    "0x68B3465833fB72A70Ecdf485E0E4C7B259FF2A24",
    "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  ],
  bsc: [
    "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4",
    "0x10ED43C718714eb63d5aA57B78B54704E256024E",
  ],
  avalanche: [
    "0xBBBfd1D42F9F9952b5244697577BE823fabe0202",
    "0xE54Ca86531e17Ef3616d22Ca28b0D458b6C89106",
    "0x60ae616A2155EE3d9a68541BAaE4CB6512dD0e4F",
  ],
  scroll: [
    "0xFD541D0e2773a189450A70F06bC7eDd3C1DC9115",
    "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD",
  ],
};

/** Free-tier Etherscan tokentx + txlist (phase 1). */
export const ETHERSCAN_CHAINS = [
  "ethereum",
  "arbitrum",
  "polygon",
  "unichain",
  "linea",
  "blast",
];
export const ETHERSCAN_DISCOVERY_CHAINS = ETHERSCAN_CHAINS;

/**
 * Alchemy getAssetTransfers — Base, OP, BSC, Avalanche, Scroll on free tier (phase 2+).
 * Avalanche/Scroll: Snowtrace/Scrollscan free tier blocked; Alchemy is primary path.
 */
export const ALCHEMY_PRIMARY_CHAINS = [
  "base",
  "optimism",
  "bsc",
  "avalanche",
  "scroll",
];
export const ALCHEMY_DISCOVERY_CHAINS = ALCHEMY_PRIMARY_CHAINS;

/** RPC log crawl when Alchemy is unavailable (Base/OP/BSC only — AVAX/Scroll are Alchemy-only). */
export const RPC_PRIMARY_CHAINS = ["base", "optimism", "bsc"];

/**
 * Chain expansion tiers — monetization alignment:
 *   Tier A: profit-priority watch chains (Polygon + new AVAX/Scroll liquidity)
 *   Tier B: later expansion (Mantle, zkSync, Mode) — not wired yet
 */
export const CHAIN_EXPANSION_TIER = {
  tierA: ["polygon", "avalanche", "scroll"],
  tierB: ["mantle", "zksync", "mode"],
};

export const WATCH_CHAINS = [
  "ethereum",
  "base",
  "arbitrum",
  "polygon",
  "unichain",
  "linea",
  "blast",
  "optimism",
  "bsc",
  "avalanche",
  "scroll",
];