/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        marsa: {
          royal: '#003882',
          ciel: '#0099cc',
          bg: '#eef5fb',
          text: '#14324d',
          muted: '#5b7a99',
          border: '#dce8f4',
        },
      },
      fontFamily: {
        sans: ['Aptos', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 8px rgba(0, 56, 130, 0.06)',
        login: '0 2px 8px rgba(0, 56, 130, 0.08), 0 8px 32px rgba(0, 56, 130, 0.10)',
      },
    },
  },
  plugins: [],
}
