import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cpSync, createReadStream, existsSync, statSync } from "fs";
import { extname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const MIME = {
  ".mjs":  "text/javascript",
  ".js":   "text/javascript",
  ".glb":  "model/gltf-binary",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg":  "image/svg+xml",
  ".css":  "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".bin":  "application/octet-stream",
  ".mp3":  "audio/mpeg",
  ".wav":  "audio/wav",
};

/** Serves `srcDir` at `urlPrefix` in dev; copies it to dist in build. */
function serveStatic(urlPrefix, srcDir) {
  const dir = join(__dirname, srcDir);
  return {
    name: `serve-static:${srcDir}`,
    configureServer(server) {
      server.middlewares.use(urlPrefix, (req, res, next) => {
        const filePath = join(dir, decodeURIComponent(req.url.split("?")[0]));
        if (existsSync(filePath) && statSync(filePath).isFile()) {
          res.setHeader("Content-Type", MIME[extname(filePath)] ?? "application/octet-stream");
          createReadStream(filePath).pipe(res);
        } else {
          next();
        }
      });
    },
    closeBundle() {
      cpSync(dir, join(__dirname, "dist", urlPrefix), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    serveStatic("/talking_heads", "talking_heads"),
  ],
  publicDir: "static",
  optimizeDeps: {
    entries: ["src/**/*.{ts,tsx,js,jsx}"],
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        proxyTimeout: 300000,
        timeout: 300000,
      },
      "/auth": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
