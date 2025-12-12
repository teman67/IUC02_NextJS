/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#e6f3ff',
          100: '#b3dbff',
          200: '#80c4ff',
          300: '#4dacff',
          400: '#1a95ff',
          500: '#3498db',
          600: '#2980b9',
          700: '#1f6897',
          800: '#145074',
          900: '#0a3852',
        },
        dark: {
          50: '#e6f0f5',
          100: '#b3d4e0',
          200: '#80b7cb',
          300: '#4d9bb6',
          400: '#1a7ea1',
          500: '#05445e',
          600: '#04364a',
          700: '#032837',
          800: '#021a24',
          900: '#010c11',
        },
        accent: {
          orange: '#ff6b35',
          purple: '#6c5ce7',
          green: '#00b894',
          yellow: '#fdcb6e',
        },
      },
      boxShadow: {
        'soft': '0 2px 15px rgba(0, 0, 0, 0.08)',
        'medium': '0 4px 20px rgba(0, 0, 0, 0.12)',
        'hard': '0 8px 30px rgba(0, 0, 0, 0.16)',
        'glow': '0 0 20px rgba(52, 152, 219, 0.3)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.6s ease-out',
        'bounce-subtle': 'bounceSubtle 2s infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bounceSubtle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
      },
    },
  },
  plugins: [],
}
