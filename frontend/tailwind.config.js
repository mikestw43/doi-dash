/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          primary:   'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary:  'var(--bg-tertiary)',
          card:      'var(--bg-card)',
        },
        accent: {
          blue:   'var(--accent-blue)',
          purple: 'var(--accent-purple)',
        },
        success: 'var(--success)',
        danger:  'var(--danger)',
        warning: 'var(--warning)',
        neutral: '#6b7280',
        border2: 'var(--border2)',
        // DOI DASH aliases
        cyan:    'var(--accent-blue)',
        green:   'var(--success)',
        red:     'var(--danger)',
        yellow:  'var(--warning)',
      },
      fontFamily: {
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'Menlo', 'monospace'],
        pixel:   ['"Press Start 2P"', 'monospace'],   // headings / labels
        display: ['VT323', 'monospace'],               // large numbers
        tech:    ['"Share Tech Mono"', 'monospace'],   // body data
      },
      animation: {
        'flash-green': 'flashGreen 0.6s ease-out',
        'flash-red':   'flashRed 0.6s ease-out',
        'pulse-slow':  'pulse 3s ease-in-out infinite',
        'pulse-dot':   'pulseDot 2s ease-in-out infinite',
        'ticker':      'ticker 32s linear infinite',
      },
      keyframes: {
        flashGreen: {
          '0%':   { backgroundColor: 'rgba(34, 197, 94, 0.4)' },
          '100%': { backgroundColor: 'transparent' },
        },
        flashRed: {
          '0%':   { backgroundColor: 'rgba(239, 68, 68, 0.4)' },
          '100%': { backgroundColor: 'transparent' },
        },
        pulseDot: {
          '50%': { opacity: '0.35' },
        },
        ticker: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};
