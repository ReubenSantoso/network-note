/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FDF8F3',
          100: '#F5EDE4',
          200: '#E8DED3',
          300: '#D4C4B5',
          400: '#C4B8AC',
        },
        warm: {
          500: '#8B8178',
          600: '#6A6259',
          700: '#5A5248',
          800: '#4A4540',
          900: '#2D2A26',
        },
        gold: {
          400: '#C4A484',
          500: '#A68B5B',
          600: '#9B8B7A',
        }
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['DM Sans', 'sans-serif'],
      },
      animation: {
        'slide-up': 'slideUp 0.4s ease-out',
        'pulse-recording': 'pulseRecording 1.5s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseRecording: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
      },
    },
  },
  plugins: [],
}
