export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        surface2: 'rgb(var(--surface2) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        mute: 'rgb(var(--mute) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        brand: 'rgb(var(--brand) / <alpha-value>)',
        brandsoft: 'rgb(var(--brandsoft) / <alpha-value>)',
        sage: 'rgb(var(--sage) / <alpha-value>)',
        sand: 'rgb(var(--sand) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        bad: 'rgb(var(--bad) / <alpha-value>)',
      },
      fontFamily: { sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'], serif: ['"Fraunces"', 'Georgia', 'serif'] },
      borderRadius: { xl2: '1.25rem' },
    },
  },
}
