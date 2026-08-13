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
        "on-accent": "rgb(var(--color-on-accent) / <alpha-value>)",
        field: "rgb(var(--color-field) / <alpha-value>)",
        tooltip: "rgb(var(--color-tooltip) / <alpha-value>)",
        "tooltip-fg": "rgb(var(--color-tooltip-fg) / <alpha-value>)",
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
        "fade-out-down": {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0", transform: "translateY(8px)" },
        },
        "bounce-dot": {
          "0%, 80%, 100%": { transform: "translateY(0)", opacity: "0.5" },
          "40%": { transform: "translateY(-4px)", opacity: "1" },
        },
        "spotlight-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.85)" },
          "60%": { opacity: "1", transform: "scale(1.08)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "confetti-fall": {
          "0%": { transform: "translateY(-12px) rotate(0deg)", opacity: "1" },
          "100%": { transform: "translateY(140px) rotate(360deg)", opacity: "0" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 250ms ease-out",
        "fade-out-down": "fade-out-down 200ms ease-in",
        "bounce-dot": "bounce-dot 1.2s ease-in-out infinite",
        "spotlight-in": "spotlight-in 300ms ease-out",
        "slide-in-right": "slide-in-right 280ms ease-out",
        "pop-in": "pop-in 450ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        "fade-in": "fade-in 220ms ease-out",
        "confetti-fall": "confetti-fall 1.3s ease-in forwards",
      },
    },
  },
  plugins: [],
};

export default config;
