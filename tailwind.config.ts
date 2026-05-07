import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#A3B2A4",
          50: "#f4f6f4",
          100: "#e3e9e3",
          200: "#c7d3c8",
          300: "#A3B2A4",
          400: "#8a9d8b",
          500: "#728873",
          600: "#5c6f5d",
          700: "#495a4a",
          800: "#374538",
          900: "#263027",
        },
        accent: "#000000",
        danger: "#CC0000",
      },
      fontFamily: {
        serif: ["Georgia", "Times New Roman", "serif"],
        sans: ["system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
