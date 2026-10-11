import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** A tiny dependency-free static preview; exported for bounded browser tests. */
export function createPreviewServer({ root = fileURLToPath(new URL('../dist/', import.meta.url)), prefix = '/' } = {}) {
  const absoluteRoot = resolve(root);
  const normalizedPrefix = `/${prefix.replace(/^\/+|\/+$/g, '')}`.replace(/\/$/, '') || '';
  return createServer(async (request, response) => {
    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405, { Allow: 'GET, HEAD' }).end();
        return;
      }
      const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
      if (normalizedPrefix && pathname === normalizedPrefix) {
        response.writeHead(308, { Location: `${normalizedPrefix}/` }).end();
        return;
      }
      if (normalizedPrefix && !pathname.startsWith(`${normalizedPrefix}/`)) {
        response.writeHead(404).end('Not found');
        return;
      }
      const relativePath = pathname.slice(normalizedPrefix.length).replace(/^\/+/, '') || 'index.html';
      let filePath = resolve(absoluteRoot, relativePath);
      if (filePath !== absoluteRoot && !filePath.startsWith(`${absoluteRoot}${sep}`)) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      if ((await stat(filePath)).isDirectory()) filePath = resolve(filePath, 'index.html');
      const body = await readFile(filePath);
      response.writeHead(200, {
        'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
        'Content-Length': body.byteLength,
        'Cache-Control': 'no-store',
      });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portIndex = process.argv.indexOf('--port');
  const port = portIndex < 0 ? 4173 : Number(process.argv[portIndex + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error('Pass a valid port: npm run preview -- --port 4173');
    process.exit(1);
  }
  const server = createPreviewServer();
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    console.log(`Lily Hop preview: http://127.0.0.1:${address.port}/`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
