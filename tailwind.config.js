/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Outfit', 'sans-serif'],
      },
      colors: {
        // Material Design 3 inspired dark themes
        md3: {
          bg: '#0a0a0c',
          surface: '#141419',
          surfaceVariant: '#1f1f26',
          primary: '#b5c4ff',
          onPrimary: '#17181c',
          primaryContainer: '#2b304c',
          onPrimaryContainer: '#dbe1ff',
          success: '#3ddc84',
          error: '#ffb4ab'
        }
      }
    },
  },
  plugins: [],
}
