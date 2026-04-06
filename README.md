# 🌸 CTracker — Personal Cycle & BBT Tracker

A private, browser-based basal body temperature and cycle tracker built for someone with PCOS.

## Deploying to Netlify (free)

### 1. Push to GitHub
Push this folder to any GitHub repo — public is fine, the API key is never in the code.

### 2. Connect to Netlify
1. Go to [netlify.com](https://netlify.com) and log in
2. Click **"Add new site" → "Import an existing project"**
3. Connect GitHub and select this repo
4. Leave build settings blank (no build command, publish directory is `.`)
5. Click **Deploy site**

### 3. Add your API key
1. In Netlify: **Site configuration → Environment variables → Add a variable**
2. Key: `ANTHROPIC_API_KEY`  Value: your key from [console.anthropic.com](https://console.anthropic.com)
3. Save, then **Trigger redeploy**

### 4. Add to phone home screen
- **iPhone:** Open Netlify URL in Safari → Share → "Add to Home Screen"
- **Android:** Open URL in Chrome → ⋮ → "Add to Home Screen"
