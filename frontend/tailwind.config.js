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
          50: '#f5f7ff',
          100: '#e8edff',
          200: '#cdd6fc',
          300: '#aab9f9',
          400: '#6f89f2',
          500: '#2a4ad8',
          600: '#1f3bb8',
          700: '#1e3a9a',
          800: '#142a7a',
          900: '#0d1a52',
          950: '#070f33'
        },
        violet: {
          50: '#f5f7ff',
          100: '#e8edff',
          200: '#cdd6fc',
          300: '#aab9f9',
          400: '#6f89f2',
          500: '#2a4ad8',
          600: '#1f3bb8',
          700: '#1e3a9a',
          800: '#142a7a',
          900: '#0d1a52',
          950: '#070f33'
        },
        purple: {
          50: '#f5f7ff',
          100: '#e8edff',
          200: '#cdd6fc',
          300: '#aab9f9',
          400: '#6f89f2',
          500: '#2a4ad8',
          600: '#1f3bb8',
          700: '#1e3a9a',
          800: '#142a7a',
          900: '#0d1a52',
          950: '#070f33'
        },
        blue: {
          50: '#f5f7ff',
          100: '#e8edff',
          200: '#cdd6fc',
          300: '#aab9f9',
          400: '#6f89f2',
          500: '#2a4ad8',
          600: '#1f3bb8',
          700: '#1e3a9a',
          800: '#142a7a',
          900: '#0d1a52',
          950: '#070f33'
        },
        slate: {
          50: '#fbfbfe',
          100: '#f4f6fc',
          200: '#e6e9f2',
          300: '#d5dae8',
          400: '#98a0b8',
          500: '#6a728c',
          600: '#4b5470',
          700: '#2a3358',
          800: '#1f2a52',
          900: '#12162b',
          950: '#0b1024'
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
