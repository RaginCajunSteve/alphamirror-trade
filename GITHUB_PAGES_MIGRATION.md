# Moving alphamirror.trade frontend to GitHub Pages

## What was done
- Updated `next.config.ts` to support static export when `BUILD_STATIC=true`.
- Created `scripts/build-static.mjs` that:
  - Backs up `app/api` (and other dynamic routes like dashboard/status/support) because they require a server.
  - Runs `next build` with static export.
  - Restores the backed up folders.
- Converted `/leaderboard` to a client component that fetches live data from `/api/leaderboard` (or `NEXT_PUBLIC_API_BASE`).
- Added `generateStaticParams()` to dynamic wallet pages so they pre-render for known addresses.
- Added npm script + GitHub Action workflow (`.github/workflows/deploy-pages.yml`) for automatic deploys.
- The static output lives in `./out/` after a successful `npm run build:static`.

## Current split after migration
- **Static UI / marketing / leaderboard snapshot or live via API** → GitHub Pages (alphamirror.trade)
- **All /api/* , dashboard functionality, Stripe, live mirrors, indexing workers, support** → Stay on Cloudflare Workers (your existing alpha-wallet-mirror Worker + others)

## How to connect your GitHub account and deploy

1. Create a new repo on GitHub (under your account):
   - Recommended name: `alphamirror-trade` or `alphamirror-frontend`
   - Make it public (required for free GitHub Pages custom domains on some plans).

2. (Optional but recommended) Copy or init the relevant frontend source into that repo (or keep everything in this monorepo and just use the workflow).

3. Push:
   ```bash
   git init
   git add .
   git commit -m "Prepare for GitHub Pages static hosting"
   git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

4. In the GitHub repo:
   - Go to **Settings > Pages**
   - Under "Build and deployment", Source = **GitHub Actions** (the workflow we added will be used).
   - Add Custom domain: `alphamirror.trade`
   - Save. GitHub will give you DNS instructions (usually a CNAME file or verification).

5. Set repository variables (Settings > Secrets and variables > Actions > Variables):
   - `NEXT_PUBLIC_API_BASE` = URL of a Worker that still serves your APIs
     Example: `https://alpha-wallet-mirror.<your-cloudflare-sub>.workers.dev`
     Or create `api.alphamirror.trade` pointing at a Worker and use `https://api.alphamirror.trade`

6. (First time) Trigger the workflow manually from the Actions tab.

## DNS changes on Cloudflare (alphamirror.trade zone)

Remove or replace the current proxied Worker A records.

Add these (DNS only / proxy **off** / grey cloud):

**Apex (alphamirror.trade):**
- A 185.199.108.153
- A 185.199.109.153
- A 185.199.110.153
- A 185.199.111.153
- AAAA 2606:50c0:8000::153
- AAAA 2606:50c0:8001::153
- AAAA 2606:50c0:8002::153
- AAAA 2606:50c0:8003::153

**www:**
- CNAME www.alphamirror.trade → YOUR_USERNAME.github.io.   (or the repo-specific if using project pages)

You can do this in the dashboard or adapt `scripts/fix-dns.mjs`.

After DNS change, it may take a few minutes for GitHub to verify the custom domain and issue the cert.

## Making /api work on the same domain (advanced)

Option A (recommended for simplicity): Use a different hostname for APIs.
- In Cloudflare, attach your main Worker (or a dedicated API worker) to `api.alphamirror.trade`.
- Set `NEXT_PUBLIC_API_BASE=https://api.alphamirror.trade`

Option B: Keep Cloudflare proxy in front of GitHub Pages + a small Worker that proxies only /api/* paths to your existing Worker. More complex.

## Notes / Limitations
- Dashboard, status, support, and live mirror actions require the Cloudflare backend — they will 404 or not work on the pure static site.
- Leaderboard will be live as long as `NEXT_PUBLIC_API_BASE` is correct (client-side fetch).
- Stats on the homepage are a build-time snapshot (you can improve by making the home also client-fetch stats).
- Rebuilds on GitHub Actions will update the site (you can add a schedule or manual button).
- You can continue using the existing `npm run deploy:cf` for the full dynamic version on a staging or api subdomain if needed.

## Local testing of the static site
```bash
npm run build:static
npx serve out
# open http://localhost:3000
```

## Reverting
Point DNS back to the Cloudflare Worker (the placeholder A records + proxied, or re-run your domain configuration scripts).

The original OpenNext + CF deploy path is untouched.

Good luck — the frontend source + build is now ready for GitHub Pages!
