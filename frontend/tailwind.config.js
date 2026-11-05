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
          50: '#f8f3ff',
          100: '#efe7ff',
          200: '#ddd0ff',
          300: '#cdb9fb',
          400: '#a98af7',
          500: '#7c4ddf',
          600: '#6a3ccb',
          700: '#4a1f9a',
          800: '#3a1680',
          900: '#2a0f5c',
          950: '#1a0840'
        },
        violet: {
          50: '#f8f3ff',
          100: '#efe7ff',
          200: '#ddd0ff',
          300: '#cdb9fb',
          400: '#a98af7',
          500: '#7c4ddf',
          600: '#6a3ccb',
          700: '#4a1f9a',
          800: '#3a1680',
          900: '#2a0f5c',
          950: '#1a0840'
        },
        purple: {
          50: '#f8f3ff',
          100: '#efe7ff',
          200: '#ddd0ff',
          300: '#cdb9fb',
          400: '#a98af7',
          500: '#7c4ddf',
          600: '#6a3ccb',
          700: '#4a1f9a',
          800: '#3a1680',
          900: '#2a0f5c',
          950: '#1a0840'
        },
        blue: {
          50: '#f8f3ff',
          100: '#efe7ff',
          200: '#ddd0ff',
          300: '#cdb9fb',
          400: '#a98af7',
          500: '#7c4ddf',
          600: '#6a3ccb',
          700: '#4a1f9a',
          800: '#3a1680',
          900: '#2a0f5c',
          950: '#1a0840'
        },
        slate: {
          50: '#fdf6f3',
          100: '#f6eefb',
          200: '#ebe2f7',
          300: '#dccdf0',
          400: '#a898c4',
          500: '#7d6c9a',
          600: '#5d4a7e',
          700: '#46306f',
          800: '#3a1f6b',
          900: '#2a0f4d',
          950: '#1d0a38'
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
