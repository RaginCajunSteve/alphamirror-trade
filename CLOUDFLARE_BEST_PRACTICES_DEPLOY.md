# Recommended Architecture & Deployment for alphamirror.trade

## Best Option for Performance + Operations (Recommended)

**GitHub (source control + CI) + Cloudflare Workers (via OpenNext) as the primary hosting for the full site.**

### Why this is the best choice
- **Performance**: The full Next.js app (server components, API routes, dynamic data fetching for leaderboard, wallet pages, mirroring flows) runs on Cloudflare Workers at the edge. Extremely low latency worldwide. No extra network hops.
- **Feature fidelity**: Your current architecture (server rendering + rich client wallet features + heavy backend integration) works without major rewrites.
- **Ecosystem fit**: Everything (DNS, custom domain, KV, D1, multiple supporting Workers, email, Turnstile) stays inside Cloudflare.
- **No local machine dependency**: Once set up, `git push` is all you need for production updates.
- **GitHub Pages is unnecessary** — we are using Cloudflare for hosting.

This is better than pure static export to GitHub Pages or Pages-only for your use case.

### High-level flow after this change
- All source code lives in **your GitHub repo**.
- On every push to `main`:
  - GitHub Actions builds and deploys the main Next.js app (the website) to the `alpha-wallet-mirror` Worker.
  - Background workers can be deployed on demand or on path changes.
- The running site at `https://alphamirror.trade` is 100% powered by Cloudflare.
- Your local computer is only for development (`npm run dev`).

### Optional Enhancement: Hybrid Cloudflare Pages + Workers (for even faster static content)
If you want maximum speed for the marketing/landing experience:
- Deploy a **static export** of the marketing pages + leaderboard shell to **Cloudflare Pages** (superb CDN + caching).
- Keep the dynamic parts (dashboard, actual mirroring, detailed data fetching) calling the Worker APIs.
- Frontend uses `NEXT_PUBLIC_API_BASE=https://alphamirror.trade` (or a dedicated `api.alphamirror.trade`).

This gives the absolute best of static performance + full dynamic power. The workflow below includes a commented section for this.

### Step-by-step: Move everything off your computer

1. **Push code to GitHub (your account)**
   - Create a new repo if you haven't (e.g. `alphamirror-trade`).
   - Push the `alpha-wallet-mirror` folder (or the whole thing).
   - This becomes the single source of truth.

2. **Create a Cloudflare API Token for CI**
   - Go to Cloudflare dashboard → Profile → API Tokens.
   - Create a token with these permissions:
     - Account: Workers Scripts → Edit
     - (Add more if you upload KV data or manage DNS)
   - Copy the token.

3. **Add the token as a GitHub Secret**
   - In your GitHub repo: Settings → Secrets and variables → Actions → New repository secret
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: the token from step 2

4. **(Optional) Add public environment variables**
   - You can store `NEXT_PUBLIC_*` values as GitHub repo **Variables** and reference them in the workflow.

5. **Push to main** — the new `deploy-cloudflare.yml` workflow will run and deploy the main site.

### Files you care about for deploys
- `.github/workflows/deploy-cloudflare.yml` (new, recommended)
- `scripts/deploy-cf.mjs` (now CI-aware)
- `wrangler.jsonc` (main app config + custom domain routes)
- Other `wrangler.*.jsonc` for background workers

### One-time / manual tasks that stay outside CI
- Pushing secrets (`npm run secrets:stripe`, etc.) — do these locally or add dedicated steps.
- Running indexers, cost approvals, one-off maintenance.
- Initial project creation on Cloudflare.

### After setup — you are fully off the local computer for production
- Website files (code) → GitHub
- Built & running site → Cloudflare Workers (and optionally Pages)
- Data → Cloudflare KV / D1
- All deploys automated

### Commands that will still work locally
```bash
npm run dev                 # local development
npm run build:static        # test static export
node scripts/build-static.mjs
```

Production deploys should now come from CI.

### Rollback / Safety
- Every deploy creates a new version in Cloudflare. You can roll back from the Workers dashboard.
- The workflow uses concurrency groups to avoid overlapping deploys.

### Questions this architecture answers
- Best performance? Yes — edge Workers + Cloudflare network.
- Full Next.js features? Yes.
- Move files off my computer? Yes (source to GitHub, runtime entirely on Cloudflare).
- Do I need GitHub Pages? No.
- Can I still use Pages? Yes, optionally for static parts (see workflow).

This is the configuration that makes the most technical sense for alphamirror.trade today.

If you want to go even further into a pure Pages + Functions model in the future, we can migrate step by step. But for now, this gives the best balance of performance, maintainability, and your existing investment.