import {
  getMirrorRouterAddressForChain,
  liveExecutionChainsDeployed,
} from "@/lib/contracts/mirror-router";
import { liveExecutionNetworksLabel } from "@/lib/network-config";

export function DeployGuide() {
  const deployed = liveExecutionChainsDeployed();

  if (deployed.length > 0) {
    return (
      <div className="rounded-lg border border-accent/30 bg-accent/10 px-4 py-3 text-sm space-y-2">
        <p className="font-medium text-accent">MirrorRouter — live execution networks</p>
        <ul className="space-y-1.5 text-xs">
          {deployed.map((cfg) => {
            const addr = getMirrorRouterAddressForChain(cfg.chainKey);
            return (
              <li key={cfg.chainKey}>
                <strong className="text-foreground">{cfg.label}:</strong>{" "}
                <span className="font-mono text-muted">{addr}</span>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-muted">
          MetaMask must be on each selected network ({liveExecutionNetworksLabel()}) to approve
          USDC and set live config.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-2 px-4 py-3 text-sm text-muted space-y-2">
      <p>
        <strong className="text-foreground">Live mirror</strong> needs MirrorRouter on{" "}
        {liveExecutionNetworksLabel()}.
      </p>
      <ol className="list-decimal list-inside space-y-1 text-xs">
        <li>Get testnet ETH on Base Sepolia</li>
        <li>
          Set <code className="text-accent">DEPLOYER_PRIVATE_KEY</code> in{" "}
          <code>.env.local</code>
        </li>
        <li>
          Run <code className="text-accent">npm run deploy:router</code>
        </li>
        <li>
          Add <code className="text-accent">NEXT_PUBLIC_MIRROR_ROUTER_ADDRESS</code> to{" "}
          <code>.env.local</code> and restart
        </li>
      </ol>
    </div>
  );
}