# Deploying PhysicianTradeOffs to Vercel

The application is pre-configured for Vercel deployment with serverless execution, static asset optimization, and automatic database fallback.

---

## Quick Deploy via GitHub (Recommended)

### Step 1: Create a GitHub Repository
1. Go to [github.com/new](https://github.com/new).
2. Name your repository (e.g., `physician-tradeoffs`).
3. Leave it public or private, without initializing README (it is already committed).

### Step 2: Push Your Local Code to GitHub
Run the following in your terminal:

```bash
cd /home/abdullah/playwright_prc/physicians_project

# Link to your new GitHub repository
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/physician-tradeoffs.git

# Push to main
git push -u origin main
```

### Step 3: Deploy on Vercel
1. Go to [vercel.com/new](https://vercel.com/new).
2. Connect your GitHub account and click **Import** next to `physician-tradeoffs`.
3. In Project Settings:
   - **Framework Preset**: Select **Other** (Zero configuration needed).
   - **Root Directory**: `./` (leave default).
4. *(Optional)* If you want live cloud PostgreSQL (e.g. Supabase, Neon):
   - Add Environment Variable:
     - `DATABASE_URL` = `postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/[DATABASE]`
   - If omitted, the app runs in **High-Performance Dataset Mode**, instantly serving all 88+ scraped jobs and all 5 trade-off advisors from the embedded dataset with zero latency.
5. Click **Deploy**.

Your application will be live at `https://your-project.vercel.app` in ~30 seconds!

---

## Alternative: Deploy via Vercel CLI

If you prefer using the terminal CLI:

```bash
cd /home/abdullah/playwright_prc/physicians_project

# 1. Login to Vercel CLI (or provide a Vercel Personal Access Token)
vercel login

# 2. Deploy directly to production
vercel --prod
```

---

## Included Vercel Architecture Files

| File | Purpose |
| :--- | :--- |
| [`vercel.json`](file:///home/abdullah/playwright_prc/physicians_project/vercel.json) | Routes `/api/*` to the serverless function and serves `public/` assets statically. |
| [`api/index.js`](file:///home/abdullah/playwright_prc/physicians_project/api/index.js) | Serverless function handler wrapping the Express.js application. |
| [`.vercelignore`](file:///home/abdullah/playwright_prc/physicians_project/.vercelignore) | Prevents local Docker data (`pgdata`), scrapers, and dev dependencies from uploading. |
| [`package.json`](file:///home/abdullah/playwright_prc/physicians_project/package.json) | Configured with `node >= 18.x` engine and start commands. |
| [`server.js`](file:///home/abdullah/playwright_prc/physicians_project/server.js) | Auto-detects serverless mode vs local Docker mode, bypassing port binding on Vercel. |
