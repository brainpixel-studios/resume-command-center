// providers.mjs — provider-agnostic AI adapters.
//
// Two adapter TYPES cover the whole model list:
//   'cli'               — spawn a local binary (available when it is on PATH)
//   'openai-compatible' — one HTTP shape (available when its API key env is set)
// Adding a vendor is one registry entry, not a new code path. All functions here
// are pure: PATH lookup is injected as `isOnPath`, env is passed in.

export const PROVIDERS = [
  // --- CLI adapters: `args(fullPrompt)` returns argv after `bin`. ---
  // NOTE: only `claude -p` is verified (it matches the source repo). The gemini/codex
  // arg templates are best-guess — confirm each against `<bin> --help` before relying on
  // it. A wrong flag only breaks that one provider (it is availability-gated), never the app.
  { id: 'claude', label: 'Claude (CLI)', type: 'cli', bin: 'claude',
    args: (p) => ['-p', p], hint: 'install the Claude CLI, then run `claude`' },
  { id: 'gemini', label: 'Gemini (CLI)', type: 'cli', bin: 'gemini',
    args: (p) => ['-p', p], hint: 'install the gemini CLI' },   // arg template UNVERIFIED
  { id: 'codex', label: 'Codex (CLI)', type: 'cli', bin: 'codex',
    args: (p) => ['exec', p], hint: 'install the codex CLI' },   // arg template UNVERIFIED

  // --- OpenAI-compatible adapters: same chat-completions shape, different base_url + key. ---
  { id: 'openai', label: 'OpenAI', type: 'openai-compatible',
    baseUrl: 'https://api.openai.com/v1', keyEnv: 'OPENAI_API_KEY',
    modelEnv: 'OPENAI_MODEL', defaultModel: 'gpt-4o', hint: 'set OPENAI_API_KEY' },
  { id: 'xai', label: 'Grok (xAI)', type: 'openai-compatible',
    baseUrl: 'https://api.x.ai/v1', keyEnv: 'XAI_API_KEY',
    modelEnv: 'XAI_MODEL', defaultModel: 'grok-2-latest', hint: 'set XAI_API_KEY' },
  { id: 'mistral', label: 'Mistral', type: 'openai-compatible',
    baseUrl: 'https://api.mistral.ai/v1', keyEnv: 'MISTRAL_API_KEY',
    modelEnv: 'MISTRAL_MODEL', defaultModel: 'mistral-large-latest', hint: 'set MISTRAL_API_KEY' },
  { id: 'groq', label: 'Groq', type: 'openai-compatible',
    baseUrl: 'https://api.groq.com/openai/v1', keyEnv: 'GROQ_API_KEY',
    modelEnv: 'GROQ_MODEL', defaultModel: 'llama-3.3-70b-versatile', hint: 'set GROQ_API_KEY' },
  { id: 'deepseek', label: 'DeepSeek', type: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com/v1', keyEnv: 'DEEPSEEK_API_KEY',
    modelEnv: 'DEEPSEEK_MODEL', defaultModel: 'deepseek-chat', hint: 'set DEEPSEEK_API_KEY' },
  // Local Ollama: no key. Opt-in by setting OLLAMA_MODEL; base_url overridable.
  { id: 'ollama', label: 'Ollama (local)', type: 'openai-compatible',
    baseUrl: 'http://127.0.0.1:11434/v1', baseUrlEnv: 'OLLAMA_BASE_URL', keyEnv: null,
    enabledEnv: 'OLLAMA_MODEL', modelEnv: 'OLLAMA_MODEL', defaultModel: 'llama3.1',
    hint: 'run `ollama serve` and set OLLAMA_MODEL' },
];

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}

export function isAvailable(provider, { env = {}, isOnPath } = {}) {
  if (!provider) return false;
  if (provider.type === 'cli') return Boolean(isOnPath && isOnPath(provider.bin));
  if (provider.keyEnv) return Boolean(env[provider.keyEnv]);
  if (provider.enabledEnv) return Boolean(env[provider.enabledEnv]);
  return false;
}

export function listProviders({ env = {}, isOnPath } = {}) {
  return PROVIDERS.map((p) => ({
    id: p.id, label: p.label, type: p.type,
    available: isAvailable(p, { env, isOnPath }),
    hint: p.hint,
  }));
}

export function composePrompt(system, prompt) {
  return system ? `${system}\n\n---\n\n${prompt}` : prompt;
}

export function buildCliCommand(provider, fullPrompt) {
  return { bin: provider.bin, args: provider.args(fullPrompt) };
}

export function buildOpenAIRequest(provider, { system, prompt, env = {} }) {
  const baseUrl = (provider.baseUrlEnv && env[provider.baseUrlEnv]) || provider.baseUrl;
  const model = (provider.modelEnv && env[provider.modelEnv]) || provider.defaultModel;
  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });
  const headers = { 'Content-Type': 'application/json' };
  if (provider.keyEnv && env[provider.keyEnv]) {
    headers.Authorization = `Bearer ${env[provider.keyEnv]}`;
  }
  return {
    url: `${baseUrl}/chat/completions`,
    headers,
    body: { model, messages, temperature: 0.7 },
  };
}
