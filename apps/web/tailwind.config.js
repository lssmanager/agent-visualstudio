/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,tsx,ts}'],
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
        nav: {
          DEFAULT: '#1a1a2e',
          hover:   '#252544',
          active:  '#2259F2',
        },
      },
      boxShadow: {
        token: 'var(--shadow-md)',
      },
    },
  },
  plugins: [],
};
