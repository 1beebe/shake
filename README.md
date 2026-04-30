# SHAKE 🎱

A magic 8-ball that hunts the history of popular music for songs about shaking. Shake your device (or tap the ball) to reveal a lyric, hear a 30-second preview, and keep listening on Spotify, YouTube, or Apple Music.

## Deploy to Vercel

1. **Push this repo to GitHub**

2. **Connect to Vercel**
   - Go to [vercel.com](https://vercel.com) and import the GitHub repo
   - Vercel will auto-detect the Vite + React setup

3. **Add your API key**
   - In Vercel dashboard → Settings → Environment Variables
   - Add: `ANTHROPIC_API_KEY` = your key from [console.anthropic.com](https://console.anthropic.com)

4. **Deploy** — Vercel builds and deploys automatically on every push

## Local Development

```bash
npm install
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local
npm run dev
```

## How it works

- **Shake / tap** triggers a call to `/api/shake` — a Vercel serverless function that calls the Anthropic API server-side (your key never touches the frontend)
- **iTunes API** fetches a 30-second audio preview and album art (no key required)
- **Streaming links** open Spotify, YouTube, and Apple Music searches for the song

## Built with

- React + Vite
- Anthropic Claude API
- iTunes Search API
- Vercel serverless functions
