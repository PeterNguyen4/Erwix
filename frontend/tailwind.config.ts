import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        border: "rgb(var(--color-border) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        fg: "rgb(var(--color-fg) / <alpha-value>)",
        accent: "rgb(var(--color-accent) / <alpha-value>)",
        up: "rgb(var(--color-up) / <alpha-value>)",
        down: "rgb(var(--color-down) / <alpha-value>)",
        "auth-bg": "rgb(var(--color-auth-bg) / <alpha-value>)",
        "auth-panel-from": "rgb(var(--color-auth-panel-from) / <alpha-value>)",
        "auth-panel-via": "rgb(var(--color-auth-panel-via) / <alpha-value>)",
        "auth-panel-to": "rgb(var(--color-auth-panel-to) / <alpha-value>)",
        "auth-field": "rgb(var(--color-auth-field) / <alpha-value>)",
        "auth-button": "rgb(var(--color-auth-button) / <alpha-value>)",
        "auth-button-hover": "rgb(var(--color-auth-button-hover) / <alpha-value>)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "bounce-dot": {
          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.5" },
          "40%": { transform: "translateY(-4px)", opacity: "1" },
        },
        "spotlight-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 250ms ease-out",
        "bounce-dot": "bounce-dot 1.2s ease-in-out infinite",
        "spotlight-in": "spotlight-in 300ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
