import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0b0e14",
        panel: "#121722",
        border: "#1e2633",
        muted: "#7d8799",
        accent: "#3b82f6",
        up: "#26a69a",
        down: "#ef5350",
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
