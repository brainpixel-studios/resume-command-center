# Resume Command Center

A local-first résumé editor with AI-assisted tailoring. Bring your own model — any CLI on
your PATH (Claude, Gemini, Codex) or any OpenAI-compatible API key (OpenAI, Grok, Mistral,
Groq, DeepSeek, local Ollama).

> **Privacy:** your documents stay on your machine; AI prompts go to whichever model you connect. Résumé content is kept in your browser's local storage; the local backend only renders PDFs and relays AI requests to the provider you choose.

## Quick start

```bash
npm install
pip install -r requirements.txt        # PDF export (into the python3 on your PATH)
cp .env.example .env                  # add a key if you want an API provider
npm run dev                           # frontend :4000 + backend :4010
```
Open http://127.0.0.1:4000.

## Connecting an AI provider

- **CLI (no key):** install the tool so it's on your PATH — e.g. the Claude, `gemini`, or
  `codex` CLI. It appears in the provider dropdown automatically.
- **API key:** copy `.env.example` to `.env` and set the relevant key (e.g. `OPENAI_API_KEY`).
  Unavailable providers stay greyed out in the dropdown with a hint for what to set.

The ✦ buttons (generate bullet / summary / achievements / competencies, tailor to a job
target, analyze gaps) all run through the selected provider. If no provider is connected,
they disable themselves.

## Toolchain

React + Vite (frontend) · Node/Express (`server.mjs`) · Python + reportlab (`render-pdf.py`) ·
Vitest + pytest (tests). PDF export needs Python 3 with reportlab (see requirements.txt). Run the Python tests with pip install -r requirements-dev.txt then pytest.

## License

MIT © 2026 Brainpixel Studios
