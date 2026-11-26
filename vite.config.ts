import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

function collectDistFiles(rootDir: string, currentDir = rootDir): { path: string; sha256: string; size: number }[] {
  const entries: { path: string; sha256: string; size: number }[] = [];
  if (!fs.existsSync(currentDir)) return entries;
  for (const item of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const full = path.join(currentDir, item.name);
    if (item.isDirectory()) {
      entries.push(...collectDistFiles(rootDir, full));
    } else if (item.isFile()) {
      const rel = path.relative(rootDir, full).replace(/\\/g, '/');
      if (
        rel === 'patch-manifest.json' ||
        rel === 'version.json' ||
        rel.endsWith('.map')
      ) {
        continue;
      }
      const buf = fs.readFileSync(full);
      const sha256 = createHash('sha256').update(buf).digest('hex');
      entries.push({ path: rel, sha256, size: buf.length });
    }
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function generatePatchManifestPlugin(): Plugin {
  return {
    name: 'ecogrow-patch-manifest',
    apply: 'build',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) return;
      let pkgVersion = '1.0.0';
      try {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as { version?: string };
        if (pkg.version) pkgVersion = pkg.version;
      } catch {
        // Fallback to 1.0.0
      }
      const files = collectDistFiles(distDir);
      const manifest = {
        version: pkgVersion,
        server_revision: process.env.ECOGROW_SERVER_REVISION || '1',
        files,
      };
      fs.writeFileSync(path.join(distDir, 'patch-manifest.json'), JSON.stringify(manifest));
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'pwa-maskable-512x512.png'],
        manifest: {
          id: './',
          name: 'EcoGrow Mission',
          short_name: 'EcoGrow',
          description: 'Cozy 3D farming, farmer challenges, and survival game.',
          theme_color: '#2d1f15',
          background_color: '#1b1612',
          display: 'fullscreen',
          orientation: 'landscape',
          start_url: './',
          scope: './',
          icons: [
            {
              src: './pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: './pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
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
          // Disabled in dev because server.ts sets hmr: false, which leaves Vite's client HMR transport undefined for registerDevSW()
          enabled: false,
          type: 'module',
        },
      }),
      generatePatchManifestPlugin(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) {
              return 'three-vendor';
            }
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
