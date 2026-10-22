/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cravora: {
          espresso: '#24130D',
          chocolate: '#3B2117',
          cream: '#FFF8EF',
          orange: '#F26A0A',
          gold: '#FFB45C',
          white: '#FFFFFF',
          dark: '#241D19',
          muted: '#766B63',
          green: '#16845B',
          // Brand semantic mappings
          red: '#F26A0A',       // Primary CTA / Burnt orange
          redDark: '#D45700',   // Hover state
          redLight: '#FFF2E6',  // Light tint
          sand: '#F7EEDE',      // Warm sand accent
          charcoal: '#24130D',  // Deep espresso
          amber: '#FFB45C',     // Golden accent
          emerald: '#16845B',   // Success green
        },
      },
      fontFamily: {
        display: ['"Manrope"', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 20px -4px rgba(36, 19, 13, 0.06)',
        cardHover: '0 12px 28px -6px rgba(36, 19, 13, 0.12)',
        glow: '0 6px 20px -4px rgba(242, 106, 10, 0.35)',
      },
    },
  },
  plugins: [],
};
