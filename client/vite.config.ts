import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  publicDir: './public',
  plugins: [react()],
  server: {
    port: 3001,
    fs: {
      deny: ['**/nginx.conf']
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
    // Explicitly block access to sensitive deployment files even if they are
    // accidentally placed in a served location.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && /^\/nginx\.conf(?:\?|#|$)/i.test(req.url)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Not Found');
          return;
        }
        next();
      });
    }
  },
  preview: {
    port: 3001,
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url && /^\/nginx\.conf(?:\?|#|$)/i.test(req.url)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Not Found');
          return;
        }
        next();
      });
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
