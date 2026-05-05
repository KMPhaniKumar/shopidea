import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#FF6B2B',
        black: '#1A1A1A',
        white: '#FFFFFF',
        surface: '#F9F9F9',
        border: '#EEEEEE',
        text: '#1A1A1A',
        secondary: '#666666',
        muted: '#AAAAAA',
        success: '#25D366',
        error: '#E23744',
      },
      borderRadius: {
        card: '12px',
        btn: '8px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08)',
        hover: '0 4px 12px rgba(0,0,0,0.12)',
      },
      fontFamily: {
        sans: ['Outfit', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
