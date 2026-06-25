import Link from "next/link";
import { notFound } from "next/navigation";
import fs from "fs";
import path from "path";
import { DeployGuide } from "@/components/DeployGuide";
import { MirrorConfigForm } from "@/components/MirrorConfigForm";
import { StrategyPlaybook } from "@/components/StrategyPlaybook";
import { getWalletFromIndexer } from "@/lib/indexer/leaderboard";
import { formatAddress } from "@/lib/scoring";

export async function generateStaticParams() {
  try {
    const dataDir = path.join(process.cwd(), "data");
    const eliteRaw = JSON.parse(fs.readFileSync(path.join(dataDir, "leaderboard-elite.json"), "utf8"));
    const candsRaw = JSON.parse(fs.readFileSync(path.join(dataDir, "leaderboard-candidates.json"), "utf8"));
    const eliteAddrs = (eliteRaw.wallets || eliteRaw || []).map((w: { address?: string }) => w.address).filter(Boolean) as string[];
    const candAddrs = (candsRaw.wallets || candsRaw || []).slice(0, 20).map((w: { address?: string }) => w.address).filter(Boolean) as string[];
    const all = Array.from(new Set([...eliteAddrs, ...candAddrs]));
    return all.map((address) => ({ address }));
  } catch {
    return [];
  }
}

export default async function CopyPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  const wallet = await getWalletFromIndexer(address);
  if (!wallet) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link href={`/wallet/${address}`} className="text-sm text-accent hover:underline">
          ← Back to wallet
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Copy strategy</h1>
        <p className="mt-2 font-mono text-muted">{formatAddress(wallet.address)}</p>
      </div>

      <StrategyPlaybook strategy={wallet.strategy} />
      <DeployGuide />
      <MirrorConfigForm alphaWallet={wallet.address} />
    </div>
  );
}