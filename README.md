# PitchPlanner

### Your slides are done. Now what the hell do you say?

We've all made the slides and then sat there like:

*"Okay... now what do I actually say?"*

So I made **PitchPlanner**.

Upload your presentation PDF, tell it who you're presenting to, how long you have, and what kind of tone you want, and it'll give you a speaking script for every slide.

No more reading your entire slide out loud, or forgetting what you wanted to say halfway through, or making a 20-slide presentation and having absolutely no idea how to present it

Each slide gets its own script, so you know what to say. (I hope so)

**Try it** **[PitchPlanner](https://pitchplannerr.netlify.app/)**

## Run locally

1. Install Node.js 20.9 or later.
2. In this folder run `npm install` (or `pnpm install`).
3. Copy `.env.example` to `.env.local`.
   - PowerShell: `Copy-Item .env.example .env.local`
   - macOS/Linux: `cp .env.example .env.local`
4. Add your API key to `OPENAI_API_KEY` in `.env.local`. Set `OPENAI_MODEL` to a model available to your API account (the default is `gpt-4.1-mini`). AI generation stays disabled until a key is configured.
5. Run `npm run dev` (or `pnpm dev`) and open http://localhost:3000.

The API key is read only by the server. Do not commit `.env.local`. Without a key, you can still upload PDFs, view extracted text and previews, and edit context; the app will not create placeholder scripts.

## Checks

Run `npm run typecheck` for TypeScript checks and `npm run build` for a production build.
