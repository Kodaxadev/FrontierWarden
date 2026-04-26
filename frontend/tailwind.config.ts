import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        eve: {
          bg:       '#080c14',
          surface:  '#0d1420',
          border:   '#1a2a3a',
          cyan:     '#00d4ff',
          red:      '#ff2222',
          orange:   '#ff8c00',
          yellow:   '#ffcc00',
          green:    '#00ff88',
          dim:      '#3a5a7a',
          text:     '#c0ccd8',
          muted:    '#5a7a9a',
        },
      },
      fontFamily: {
        mono: ['"Share Tech Mono"', 'Courier New', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
