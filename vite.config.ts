import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: { alias: { "@": src } },
  environments: {
    client: {
      build: {
        // three.js (tampilan 3D) memang besar, tapi hanya dimuat saat tab 3D dibuka.
        chunkSizeWarningLimit: 650,
        rolldownOptions: {
          // Tiga app dalam satu build: warga (/), petugas (/petugas/), admin (/admin/).
          input: {
            warga: fileURLToPath(new URL("./index.html", import.meta.url)),
            petugas: fileURLToPath(new URL("./petugas/index.html", import.meta.url)),
            admin: fileURLToPath(new URL("./admin/index.html", import.meta.url)),
          },
        },
      },
    },
  },
});
