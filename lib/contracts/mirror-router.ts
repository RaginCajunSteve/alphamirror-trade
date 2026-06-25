import type { Chain as ViemChain } from "viem/chains";
import type { Chain } from "../types";
import {
  getExecutionChainConfig,
  getMirrorRouterAddressForChain,
} from "../execution-config";

export {
  canExecuteLiveOnChain,
  defaultLiveMirrorChainKeys,
  getMirrorRouterAddressForChain,
  liveExecutionChainsDeployed,
  liveExecutionChainsWithRouter,
  liveExecutionSummary,
} from "../execution-config";

export const mirrorRouterAbi = [
  {
    type: "function",
    name: "setMirrorConfig",
    stateMutability: "nonpayable",
    inputs: [
      { name: "alphaWallet", type: "address" },
      { name: "maxPerTradeUsd", type: "uint256" },
      { name: "maxDailyUsd", type: "uint256" },
      { name: "userRatioBps", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "pauseMirror",
    stateMutability: "nonpayable",
    inputs: [{ name: "alphaWallet", type: "address" }],
    outputs: [],
  },
] as const;

export const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

/** @deprecated Use getMirrorRouterAddressForChain("base") */
export function getMirrorRouterAddress(): `0x${string}` | undefined {
  return getMirrorRouterAddressForChain("base");
}

/** @deprecated Use getExecutionChainConfig(chain) */
export function getExecutionViemChain(chainKey: Chain = "base"): ViemChain {
  return getExecutionChainConfig(chainKey)!.viemChain;
}

/** @deprecated Use getExecutionChainConfig(chain).usdcAddress */
export function getExecutionUsdcAddress(chainKey: Chain = "base"): `0x${string}` {
  return getExecutionChainConfig(chainKey)!.usdcAddress;
}