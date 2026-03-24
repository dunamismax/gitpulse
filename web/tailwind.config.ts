import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#09111d",
          elevated: "#10151f",
        },
        panel: {
          DEFAULT: "#152032",
          alt: "#0d1726",
        },
        line: "rgba(148, 163, 184, 0.18)",
        accent: {
          DEFAULT: "#67e8f9",
          strong: "#1d4ed8",
        },
        muted: "#94a3b8",
        danger: "#ef4444",
        success: "#22c55e",
      },
      borderRadius: {
        panel: "24px",
        card: "14px",
      },
      boxShadow: {
        panel: "0 24px 70px rgba(0, 0, 0, 0.35)",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
