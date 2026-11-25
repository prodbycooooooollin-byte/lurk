/** @type {import('tailwindcss').Config} */
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: v('ground'), panel: v('panel'), raised: v('raised'), hover: v('hover'), line: v('line'),
        ink: v('ink'), muted: v('muted'), faint: v('faint'),
        accent: v('accent'), join: v('join'), part: v('part'), warn: v('warn'), live: v('live')
      },
      fontFamily: { sans: ['"Inter Variable"', 'system-ui', 'sans-serif'] },
      borderRadius: { window: '10px', panel: '8px', chip: '4px' },
      keyframes: {
        pulseDot: { '0%,100%': { opacity: '1' }, '50%': { opacity: '.35' } }
      },
      animation: { pulseDot: 'pulseDot 1.6s ease-in-out infinite' }
    }
  },
  plugins: []
}
