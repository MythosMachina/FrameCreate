import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"] ,
  theme: {
    extend: {
      colors: {
        base: "#0b0d10",
        panel: "#11151b",
        panelAlt: "#0f1318",
        text: "#e7edf6",
        muted: "#9ca7b8",
        accent: "#d58c3f",
        accent2: "#46c0c3",
        danger: "#d94b4b",
        success: "#5bd88f"
      },
      boxShadow: {
        panel: "0 10px 30px rgba(0, 0, 0, 0.35)",
        glow: "0 0 20px rgba(213,140,63,0.35)"
      },
      borderRadius: {
        xl: "16px"
      },
      fontFamily: {
        display: ["Bebas Neue", "sans-serif"],
        body: ["Space Mono", "monospace"]
      }
    }
  },
  plugins: []
} satisfies Config;
