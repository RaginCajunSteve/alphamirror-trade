import { createConfig, createStorage, http } from "wagmi";
import { mainnet, base, baseSepolia, arbitrum, optimism } from "wagmi/chains";
import { injected, metaMask } from "wagmi/connectors";

export const wagmiConfig = createConfig({
  chains: [mainnet, base, baseSepolia, arbitrum, optimism],
  connectors: [
    metaMask(),
    injected({ shimDisconnect: true }),
  ],
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
  },
  storage: createStorage({
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
  }),
  ssr: true,
});