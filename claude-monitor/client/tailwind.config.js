/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          0: "rgb(var(--surface-0) / <alpha-value>)",
          1: "rgb(var(--surface-1) / <alpha-value>)",
          2: "rgb(var(--surface-2) / <alpha-value>)",
          3: "rgb(var(--surface-3) / <alpha-value>)",
          4: "rgb(var(--surface-4) / <alpha-value>)",
          5: "rgb(var(--surface-5) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--border) / <alpha-value>)",
          light: "rgb(var(--border-light) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          hover: "rgb(var(--accent-hover) / <alpha-value>)",
          muted: "rgb(var(--accent) / 0.12)",
          dim: "rgb(var(--accent) / 0.06)",
        },
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.25s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
        "live-pulse": "livePulse 2s ease-in-out infinite",
        "node-enter": "nodeEnter 0.45s cubic-bezier(0.22, 1, 0.36, 1) both",
        "status-glow": "statusGlow 1.8s ease-in-out infinite",
        "edge-flow": "edgeFlow 1.6s linear infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        livePulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        nodeEnter: {
          "0%": { opacity: "0", transform: "translateY(10px) scale(0.97)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        statusGlow: {
          "0%, 100%": { opacity: "0.2" },
          "50%": { opacity: "0.65" },
        },
        edgeFlow: {
          "0%": { "stroke-dashoffset": "26" },
          "100%": { "stroke-dashoffset": "0" },
        },
      },
    },
  },
  plugins: [],
};
