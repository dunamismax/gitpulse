import node from "@astrojs/node";
import vue from "@astrojs/vue";
import { defineConfig } from "astro/config";

const apiBaseUrl = process.env.GITPULSE_API_BASE_URL || "http://127.0.0.1:7467";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [vue()],
  server: {
    host: "127.0.0.1",
    port: 4321,
  },
  vite: {
    server: {
      proxy: {
        "/api": apiBaseUrl,
      },
    },
  },
});
