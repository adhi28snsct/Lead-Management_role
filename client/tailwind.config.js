/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./client/app/**/*.{js,ts,jsx,tsx}",
    "./client/pages/**/*.{js,ts,jsx,tsx}",
    "./client/components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",        // keep if you also have top-level app folder
    "./pages/**/*.{js,ts,jsx,tsx}",      // optional
    "./components/**/*.{js,ts,jsx,tsx}", // optional
  ],
  theme: { extend: {} },
  plugins: [],
};