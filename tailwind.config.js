/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./renderer/**/*.{html,js,ts}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
            DEFAULT: '#2563eb', // Royal Blue
            dark: '#1d4ed8',
            light: '#60a5fa'
        },
        secondary: '#10b981', // Emerald
        danger: '#ef4444',
        bg: {
            app: '#f3f4f6', 
            sidebar: '#ffffff',
            card: '#ffffff'
        }
      }
    },
  },
  plugins: [],
}
