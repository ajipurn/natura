import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["dist", ".wrangler", "worker-configuration.d.ts"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended, reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // `catch {}` dipakai untuk localStorage yang bisa diblokir browser.
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // File rute dan halaman mengekspor lebih dari komponen; fast refresh tetap jalan untuk komponennya.
    files: ["src/server/**", "test/**", "src/apps/*/routes.tsx", "src/client/**", "src/components/ui.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
]);
