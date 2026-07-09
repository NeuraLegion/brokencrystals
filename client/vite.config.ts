++ Update File: client/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { readdirSync, rmSync, statSync } from 'fs';
import { join } from 'path';

// Vite's `publicDir` copy step blindly copies every file (including
// dot-files such as .env) from the public directory into the build
// output. To avoid ever shipping sensitive/hidden env-style files to
// the publicly served `dist` directory, strip them out after the
// build/copy step completes.
// Known non-dot files that must never be exposed by the static file
// server (server-side config, credentials, web-server configuration, etc.)
const SENSITIVE_FILENAMES = new Set([
  'config.js',
  'config.json',
  'nginx.conf'
]);

function stripSensitiveDotFiles() {
  return {
    name: 'strip-sensitive-dot-files',
    closeBundle() {
      const outDir = join(__dirname, 'dist');
      let entries: string[] = [];
      try {
        entries = readdirSync(outDir);
      } catch {
        return;
      }
      for (const entry of entries) {
        // Remove any hidden/dot-file (e.g. .env, .env.local, .htaccess, .git*)
        // as well as any known sensitive non-dot files (e.g. config.js,
        // config.json, nginx.conf) that Vite may have copied verbatim from
        // the public directory.
        if (entry.startsWith('.') || SENSITIVE_FILENAMES.has(entry)) {
          const fullPath = join(outDir, entry);
          try {
            if (statSync(fullPath).isFile()) {
              rmSync(fullPath, { force: true });
            }
          } catch {
            // ignore
          }
        }
      }
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  publicDir: './public',
  plugins: [react(), stripSensitiveDotFiles()],
  server: {
    port: 3001,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/grpc': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  build: {
    chunkSizeWarningLimit: 600 * 1024
  }
});
