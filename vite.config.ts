import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Em desenvolvimento, as rotas /api rodam dentro do próprio Vite (na Vercel viram funções serverless).
// Os handlers são importados sob demanda, depois de carregar o .env.local em process.env.
const apiRoutes: Record<string, () => Promise<{ default: (req: any, res: any) => Promise<unknown> }>> = {
  '/api/summarize': () => import('./api/summarize.ts'),
  '/api/search-terms': () => import('./api/search-terms.ts'),
  '/api/extract-metadata': () => import('./api/extract-metadata.ts'),
  '/api/extract-text': () => import('./api/extract-text.ts'),
  '/api/storage': () => import('./api/storage.ts'),
};

// Middleware plugin to handle serverless /api/* endpoints in Vite dev server
function apiDevPlugin(): Plugin {
  return {
    name: 'api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) {
          return next();
        }

        if (req.method === 'GET' && req.url?.startsWith('/api/health')) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ status: 'ok', app: 'PaperTrail' }));
          return;
        }

        // Parse JSON body for POST requests
        if (req.method === 'POST') {
          let bodyStr = '';
          req.on('data', (chunk) => {
            bodyStr += chunk;
          });
          req.on('end', async () => {
            try {
              (req as any).body = bodyStr ? JSON.parse(bodyStr) : {};
            } catch {
              (req as any).body = {};
            }

            const urlPath = req.url?.split('?')[0] || '';
            try {
              const route = apiRoutes[urlPath];
              if (route) {
                const mod = await route();
                await mod.default(req as any, res as any);
              } else {
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Endpoint não encontrado' }));
              }
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message || 'Erro interno no servidor' }));
            }
          });
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''));
  return {
    plugins: [
      react(),
      tailwindcss(),
      apiDevPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: '/',
          name: 'PaperTrail',
          short_name: 'PaperTrail',
          description: 'Gerenciador de referências acadêmicas com identidade Retro Ledger, formatação ABNT e busca OpenAlex.',
          theme_color: '#FAF7F2',
          background_color: '#FAF7F2',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
