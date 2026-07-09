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
      removeSensitiveFilesRecursively(outDir);
    }
  };
}

// Recursively walk the build output and remove any hidden/dot-file
// (e.g. .env, .env.local, .htaccess, .git*) as well as any known
// sensitive non-dot files (e.g. config.js, config.json, nginx.conf),
// no matter how deeply nested, so a sensitive file placed anywhere
// under `client/public` can never reach the publicly served bundle.
function removeSensitiveFilesRecursively(dir: string) {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stats;
    try {
      stats = statSync(fullPath);
    } catch {
      continue;
    }
    const isSensitive =
      entry.startsWith('.') || SENSITIVE_FILENAMES.has(entry);
    if (stats.isDirectory()) {
      if (isSensitive) {
        rmSync(fullPath, { recursive: true, force: true });
      } else {
        removeSensitiveFilesRecursively(fullPath);
      }
    } else if (stats.isFile() && isSensitive) {
      rmSync(fullPath, { force: true });
    }
  }
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
