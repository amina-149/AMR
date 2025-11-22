/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'amr-green': '#166534',
        'amr-light-green': '#22c55e',
        'amr-sky': '#0ea5e9',
        'amr-white': '#ffffff'
      },
      fontFamily: {
        'urdu': ['Noto Nastaliq Urdu', 'serif']
      }
    },
  },
  plugins: [],
}