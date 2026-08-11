import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // Placeholder PISTA brand palette - refined in Phase 3 (landing page).
        brand: {
          50: "#f2f0ff",
          500: "#6d5bff",
          600: "#5843f2",
          900: "#100c2a",
        },
      },
    },
  },
  darkMode: "class",
  plugins: [],
};

export default config;
