/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        // Extra-small phones (360px) – use `xs:` prefix
        'xs': '360px',
      },
      colors: {
        indigo: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#ff6b35',
          600: '#e8531f',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407'
        },
        violet: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#ff6b35',
          600: '#e8531f',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407'
        },
        purple: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#ff6b35',
          600: '#e8531f',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407'
        },
        blue: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#ff6b35',
          600: '#e8531f',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
          950: '#431407'
        },
        slate: {
          50: '#fffaf0',
          100: '#fff0de',
          200: '#efe3d3',
          300: '#e3d3c0',
          400: '#a8927f',
          500: '#7d6657',
          600: '#6b5344',
          700: '#4f3a2c',
          800: '#3a2418',
          900: '#2c1810',
          950: '#1a0f09'
        },
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
      },
      spacing: {
        // Safe area insets for notched phones
        'safe-top':    'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left':   'env(safe-area-inset-left)',
        'safe-right':  'env(safe-area-inset-right)',
      },
    },
  },
  plugins: [],
}
