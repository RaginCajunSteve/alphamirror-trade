import {
  BASE_MAINNET_MIGRATION_STEPS,
  NETWORK_MODE,
  keeperWatchChainsLabel,
  leaderboardChainsLabel,
  liveExecutionNetworksLabel,
  siteStatusSummary,
} from "@/lib/network-config";
import {
  getMirrorRouterAddressForChain,
  liveExecutionChainsDeployed,
} from "@/lib/contracts/mirror-router";

type Props = {
  showMigrationPlan?: boolean;
};

export function NetworkStatusBanner({ showMigrationPlan = false }: Props) {
  const deployed = liveExecutionChainsDeployed();
  const liveNetworks = liveExecutionNetworksLabel();

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm space-y-3">
      <p className="font-medium text-foreground">{siteStatusSummary()}</p>
      <ul className="space-y-1.5 text-muted list-disc list-inside">
        <li>
          <strong className="text-foreground">Leaderboard index</strong>: {leaderboardChainsLabel()}{" "}
          mainnet
        </li>
        <li>
          <strong className="text-foreground">Keeper watch</strong> (alpha activity):{" "}
          {keeperWatchChainsLabel()} mainnet
        </li>
        <li>
          <strong className="text-foreground">Live execution networks</strong>: {liveNetworks}
          {deployed.length > 0 ? (
            <ul className="mt-1 ml-4 list-none space-y-0.5">
              {deployed.map((cfg) => {
                const addr = getMirrorRouterAddressForChain(cfg.chainKey);
                return (
                  <li key={cfg.chainKey} className="text-xs">
                    {cfg.label}:{" "}
                    <span className="font-mono text-accent">{addr?.slice(0, 10)}…</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            " · router not configured"
          )}
        </li>
        <li>
          <strong className="text-foreground">Paper mirrors</strong> simulate PnL when activity is
          detected — no funds move.
        </li>
        <li>
          <strong className="text-foreground">Live mirrors</strong> submit on-chain txs on{" "}
          {liveNetworks} when your mirror includes those chains and allowances are set.
        </li>
      </ul>
      {NETWORK_MODE === "testnet" && (
        <p className="text-xs text-muted">
          Stripe billing is live (production). On-chain mirroring uses testnet funds until{" "}
          <code className="text-accent">NETWORK_MODE=mainnet</code> is enabled.
        </p>
      )}
      {showMigrationPlan && NETWORK_MODE === "testnet" && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer text-foreground font-medium">
            Base mainnet migration plan
          </summary>
          <ol className="mt-2 list-decimal list-inside space-y-1">
            {BASE_MAINNET_MIGRATION_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}