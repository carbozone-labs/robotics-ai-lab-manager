export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Inter", "Segoe UI", "system-ui", "sans-serif"], mono: ["JetBrains Mono", "Consolas", "monospace"] },
      colors: {
        ink: { 950: "#050a16", 900: "#0a1224", 800: "#0f1b33" },
        brand: { 50: "#ecfeff", 100: "#cffafe", 500: "#06b6d4", 600: "#0e7490", 700: "#22d3ee", 900: "#083344" },
      },
    },
  },
};
