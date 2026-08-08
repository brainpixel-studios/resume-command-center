# How it works

Three pieces, all running locally:

1. **React SPA** (`src/App.jsx`, served by Vite on `:4000`) — the editor. Your résumé
   lives in your browser's `localStorage` under the key `rcc_public_v1`. Nothing is uploaded.
2. **Express bridge** (`server.mjs` on `:4010`) — two jobs: render a PDF via
   `render-pdf.py` (reportlab), and forward ✦ AI requests to your chosen provider.
3. **Provider adapters** (`providers.mjs`) — two types cover every model:
   - `cli` — spawns a local binary (`claude`, `gemini`, `codex`); available when it's on your PATH.
   - `openai-compatible` — one HTTP shape (OpenAI, Grok, Mistral, Groq, DeepSeek, local Ollama);
     available when its API key is set in `.env`.

**Data flow of a ✦ generate:** the SPA POSTs `{provider, system, prompt}` to `/complete`;
the bridge dispatches to the adapter; the model's reply comes back as `{text}` and lands in
a résumé variant you can accept or discard.

**Where your data goes:** your documents stay on your machine; AI prompts go to whichever model you connect. The bridge holds no state and writes no files except the PDF you export.
