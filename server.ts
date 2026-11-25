import { createMultiplayerServer } from './src/server/createMultiplayerServer.ts';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

async function startServer() {
  const { app, server } = createMultiplayerServer({ serveStaticDist: IS_PROD });

  if (!IS_PROD) {
    // Unregister any previously cached dev service worker and neutralize stale dev-SW entry imports
    app.get(['/dev-sw.js', '/sw.js'], (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.type('application/javascript').send(
        `self.addEventListener('install', () => self.skipWaiting());\n` +
          `self.addEventListener('activate', (event) => {\n` +
          `  event.waitUntil((async () => {\n` +
          `    const keys = await caches.keys();\n` +
          `    await Promise.all(keys.map((k) => caches.delete(k)));\n` +
          `    await self.registration.unregister();\n` +
          `  })());\n` +
          `});\n`
      );
    });
    app.get('/@vite-plugin-pwa/pwa-entry-point-loaded', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.type('application/javascript').send('export default function registerDevSW() {}\n');
    });

    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`EcoGrow Mission server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
