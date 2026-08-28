/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        stonic: {
          // Exact hex values from image
          bg: '#080c12',
          surface: '#0b1119',
          card: '#0d1520',
          hover: '#161f2a',
          border: 'rgba(0, 216, 238, 0.15)',
          borderLight: 'rgba(0, 216, 238, 0.08)',
          borderStrong: 'rgba(0, 216, 238, 0.35)',
          primary: '#00d8ee',
          primaryHover: '#00b8d4',
          accent: '#00f5d4',
          accent2: '#ff3366',
          accent3: '#7928ca',
          text: '#e6f7ff',
          textMuted: '#6b8a9a',
          textDim: '#3d5a66',
          success: '#00ff88',
          warning: '#ffb800',
          error: '#ef4444',
          cyan: '#00d8ee',
          teal: '#00f5d4',
          blue: '#3b82f6',
          slate: '#64748b',
          dark: '#020405',
          // Border tiers
          b1: 'rgba(0, 216, 238, 0.08)',
          b2: 'rgba(0, 216, 238, 0.15)',
          b3: 'rgba(0, 216, 238, 0.35)',
        }
      },
      fontFamily: {
        sans: ['Rajdhani', 'system-ui', 'sans-serif'],
        mono: ['Share Tech Mono', 'JetBrains Mono', 'monospace'],
        display: ['Orbitron', 'sans-serif'],
        orbitron: ['Orbitron', 'sans-serif'],
        rajdhani: ['Rajdhani', 'sans-serif'],
        'mono-tech': ['Share Tech Mono', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'glow-cyan': 'glowCyan 2s ease-in-out infinite alternate',
        'float': 'float 6s ease-in-out infinite',
        'spin-slow': 'spin 20s linear infinite',
        'scanline': 'scanline 8s linear infinite',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(0, 216, 238, 0.4)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 216, 238, 0.7), 0 0 40px rgba(0, 216, 238, 0.3)' },
        },
        glowCyan: {
          '0%': { boxShadow: '0 0 10px rgba(0, 216, 238, 0.4), 0 0 20px rgba(0, 216, 238, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(0, 216, 238, 0.7), 0 0 40px rgba(0, 216, 238, 0.4), 0 0 60px rgba(0, 245, 212, 0.2)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        scanline: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'cyber-grid': 'linear-gradient(rgba(0, 216, 238, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 216, 238, 0.03) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
}
