/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark charcoal / near-black surfaces with a violet undertone
        haunt: {
          void: '#07040d',
          night: '#0d0817',
          charcoal: '#15101f',
          slate: '#1d1730',
          ash: '#2a2140',
          fog: '#9a8fb5',
          bone: '#efe9fb',
        },
        // Deep violets (overrides Tailwind's default violet scale)
        violet: {
          50: '#f5efff',
          100: '#e9dcff',
          200: '#d4bbff',
          300: '#b88cff',
          400: '#9d5cff',
          500: '#8133f0',
          600: '#6a1fd1',
          700: '#5516a8',
          800: '#3f1180',
          900: '#2b0c59',
          950: '#180637',
        },
        // Neon accents for rings, glows, buttons
        neon: {
          DEFAULT: '#b026ff',
          soft: '#c77dff',
          hot: '#e040fb',
          glow: '#d946ef',
        },
      },
      fontFamily: {
        display: ['Creepster', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        neon: '0 0 12px rgba(176,38,255,.55), 0 0 32px rgba(176,38,255,.28)',
        'neon-lg': '0 0 18px rgba(176,38,255,.7), 0 0 60px rgba(176,38,255,.4)',
        'inner-glow': 'inset 0 0 24px rgba(129,51,240,.28)',
      },
      backgroundImage: {
        'haunt-radial':
          'radial-gradient(ellipse at 50% -10%, rgba(129,51,240,.35), transparent 55%), radial-gradient(ellipse at 90% 110%, rgba(176,38,255,.18), transparent 50%)',
        'neon-gradient': 'linear-gradient(135deg, #6a1fd1 0%, #b026ff 100%)',
      },
      keyframes: {
        flicker: {
          '0%, 19%, 21%, 23%, 25%, 54%, 56%, 100%': { opacity: '1' },
          '20%, 24%, 55%': { opacity: '.55' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 12px rgba(176,38,255,.4)' },
          '50%': { boxShadow: '0 0 28px rgba(176,38,255,.85)' },
        },
        scan: {
          '0%': { transform: 'translateY(-10%)' },
          '100%': { transform: 'translateY(110%)' },
        },
      },
      animation: {
        flicker: 'flicker 4s linear infinite',
        float: 'float 4s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 2.4s ease-in-out infinite',
        scan: 'scan 2.2s linear infinite',
      },
    },
  },
  plugins: [],
};
