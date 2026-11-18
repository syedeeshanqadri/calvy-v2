import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        syne: ["var(--font-syne)", "sans-serif"],
        dm: ["var(--font-dm)", "sans-serif"],
        display: ["var(--font-display)", "var(--font-dm)", "sans-serif"],
      },
      colors: {
        brand: {
          DEFAULT: "#0f0f1a",
          50: "#f5f5ff",
          100: "#ebebff",
          800: "#1a1a2e",
          900: "#0f0f1a",
        },
        // AA contrast: white text on the accent, and the accent as text on white, both reach 4.5:1 (the old #0284c7 gave 4.09).
        accent: {
          DEFAULT: "#0369a1",
          hover: "#075985",
        },
        sky: { 600: "#0369a1", 700: "#075985" },
        gold: "#f5a623",
        // Marketing site palette (step 30): Calvy deep blue is the one brand colour, marigold the one accent (fills and highlights only, never text).
        // Values live in CSS variables (app/globals.css, the "mk" tokens) so the whole marketing palette changes in one place.
        cv: {
          blue: "rgb(var(--mk-blue) / <alpha-value>)", "blue-dark": "rgb(var(--mk-blue-dark) / <alpha-value>)", "blue-tint": "rgb(var(--mk-blue-tint) / <alpha-value>)",
          ink: "rgb(var(--mk-ink) / <alpha-value>)", mute: "rgb(var(--mk-mute) / <alpha-value>)", line: "rgb(var(--mk-line) / <alpha-value>)",
          paper: "rgb(var(--mk-cream) / <alpha-value>)", card: "rgb(var(--mk-card) / <alpha-value>)",
          marigold: "rgb(var(--mk-marigold) / <alpha-value>)", "marigold-tint": "rgb(var(--mk-marigold-tint) / <alpha-value>)",
        },
      },
      borderRadius: { "mk-img": "28px", "mk-card": "18px" },
      animation: {
        "fade-up": "fadeUp 0.6s ease forwards",
        "fade-in": "fadeIn 0.4s ease forwards",
        "slide-in": "slideIn 0.5s ease forwards",
        float: "float 6s ease-in-out infinite",
        shimmer: "shimmer 1.6s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(24px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateX(-20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-400px 0" },
          "100%": { backgroundPosition: "400px 0" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
