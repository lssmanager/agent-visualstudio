/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{html,tsx,ts}',
    './index.html',
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['Montserrat', 'Arial', 'sans-serif'],
        heading: ['Poppins', 'Arial', 'sans-serif'],
        mono:    ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        brand: {
          DEFAULT: '#2259F2',
          hover:   '#1A47CC',
          active:  '#052490',
          soft:    'rgba(34,89,242,0.12)',
        },
        accent: {
          DEFAULT: '#F3B723',
          hover:   '#ED9E1B',
        },
      },
      boxShadow: {
        token: 'var(--shadow-md)',
      },
    },
  },
  plugins: [],
};
