/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        // Overrides Tailwind's built-in `slate` with a navy/blue-gray
        // ramp at the same 10 steps (close to Tailwind's own `slate`
        // scale) - every existing text-slate-*, bg-slate-*, border-slate-*
        // class across the app picks this up directly, no per-file edits.
        slate: {
          50: "#F8FAFC",
          100: "#F1F5F9",
          200: "#E2E8F0",
          300: "#CBD5E1",
          400: "#94A3B8",
          500: "#64748B",
          600: "#475569",
          700: "#334155",
          800: "#1E293B",
          900: "#0F172A",
        },
        brand: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          // Deeper steps for the solid navy top bar (PayPal-Business-style
          // masthead) - distinct from the 600 action-button blue.
          800: "#1E3A8A",
          900: "#172554",
        },
        ink: {
          950: "#ffffff",
          900: "#F8FAFC",
          850: "#ffffff",
          800: "#ffffff",
          700: "#F1F5F9",
          600: "#E2E8F0",
          500: "#CBD5E1",
        },
        line: "rgba(15,23,42,0.10)",
        "line-hover": "rgba(15,23,42,0.18)",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(15,23,42,0.05), 0 4px 12px -4px rgba(15,23,42,0.10)",
        "card-hover": "0 2px 4px 0 rgba(15,23,42,0.06), 0 8px 20px -6px rgba(15,23,42,0.14)",
      },
    },
  },
  plugins: [],
};
