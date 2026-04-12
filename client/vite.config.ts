import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';

const blockedAssetPaths = [
  /^\/config\.js(?:\?|#|$)/i,
  /^\/nginx\.conf(?:\?|#|$)/i,
  /^\/public\/config\.js(?:\?|#|$)/i,
  /^\/assets\/config\.js(?:\?|#|$)/i
];

function blockSensitiveAssets(req: { url?: string | null }, res: any, next: () => void) {
  if (req.url && blockedAssetPaths.some((pattern) => pattern.test(req.url as string))) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Not Found');
    return;
  }

  next();
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  publicDir: './public',
  plugins: [react()],
  server: {
    port: 3001,
    fs: {
      deny: ['**/nginx.conf', '**/config.js']
    },
    middlewareMode: false,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/grpc': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    },
    // Explicitly block access to sensitive deployment/runtime files even if they
    // are accidentally placed in a served location.
    configureServer(server) {
      server.middlewares.use(blockSensitiveAssets);
    }
  },
  preview: {
    port: 3001,
    configurePreviewServer(server) {
      server.middlewares.use(blockSensitiveAssets);
    }
  },
  build: {
    chunkSizeWarningLimit: 600 * 1024,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  }
});
