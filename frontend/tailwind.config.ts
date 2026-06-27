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
    },
  },
  plugins: [],
};

export default config;
