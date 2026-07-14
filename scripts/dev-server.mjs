#!/usr/bin/env node
import http from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '.');
const port = Number(process.argv[3] || process.env.PORT || 5173);
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.jpg', 'image/jpeg']
]);

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'GET' && requestUrl.pathname === '/api/trackers') {
    try {
      const manifest = await readJsonFile(resolveDataPath('trackers.json'));
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(manifest));
    } catch (error) {
      respondWithJsonError(response, error);
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/tracker') {
    try {
      const slug = requestUrl.searchParams.get('slug') || 'daniel-lurie';
      const entry = await findTrackerEntry(slug);
      const tracker = await readJsonFile(resolveDataPath(entry.file));
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(tracker));
    } catch (error) {
      respondWithJsonError(response, error);
    }
    return;
  }

  if (request.method === 'GET' && requestUrl.pathname === '/api/tracker-section') {
    try {
      const slug = requestUrl.searchParams.get('slug') || 'daniel-lurie';
      const section = requestUrl.searchParams.get('section');
      if (!section) {
        throw Object.assign(new Error('Missing required "section" query parameter'), { statusCode: 400 });
      }
      const entry = await findTrackerEntry(slug);
      const tracker = await readJsonFile(resolveDataPath(entry.file));
      if (!(section in tracker)) {
        throw Object.assign(new Error(`Unknown tracker section: ${section}`), { statusCode: 404 });
      }
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({
        slug,
        file: entry.file,
        section,
        updatedAt: tracker.subject?.lastUpdated || null,
        data: tracker[section],
      }));
    } catch (error) {
      respondWithJsonError(response, error);
    }
    return;
  }

  if (request.method !== 'GET') {
    response.writeHead(405).end('Method not allowed');
    return;
  }

  const safePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
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

function resolveDataPath(fileName) {
  return path.join(root, 'public', 'data', fileName);
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function findTrackerEntry(slug) {
  const manifest = await readJsonFile(resolveDataPath('trackers.json'));
  const entry = manifest.find((candidate) => candidate.slug === slug);
  if (!entry) {
    throw Object.assign(new Error(`Unknown tracker slug: ${slug}`), { statusCode: 404 });
  }
  return entry;
}

function respondWithJsonError(response, error) {
  response.writeHead(error.statusCode || 500, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: error.message || 'Unexpected server error' }));
}
