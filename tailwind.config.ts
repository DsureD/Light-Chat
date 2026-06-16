import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "hsl(var(--canvas) / <alpha-value>)",
        sidebar: "hsl(var(--sidebar) / <alpha-value>)",
        card: "hsl(var(--card) / <alpha-value>)",
        bubble: "hsl(var(--bubble) / <alpha-value>)",
        ink: "hsl(var(--ink) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        line: "hsl(var(--line) / <alpha-value>)",
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          ink: "hsl(var(--accent-ink) / <alpha-value>)"
        }
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "PingFang SC",
          "Microsoft YaHei",
          "Source Han Sans SC",
          "Noto Sans SC",
          "system-ui",
          "sans-serif"
        ],
        display: ["var(--font-display)", "PingFang SC", "Microsoft YaHei", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"]
      },
      boxShadow: {
        soft: "0 1px 2px rgba(40, 38, 34, 0.04), 0 8px 28px rgba(40, 38, 34, 0.06)",
        lift: "0 2px 6px rgba(40, 38, 34, 0.06), 0 18px 44px rgba(40, 38, 34, 0.12)"
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" }
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.25" }
        }
      },
      animation: {
        "fade-in": "fade-in 0.4s ease both",
        "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "scale-in": "scale-in 0.35s cubic-bezier(0.22, 1, 0.36, 1) both",
        blink: "blink 1.2s ease-in-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
