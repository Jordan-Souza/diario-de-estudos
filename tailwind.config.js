/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        background: '#FFFFFF',
        surface: '#F9FAFB',
        primary: '#000000',
        textMain: '#111827',
        textMuted: '#6B7280',
        borderSubtle: '#E5E7EB',
      }
    },
  },
  plugins: [],
}
