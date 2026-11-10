// Локальный запуск сайта вместе с админ-панелью — для проверки правок в коде шаблона.
//   node dev.mjs  → сайт http://localhost:4173, админка http://localhost:4173/admin/ (пароль: admin12345)
// Содержимое берётся из starter/ и копируется в .local/ (её можно удалить, чтобы начать заново).
// Заявки в этом режиме никуда не отправляются (TEST_MODE), письма складываются в .local/data/outbox.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { existsSync, cpSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = +(process.env.PORT || 4173), API_PORT = +(process.env.API_PORT || 3300);
const LOCAL = join(ROOT, '.local'), CONTENT = join(LOCAL, 'content'), DATA = join(LOCAL, 'data'), DIST = join(LOCAL, 'dist');
if (!existsSync(CONTENT)) cpSync(join(ROOT, 'starter'), CONTENT, { recursive: true });
mkdirSync(DATA, { recursive: true });

const env = { ...process.env, PORT: String(API_PORT), TEST_MODE: '1', ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'admin12345', SITE_URL: `http://localhost:${PORT}`, SITE_DIR: ROOT, CONTENT_DIR: CONTENT, DATA_DIR: DATA, DIST_DIR: DIST, ENV_FILE: '/dev/null' };
// Сборка сайта, затем сервер заявок и админки
await new Promise((ok, fail) => spawn(process.execPath, [join(ROOT, 'build.mjs')], { env, stdio: 'inherit' }).on('exit', (c) => (c ? fail(new Error('Сборка не удалась')) : ok())));
const api = spawn(process.execPath, [join(ROOT, 'server', 'server.mjs')], { env, stdio: 'inherit' });
process.on('exit', () => api.kill());
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.pdf': 'application/pdf' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) {
    const p = http.request({ host: '127.0.0.1', port: API_PORT, path: req.url, method: req.method, headers: { ...req.headers, 'x-real-ip': req.socket.remoteAddress } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
    p.on('error', () => { res.writeHead(502); res.end('{"ok":false}'); });
    return req.pipe(p);
  }
  let f = join(DIST, decodeURIComponent(url.pathname));
  if (!f.startsWith(DIST)) { res.writeHead(400); return res.end(); }
  try { if ((await stat(f)).isDirectory()) f = join(f, 'index.html'); } catch {}
  try {
    const body = await readFile(f);
    res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': TYPES['.html'] });
    res.end(await readFile(join(DIST, '404.html')).catch(() => 'Not found'));
  }
}).listen(PORT, () => console.log(`Сайт: http://localhost:${PORT}  ·  админка: http://localhost:${PORT}/admin/ (пароль ${env.ADMIN_PASSWORD})`));
