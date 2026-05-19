/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./browser.html",
    "./src/ui/ProjectBrowser/**/*.{ts,tsx}",
    "./src/browser-entry.tsx",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
