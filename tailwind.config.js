/** @type {import('tailwindcss').Config} */
// Resume Command Center UNIFIED theme. Every color below is a SEMANTIC token that resolves
// to a CSS variable defined in src/index.css (the single source of truth) — so a brand change
// happens in one place and the config carries no hex literals. App.jsx uses these token names
// directly (text-heading, bg-accent, border-line, …). PDF output is unaffected — GUI-only.
// (2026-07-21)
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── Neutrals: surfaces + hairlines ──
        paper: 'var(--color-bg)',        // page background
        panel: 'var(--color-panel)',     // card / panel
        fill: 'var(--color-fill)',       // faint surface fill
        surface: 'var(--color-surface)', // canonical surface (parity)
        line: {
          DEFAULT: 'var(--color-line)',        // hairline border
          strong: 'var(--color-line-strong)',  // stronger border
        },
        // ── Neutrals: text ramp (dark → light) ──
        heading: 'var(--color-heading)', // headings, graphite
        strong: 'var(--color-ink-strong)', // emphasis body
        body: 'var(--color-text)',       // body text
        dim: 'var(--color-ink-dim)',     // secondary / dim text
        muted: 'var(--color-text-muted)', // muted / captions
        faint: 'var(--color-ink-faint)', // faint text + icons
        // ── Accent (Resume Command Center lavender) ──
        accent: {
          DEFAULT: 'var(--color-accent)',
          strong: 'var(--color-accent-strong)',
          soft: 'var(--color-accent-soft)',
          fill: 'var(--color-accent-fill)',
          'fill-faint': 'var(--color-accent-fill-faint)',
          line: 'var(--color-accent-line)',
        },
        // ── Semantics (Brand-Identity v1.2): deep, muted, calm on paper ──
        success: {
          DEFAULT: 'var(--color-success)',
          fill: 'var(--color-success-fill)',
          line: 'var(--color-success-line)',
          'line-soft': 'var(--color-success-line-soft)',
        },
        warning: {
          DEFAULT: 'var(--color-warning)',
          strong: 'var(--color-warning-strong)',
          fill: 'var(--color-warning-fill)',
          'fill-strong': 'var(--color-warning-fill-strong)',
          line: 'var(--color-warning-line)',
          'line-strong': 'var(--color-warning-line-strong)',
        },
        danger: {
          DEFAULT: 'var(--color-danger)',
          soft: 'var(--color-danger-soft)',
          fill: 'var(--color-danger-fill)',
          line: 'var(--color-danger-line)',
        },
      },
      // Bare `border` / `border-t` / `divide-x` default to the app hairline (was gray-200 remap).
      borderColor: { DEFAULT: 'var(--color-line)' },
      fontFamily: {
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'monospace'],
      },
      // Tool-tuned brand radii (brand's 12/22px is too round for a dense panel)
      borderRadius: { DEFAULT: '6px', md: '8px', lg: '10px', xl: '16px' },
      // Violet-tinted brand shadows (replace neutral Tailwind shadows)
      boxShadow: {
        sm: '0 1px 2px rgba(52,35,108,0.06)',
        DEFAULT: '0 10px 24px rgba(52,35,108,0.07)',
        lg: '0 14px 30px rgba(52,35,108,0.09)',
        xl: '0 18px 38px rgba(52,35,108,0.10)',
      },
    },
  },
  plugins: [],
};
