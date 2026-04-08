import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  publicDir: './public',
  plugins: [react()],
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
    },
    // Prevent direct access to sensitive common files that may exist in the
    // public directory or be requested explicitly by scanners.
    middlewareMode: false,
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        if (url === '/config.js' || url === '/config.json') {
          res.statusCode = 404;
          res.end('Not Found');
          return;
        }
        next();
      });
    }
  },
  build: {
    chunkSizeWarningLimit: 600 * 1024
  }
});
