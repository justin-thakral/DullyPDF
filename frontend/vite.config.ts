import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, createReadStream, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { buildAppRouteHydrationCoverBootstrapScript } from './src/utils/appRouteHydrationCover';

function formCatalogAssetDevPlugin() {
  // Dev-only: serve /form-catalog-assets/<section>/<filename>.pdf from the
  // repo's top-level form_catalog/ directory. In production the assets are
  // uploaded to a separate GCS/CDN bucket and VITE_FORM_CATALOG_ASSET_BASE is
  // baked into the build.
  const catalogRoot = resolve(__dirname, '..', 'form_catalog');
  const MIME: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
  };
  return {
    name: 'dully-form-catalog-assets-dev',
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use('/form-catalog-assets', (req: { url?: string }, res: { statusCode?: number; setHeader: Function; end: Function }, next: Function) => {
        const urlPath = (req.url || '').split('?')[0];
        if (!urlPath || urlPath === '/' || urlPath.includes('..')) {
          next();
          return;
        }
        const filePath = resolve(catalogRoot, `.${urlPath}`);
        if (!filePath.startsWith(catalogRoot) || !existsSync(filePath)) {
          res.statusCode = 404;
          res.end('Form catalog asset not found');
          return;
        }
        try {
          const stat = statSync(filePath);
          if (!stat.isFile()) {
            next();
            return;
          }
          const ext = extname(filePath).toLowerCase();
          res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
          res.setHeader('Content-Length', String(stat.size));
          res.setHeader('Cache-Control', 'public, max-age=3600');
          createReadStream(filePath).pipe(res as unknown as NodeJS.WritableStream);
        } catch {
          res.statusCode = 500;
          res.end('Form catalog read error');
        }
      });
    },
  };
}

function appRouteHydrationCoverPlugin() {
  const bootstrapScript = buildAppRouteHydrationCoverBootstrapScript();
  const externalFileName = 'hydration-cover-bootstrap.js';
  return {
    name: 'dully-app-route-hydration-cover',
    configureServer(server: { middlewares: { use: Function } }) {
      server.middlewares.use(`/${externalFileName}`, (_req: unknown, res: { setHeader: Function; end: Function }) => {
        res.setHeader('Content-Type', 'application/javascript');
        res.end(bootstrapScript);
      });
    },
    transformIndexHtml(html: string) {
      return html.replace(
        /(<script\s+data-app-route-hydration-cover="true">)[\s\S]*?(<\/script>)/,
        `<script data-app-route-hydration-cover="true" src="/${externalFileName}"></script>`,
      );
    },
    generateBundle() {
      (this as any).emitFile({
        type: 'asset',
        fileName: externalFileName,
        source: bootstrapScript,
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = (env.VITE_API_URL || 'http://localhost:8000').replace(/\/+$/, '');
  return {
    plugins: [react(), appRouteHydrationCoverPlugin(), formCatalogAssetDevPlugin()],
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('pdfjs-dist')) return 'vendor-pdfjs';
            if (id.includes('/firebase/')) return 'vendor-firebase';
            if (id.includes('/read-excel-file/')) return 'vendor-data-import';
            if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
              return 'vendor-react';
            }
            return undefined;
          },
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: './test/setup.ts',
      clearMocks: true,
      restoreMocks: true,
    },
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        // /detect-fields is served by the same backend as /api/* (see
        // firebase.json rewrites). Proxy it here too so dev can talk to a
        // remote backend when VITE_DETECTION_API_URL points at localhost.
        '/detect-fields': {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
