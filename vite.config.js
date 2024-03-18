import { defineConfig } from "vite";
import topLevelAwait from "vite-plugin-top-level-await";
import { viteStaticCopy } from "vite-plugin-static-copy";
import vue from "@vitejs/plugin-vue";

// https://vitejs.dev/config/
export default defineConfig({
  base: "/juegas-ajedrez/",
  plugins: [
    vue(),
    topLevelAwait(),
    viteStaticCopy({
      targets: [{ src: "node_modules/pdfjs-dist/build/pdf.worker.mjs", dest: "assets/pdfjs" }],
    }),
  ],
  optimizeDeps: {
    include: [
      "pdfjs-dist/build/pdf.mjs",
      "pdfjs-dist/build/pdf.worker.mjs",
      // "public/assets/pdfjs/pdf.worker.mjs"
    ],
  },
});
