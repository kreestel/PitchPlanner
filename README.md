# PitchPlanner

PitchPlanner turns text from presentation PDFs and your own slide notes into an editable, slide-by-slide speaking script. Each PDF page is one slide. PDF text extraction and page previews happen in your browser; slide images are not sent to the AI or interpreted. The prototype supports up to 20 pages and 10 MB per PDF.

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
