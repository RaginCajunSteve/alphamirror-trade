import type { Address } from "viem";
import type { Chain } from "@/lib/types";
import { detectRecentSwapActivity, type SwapActivity } from "./swaps";
import { getIndexerEnv, getRpcClient } from "./rpc-client";

const RPC_TIMEOUT_MS = 6_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("rpc timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export interface OnChainActivity {
  chain: Chain;
  txCount: number | null;
  error?: string;
}

export interface WalletEnrichment {
  address: string;
  activity: OnChainActivity[];
  swapActivity: SwapActivity[];
  totalTxCount: number;
  recentTransferCount: number;
  dexSwapCount: number;
  live: boolean;
  swapErrors: string[];
}

export async function enrichWallet(
  address: string,
  chains: Chain[],
): Promise<WalletEnrichment> {
  const env = await getIndexerEnv();

  const [activity, swapActivity] = await Promise.all([
    Promise.all(
      chains.map(async (chain): Promise<OnChainActivity> => {
        const client = getRpcClient(chain, env, RPC_TIMEOUT_MS);
        if (!client) {
          return { chain, txCount: null, error: "unsupported chain" };
        }
        try {
          const count = await withTimeout(
            client.getTransactionCount({ address: address as Address }),
            RPC_TIMEOUT_MS,
          );
          return { chain, txCount: Number(count) };
        } catch (err) {
          return {
            chain,
            txCount: null,
            error: err instanceof Error ? err.message : "rpc error",
          };
        }
      }),
    ),
    detectRecentSwapActivity(address, chains, env),
  ]);

  const totalTxCount = activity.reduce((sum, a) => sum + (a.txCount ?? 0), 0);
  const recentTransferCount = swapActivity.reduce(
    (sum, s) => sum + (s.recentTransfers ?? 0),
    0,
  );
  const dexSwapCount = swapActivity.reduce(
    (sum, s) => sum + (s.dexSwaps ?? 0),
    0,
  );
  const swapErrors = swapActivity
    .filter((s) => s.error)
    .map((s) => `${s.chain}: ${s.error}`);
  const live =
    activity.some((a) => a.txCount !== null) ||
    swapActivity.some((s) => s.recentTransfers !== null || s.dexSwaps !== null);

  return {
    address,
    activity,
    swapActivity,
    totalTxCount,
    recentTransferCount,
    dexSwapCount,
    live,
    swapErrors,
  };
}