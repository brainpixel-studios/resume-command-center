import { describe, it, expect } from 'vitest';
import {
  PROVIDERS, listProviders, getProvider, isAvailable,
  composePrompt, buildCliCommand, buildOpenAIRequest,
} from './providers.mjs';

const onPath = (bins) => (bin) => bins.includes(bin);

describe('registry', () => {
  it('has unique ids and only known types', () => {
    const ids = PROVIDERS.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PROVIDERS) expect(['cli', 'openai-compatible']).toContain(p.type);
  });
});

describe('isAvailable', () => {
  it('cli: available iff the binary is on PATH', () => {
    const claude = getProvider('claude');
    expect(isAvailable(claude, { env: {}, isOnPath: onPath(['claude']) })).toBe(true);
    expect(isAvailable(claude, { env: {}, isOnPath: onPath([]) })).toBe(false);
  });
  it('openai-compatible: available iff the key env is set', () => {
    const openai = getProvider('openai');
    expect(isAvailable(openai, { env: { OPENAI_API_KEY: 'sk-x' }, isOnPath: onPath([]) })).toBe(true);
    expect(isAvailable(openai, { env: {}, isOnPath: onPath([]) })).toBe(false);
  });
  it('ollama: keyless, available iff its enabledEnv is set', () => {
    // ollama has `keyEnv: null`, so isAvailable falls through the keyEnv branch to enabledEnv.
    const ollama = getProvider('ollama');
    expect(isAvailable(ollama, { env: { OLLAMA_MODEL: 'llama3.1' }, isOnPath: onPath([]) })).toBe(true);
    expect(isAvailable(ollama, { env: {}, isOnPath: onPath([]) })).toBe(false);
    // baseUrlEnv is NOT an availability signal — it only redirects buildOpenAIRequest's URL.
    expect(isAvailable(ollama, { env: { OLLAMA_BASE_URL: 'http://box.local:11434/v1' }, isOnPath: onPath([]) })).toBe(false);
  });
});

describe('listProviders', () => {
  it('projects the public shape and computes availability', () => {
    const list = listProviders({ env: { OPENAI_API_KEY: 'sk-x' }, isOnPath: onPath(['gemini']) });
    const byId = Object.fromEntries(list.map(p => [p.id, p]));
    expect(byId.openai.available).toBe(true);
    expect(byId.gemini.available).toBe(true);
    expect(byId.claude.available).toBe(false);
    for (const p of list) expect(p).toHaveProperty('hint');
  });
});

describe('composePrompt', () => {
  it('joins system and prompt with the separator', () => {
    expect(composePrompt('SYS', 'ask')).toBe('SYS\n\n---\n\nask');
  });
  it('returns the prompt alone when there is no system', () => {
    expect(composePrompt('', 'ask')).toBe('ask');
  });
});

describe('buildCliCommand', () => {
  it('builds argv from the provider template', () => {
    const cmd = buildCliCommand(getProvider('claude'), 'FULL');
    expect(cmd.bin).toBe('claude');
    expect(cmd.args).toEqual(['-p', 'FULL']);
  });
});

describe('buildOpenAIRequest', () => {
  it('builds a chat-completions request with auth + messages', () => {
    const req = buildOpenAIRequest(getProvider('openai'), {
      system: 'SYS', prompt: 'ask', env: { OPENAI_API_KEY: 'sk-x' },
    });
    expect(req.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(req.headers.Authorization).toBe('Bearer sk-x');
    expect(req.body.messages).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'ask' },
    ]);
    expect(typeof req.body.model).toBe('string');
  });
  it('honors a model override from env', () => {
    const req = buildOpenAIRequest(getProvider('openai'), {
      system: '', prompt: 'ask', env: { OPENAI_API_KEY: 'sk-x', OPENAI_MODEL: 'gpt-4o-mini' },
    });
    expect(req.body.model).toBe('gpt-4o-mini');
    expect(req.body.messages).toEqual([{ role: 'user', content: 'ask' }]);
  });
  it('ollama sends no Authorization header and honors a base-url override', () => {
    const ollama = getProvider('ollama');
    const req = buildOpenAIRequest(ollama, {
      system: '', prompt: 'ask', env: { OLLAMA_MODEL: 'llama3.1' },
    });
    // A keyless provider must not emit `Bearer undefined` / `Bearer null`.
    expect(req.headers).not.toHaveProperty('Authorization');
    expect(req.url).toBe('http://127.0.0.1:11434/v1/chat/completions');
    expect(req.body.model).toBe('llama3.1');

    const overridden = buildOpenAIRequest(ollama, {
      system: '', prompt: 'ask',
      env: { OLLAMA_MODEL: 'llama3.1', OLLAMA_BASE_URL: 'http://box.local:11434/v1' },
    });
    expect(overridden.url).toBe('http://box.local:11434/v1/chat/completions');
    expect(overridden.headers).not.toHaveProperty('Authorization');
  });
});
