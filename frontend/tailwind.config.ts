import type { Config } from 'tailwindcss';

// Design tokens from DESIGN_SYSTEM.md -- do not modify without frontend PM approval
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        void: {
          900: '#030508',
          800: '#0A0E17',
          700: '#111827',
          600: '#1A2236',
          500: '#243049',
        },
        sui: {
          cyan: '#00D2FF',
          glow: 'rgba(0, 210, 255, 0.15)',
        },
        frontier: {
          amber:   '#F59E0B',
          crimson: '#EF4444',
          gold:    '#FBBF24',
        },
        alloy: {
          silver: '#94A3B8',
        },
        status: {
          clear:  '#10B981',
          camped: '#DC2626',
        },
        standing: {
          ally:    '#3B82F6',
          neutral: '#94A3B8',
          enemy:   '#EF4444',
        },
      },
      fontFamily: {
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        sans:    ['Inter', '"SF Pro Display"', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Orbitron', 'sans-serif'],
      },
      boxShadow: {
        'glow-cyan':    '0 0 20px rgba(0, 210, 255, 0.15)',
        'glow-amber':   '0 0 20px rgba(245, 158, 11, 0.15)',
        'glow-crimson': '0 0 20px rgba(239, 68, 68, 0.15)',
        'inner-cyan':   'inset 0 1px 0 rgba(0, 210, 255, 0.15)',
      },
      animation: {
        'pulse-slow':  'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'scan-in':     'scanIn 80ms ease-out both',
        'data-in':     'dataIn 120ms ease-out both',
        'glow-pulse':  'glowPulse 2.5s ease-in-out infinite',
        'flicker':     'flicker 14s linear infinite',
        'sweep':       'dataSweep 2s ease-in-out infinite',
      },
      keyframes: {
        scanIn: {
          '0%':   { opacity: '0', transform: 'translateX(-6px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        dataIn: {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.2' },
          '50%':      { opacity: '0.7' },
        },
        flicker: {
          '0%, 96%, 100%': { opacity: '1' },
          '97%':           { opacity: '0.35' },
          '98%':           { opacity: '1' },
          '99%':           { opacity: '0.55' },
        },
        dataSweep: {
          '0%':   { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(400%)' },
        },
      },
      borderRadius: {
        panel: '6px',
      },
    },
  },
  plugins: [],
};

export default config;
