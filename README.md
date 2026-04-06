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

## Setup

### 1. Fork & publish on GitHub Pages

1. Fork this repo (or create a new one and upload these files)
2. Go to **Settings → Pages**
3. Set source to `main` branch, `/ (root)` folder
4. Your app will be live at `https://yourusername.github.io/CTracker`

### 2. Add to your phone home screen

- **iPhone (Safari):** Open the GitHub Pages URL → Share button → "Add to Home Screen"
- **Android (Chrome):** Open the URL → ⋮ menu → "Add to Home Screen" or "Install App"

### 3. Set up AI features (optional but lovely)

The daily note and chat use the [Anthropic API](https://console.anthropic.com).

1. Create a free account at [console.anthropic.com](https://console.anthropic.com)
2. Generate an API key
3. In the app, expand **⚙ Set Anthropic API Key** at the bottom of the page
4. Paste your key — it's stored only in your browser's localStorage, never sent anywhere except Anthropic's API

## Data & Privacy

- All cycle data is stored in your **browser's localStorage** — it never leaves your device
- The AI features send your cycle summary to Anthropic's API only when you log a new entry or send a chat message
- Export your data regularly as a JSON backup using the **⬇ Export JSON** button

## File Structure

```
CTracker/
├── index.html      # Main app
├── style.css       # Styles
├── script.js       # Logic, chart, AI calls
├── manifest.json   # PWA manifest
├── sw.js           # Service worker (offline support)
└── README.md       # This file
```

## Logging Tips (PCOS edition)

- Take your temperature **at the same time every morning**, before getting up
- Log cervical mucus daily — egg-white CM is shown in green on the chart
- With PCOS, ovulation can be delayed or happen at unexpected times — the biphasic shift detection will catch it when it happens
- Consistent logging over 2–3 cycles gives much richer pattern data
