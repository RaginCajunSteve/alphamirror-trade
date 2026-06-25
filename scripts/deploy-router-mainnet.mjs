process.env.NETWORK_MODE = "mainnet";
process.env.DEPLOY_NETWORK = "mainnet";
process.env.RPC_URL = "https://mainnet.base.org";
await import("./deploy-mirror-router.mjs");