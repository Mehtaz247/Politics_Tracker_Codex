#!/usr/bin/env node
import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { generateChartsOnDemand } from './chart-generation-service.mjs';

const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || process.env.PORT || 5173);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg']
]);

const server = http.createServer(async (request, response) => {
  if (request.method === 'POST' && request.url === '/api/generate-charts') {
    try {
      const payload = await generateChartsOnDemand();
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(payload));
    } catch (error) {
      response.writeHead(error.statusCode || 500, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ error: error.message || 'Unable to generate charts' }));
    }
    return;
  }

  const safePath = decodeURIComponent(new URL(request.url, `http://${request.headers.host}`).pathname).replace(/^\/+/, '');
  let filePath = path.join(root, safePath || 'index.html');
  if (!filePath.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(filePath)) {
    const publicPath = path.join(root, 'public', safePath);
    filePath = existsSync(publicPath) ? publicPath : path.join(root, 'index.html');
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
    response.writeHead(200, { 'Content-Type': mime.get(path.extname(filePath)) || 'application/octet-stream' });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

server.listen(port, () => console.log(`Politics Tracker MVP running at http://localhost:${port}`));
