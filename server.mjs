import express from 'express';
import cors from 'cors';
import { execFile, spawn, spawnSync } from 'child_process';
import { promisify } from 'util';
import { readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  listProviders, getProvider, composePrompt,
  buildCliCommand, buildOpenAIRequest,
} from './providers.mjs';

// Availability probe for `cli` providers: is the binary resolvable on PATH?
function isOnPath(bin) {
  const which = process.platform === 'win32' ? 'where' : 'which';
  try { return spawnSync(which, [bin], { stdio: 'ignore' }).status === 0; }
  catch { return false; }
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const exec = promisify(execFile);
const app = express();
const PORT = process.env.RCC_PORT ? parseInt(process.env.RCC_PORT) : 4010;
const PDF_DIR = join(__dirname, '.tmp');

if (!existsSync(PDF_DIR)) mkdirSync(PDF_DIR, { recursive: true });

app.use(cors({ origin: 'http://127.0.0.1:4000' }));
app.use(express.json({ limit: '500kb' }));

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// List AI providers and whether each is currently usable on this machine.
app.get('/providers', (_req, res) => {
  res.json(listProviders({ env: process.env, isOnPath }));
});

// Provider-agnostic completion. Body: { provider?, system?, prompt }.
// Falls back to the first available provider when none is named.
app.post('/complete', async (req, res) => {
  const { provider: providerId, system, prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const list = listProviders({ env: process.env, isOnPath });
  const chosenId = providerId || list.find((p) => p.available)?.id;
  const chosen = list.find((p) => p.id === chosenId);
  if (!chosen) {
    return res.status(400).json({ error: `no usable AI provider (set an API key or install a CLI)` });
  }
  if (!chosen.available) {
    return res.status(400).json({ error: `provider "${chosen.label}" is not available`, hint: chosen.hint });
  }
  const provider = getProvider(chosenId);

  try {
    if (provider.type === 'cli') {
      const full = composePrompt(system, prompt);
      const { bin, args } = buildCliCommand(provider, full);
      const { stdout } = await exec(bin, args, {
        timeout: 60_000, maxBuffer: 1024 * 512,
        env: { ...process.env, NO_COLOR: '1' },
      });
      return res.json({ text: stdout.trim(), provider: provider.id });
    }

    // openai-compatible
    const { url, headers, body } = buildOpenAIRequest(provider, { system, prompt, env: process.env });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    // The timeout must span the body reads, not just the headers. fetch() resolves as soon
    // as response headers arrive, so clearing the timer at that point would leave r.text()
    // and r.json() unbounded — a vendor that sends headers and then stalls mid-body would
    // hang the request indefinitely, not merely overrun 60s. The shared controller.signal
    // aborts an in-flight body read, and the catch below maps AbortError to 504.
    try {
      const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 500);
        return res.status(502).json({ error: `${provider.label} request failed (${r.status})`, detail });
      }
      const j = await r.json();
      const text = j.choices?.[0]?.message?.content?.trim() ?? '';
      return res.json({ text, provider: provider.id });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.error(`Provider ${provider.id} error:`, err.stderr?.trim() || err.code || err.name);
    if (err.killed || err.name === 'AbortError') return res.status(504).json({ error: `${provider.label} timed out (60s)` });
    return res.status(500).json({ error: `${provider.label} failed`, detail: err.stderr?.trim() || err.code || 'provider command failed' });
  }
});

// PDF rendering endpoint
app.post('/pdf', async (req, res) => {
  const data = req.body;
  if (!data || !data.roles) return res.status(400).json({ error: 'Invalid resume data' });

  const outputPath = join(PDF_DIR, `resume-${Date.now()}.pdf`);
  const scriptPath = join(__dirname, 'render-pdf.py');

  try {
    const child = spawn('python3', [scriptPath, outputPath], { timeout: 30_000 });
    child.stdin.write(JSON.stringify(data));
    child.stdin.end();

    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });

    await new Promise((resolve, reject) => {
      child.on('close', code => {
        if (code === 0) resolve();
        else reject(new Error(`Python exit ${code}: ${stderr}`));
      });
      child.on('error', reject);
    });

    const pdf = readFileSync(outputPath);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="resume.pdf"');
    res.send(pdf);
  } catch (err) {
    console.error('PDF render error:', err.message);
    res.status(500).json({ error: 'PDF render failed', detail: err.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`\n  Resume Command Center — Backend`);
  console.log(`  → http://127.0.0.1:${PORT}`);
  console.log(`  → AI via your connected provider (CLI on PATH or API key)`);
  console.log(`  → PDF rendering via reportlab\n`);
});
