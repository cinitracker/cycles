# 🌸 CTracker — Personal Cycle & BBT Tracker

A private, browser-based basal body temperature and cycle tracker built for someone with PCOS who wants real insights, not just a pretty app.

## Features

- 📈 **BBT Chart** — colour-coded by phase (follicular, fertile, ovulation, luteal, period, migraine)
- 🧠 **Cycle Analysis** — auto-detects ovulation via biphasic shift, calculates luteal phase length, predicts next period & fertile window
- 💬 **Daily AI Note** — a warm, personalised paragraph generated each time you log your temperature
- 🤖 **AI Chat** — ask anything about your data: fertile window, mucus patterns, headache timing, PCOS insights
- 💾 **localStorage persistence** — data stays on your device between sessions
- 📤 **Export / Import JSON** — back up your data anytime
- 📱 **PWA** — add to your phone's home screen and use like an app

## Deploying to GitHub Pages

### 1. Push to GitHub
Push this folder to a private GitHub repo.

### 2. Enable GitHub Pages
1. Go to your repo → **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)` → Save
4. Your site will be live at `https://yourusername.github.io/CTracker`

### 3. Add to your phone home screen
- **iPhone (Safari):** Open the URL → Share → "Add to Home Screen"
- **Android (Chrome):** Open the URL → ⋮ → "Add to Home Screen"

## Data & Privacy

- All cycle data is stored in your **browser's localStorage** — it never leaves your device
- The AI features (daily note + chat) use the Gemini API, called directly from your browser
- Export your data regularly as a JSON backup using the **⬇ Export JSON** button

## File Structure

```
CTracker/
├── index.html       # Main app
├── style.css        # Styles
├── script.js        # Logic, chart, Gemini AI calls
├── manifest.json    # PWA manifest
├── sw.js            # Service worker (offline support)
└── README.md        # This file
```

## Logging Tips (PCOS edition)

- Take your temperature at the **same time every morning**, before getting up
- Log cervical mucus daily — egg-white CM is shown in green on the chart
- With PCOS, ovulation can be delayed or happen at unexpected times — the biphasic shift detection will catch it when it happens
- Consistent logging over 2–3 cycles gives much richer pattern data