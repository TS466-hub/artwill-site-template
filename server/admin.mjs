// Админ-панель сайта: API под /api/admin/*. Интерфейс — статические файлы site/admin (отдаются как /admin/).
// Вход по паролю: ADMIN_PASSWORD из .env, пока владелец не сменит его в «Настройках» (тогда хэш — в data/settings.json). Каждое сохранение сразу пересобирает сайт; прошлые версии — в content/.history.
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync, renameSync, copyFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHmac, createHash, randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';
import Busboy from 'busboy';

const SESSION_DAYS = 14;
const KINDS = ['page', 'partial', 'block'];
const RESERVED = /^\/(assets|api|admin)\//;
const URL_RE = /^\/([a-z0-9-]+\/)*$/;
const NAME_RE = /^[a-z0-9-]+$/;
const IMG_EXT = /^\.(webp|jpe?g|png|gif|svg)$/;
const FONT_EXT = /^\.(woff2?|ttf|otf)$/;

export async function createAdmin({ dataDir, siteDir, password: envPassword, log, notify }) {
  const { makeSite, formatDoc, idToUrl, urlToId, FONT_STACKS } = await import(pathToFileURL(join(siteDir, 'build.mjs')).href);
  const site = makeSite({ root: siteDir });
  const { content, dist } = site;
  for (const d of ['pages', 'partials', 'blocks', 'media', 'fonts', '.history']) mkdirSync(join(content, d), { recursive: true });

  // ── Настройки владельца (уведомления, пароль): data/settings.json
  const settingsFile = join(dataDir, 'settings.json');
  const readSettings = () => { try { return JSON.parse(readFileSync(settingsFile, 'utf8')); } catch { return {}; } };
  const writeSettings = (s) => { const tmp = settingsFile + '.tmp'; writeFileSync(tmp, JSON.stringify(s, null, 2) + '\n', { mode: 0o600 }); renameSync(tmp, settingsFile); };
  const passHash = () => readSettings().passwordHash || '';
  const configured = () => !!(passHash() || envPassword);
  const hashPass = (p) => { const salt = randomBytes(16).toString('hex'); return `scrypt$${salt}$${scryptSync(String(p), salt, 32).toString('hex')}`; };

  // ── Сессии: подписанная кука, переживает перезапуск службы; смена пароля завершает все сессии
  const secretFile = join(dataDir, 'admin-secret');
  if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString('hex'), { mode: 0o600 });
  const secretBase = readFileSync(secretFile, 'utf8');
  const secret = () => createHash('sha256').update(secretBase).update(passHash() || envPassword || '').digest();
  const sign = (exp) => createHmac('sha256', secret()).update(String(exp)).digest('hex');
  const newToken = () => { const exp = Date.now() + SESSION_DAYS * 864e5; return `${exp}.${sign(exp)}`; };
  const authed = (req) => {
    const m = (req.headers.cookie || '').match(/(?:^|;\s*)aw_admin=(\d+)\.([a-f0-9]{64})/);
    if (!m || !configured() || +m[1] < Date.now()) return false;
    return timingSafeEqual(Buffer.from(m[2]), Buffer.from(sign(m[1])));
  };
  const samePass = (p) => {
    const h = passHash();
    if (h) { const [, salt, hex] = h.split('$'); return timingSafeEqual(scryptSync(String(p), salt, 32), Buffer.from(hex, 'hex')); }
    const a = createHash('sha256').update(String(p)).digest(), b = createHash('sha256').update(envPassword || '').digest();
    return timingSafeEqual(a, b);
  };
  const tries = new Map(); // ip → [время неудачных попыток]
  const tooMany = (ip) => (tries.get(ip) || []).filter((t) => Date.now() - t < 15 * 60e3).length >= 8;

  // ── Вспомогательное
  const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const fail = (code, error) => Object.assign(new Error(error), { code });
  const readJson = (req) => new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > 8e6) { reject(fail(413, 'Слишком большой запрос')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(fail(400, 'Неверный запрос')); } });
    req.on('error', reject);
  });
  const readFiles = (req, limit = 25e6) => new Promise((resolve, reject) => {
    const files = [], fields = {};
    let bb;
    try { bb = Busboy({ headers: req.headers, limits: { files: 12, fileSize: limit }, defParamCharset: 'utf8' }); } catch (e) { return reject(fail(400, 'Неверный запрос')); }
    bb.on('field', (k, v) => { fields[k] = v; });
    bb.on('file', (field, stream, info) => {
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      stream.on('end', () => { if (!stream.truncated) files.push({ field, filename: info.filename || '', data: Buffer.concat(chunks) }); });
    });
    bb.on('close', () => resolve({ files, fields }));
    bb.on('error', reject);
    req.pipe(bb);
  });
  const slug = (s) => {
    const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
    return String(s).toLowerCase().replace(/[а-яё]/g, (c) => map[c] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  };

  // ── История версий
  const histDir = (kind, id) => join(content, '.history', kind, id.replace(/\//g, '__'));
  function keepHistory(kind, id) {
    const f = site.file(kind, id);
    if (!existsSync(f)) return;
    const dir = histDir(kind, id);
    mkdirSync(dir, { recursive: true });
    copyFileSync(f, join(dir, new Date().toISOString().replace(/[:.]/g, '-') + '.html'));
    const all = readdirSync(dir).sort();
    for (const old of all.slice(0, Math.max(0, all.length - 40))) rmSync(join(dir, old));
  }
  function writeDoc(kind, id, meta, body) {
    const f = site.file(kind, id), text = formatDoc(meta, body);
    if (existsSync(f) && readFileSync(f, 'utf8') === text) return;
    keepHistory(kind, id);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, text);
  }
  const rebuild = (full = false) => { const r = site.build({ full }); return r.warnings; };
  const docKind = (k) => { if (!KINDS.includes(k)) throw fail(400, 'Неизвестный тип'); return k; };
  const need = (kind, id) => { if (!site.exists(kind, id)) throw fail(404, 'Не найдено'); };
  const crumbsFor = (url, name) => {
    const parts = url.split('/').filter(Boolean), crumbs = [];
    for (let i = 1; i < parts.length; i++) {
      const pid = parts.slice(0, i).join('/');
      if (!site.exists('page', pid)) continue;
      const pm = site.readDoc('page', pid).meta;
      crumbs.push({ name: (pm.crumbs && pm.crumbs.at(-1)?.name) || pm.title || pid, url: idToUrl(pid) });
    }
    return [...crumbs, { name, url }];
  };

  // ── Медиатека: встроенные картинки сайта (assets/img) + загруженные (content/media)
  function listMedia() {
    const groups = new Map();
    for (const [dir, builtin] of [[join(siteDir, 'assets', 'img'), true], [join(content, 'media'), false]]) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) {
        if (!IMG_EXT.test(extname(f).toLowerCase())) continue;
        const m = f.match(/^(.+)-(400|640|1280)\.(webp|jpg)$/);
        const key = m ? `${m[1]}.${m[3]}` : f;
        const g = groups.get(key) || { name: m ? m[1] : f.replace(/\.[^.]+$/, ''), ext: m ? m[3] : extname(f).slice(1), sizes: [], file: m ? null : f, builtin, mtime: 0 };
        if (m) g.sizes.push(+m[2]);
        g.mtime = Math.max(g.mtime, statSync(join(dir, f)).mtimeMs);
        groups.set(key, g);
      }
    }
    return [...groups.values()].map((g) => {
      g.sizes.sort((a, b) => a - b);
      const u = (w) => `/assets/img/${g.name}-${w}.${g.ext}`;
      return g.file
        ? { name: g.name, thumb: '/assets/img/' + g.file, src: '/assets/img/' + g.file, builtin: g.builtin, mtime: g.mtime, files: [g.file] }
        : { name: g.name, thumb: u(g.sizes[0]), src: u(g.sizes.at(-1)), small: u(g.sizes.includes(640) ? 640 : g.sizes.at(-1)), builtin: g.builtin, mtime: g.mtime, files: g.sizes.map((w) => `${g.name}-${w}.${g.ext}`) };
    }).sort((a, b) => b.mtime - a.mtime);
  }
  const mediaTaken = (name) => listMedia().some((m) => m.name === name);
  // Загруженный файл сразу кладём и в dist, чтобы он был виден без полной пересборки
  function storeAsset(sub, distSub, filename, data) {
    writeFileSync(join(content, sub, filename), data);
    try { mkdirSync(join(dist, 'assets', distSub), { recursive: true }); writeFileSync(join(dist, 'assets', distSub, filename), data); } catch (e) { log('admin: не удалось записать в dist', e.message); }
  }

  // ── Заявки (CSV, которые пишет обработчик)
  function parseCsv(file) {
    if (!existsSync(file)) return [];
    const text = readFileSync(file, 'utf8').replace(/^﻿/, '');
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ';') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }
  function readCsv(file) {
    const [head, ...rest] = parseCsv(file);
    return rest.filter((r) => r.length > 1).map((r) => Object.fromEntries(r.map((v, i) => [head[i] || 'extra', v])));
  }
  const csvLine = (r) => r.map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';') + '\n';
  // Удаление заявок: строки убираются из таблицы и переносятся в *-deleted.csv (на случай, если удалили по ошибке)
  function deleteLeads(ids) {
    let removed = 0;
    for (const name of ['leads', 'partners']) {
      const file = join(dataDir, name + '.csv');
      const [head, ...rest] = parseCsv(file);
      if (!head) continue;
      const col = head.indexOf('id');
      if (col < 0) continue;
      const gone = rest.filter((r) => r.length > 1 && ids.has(r[col]));
      if (!gone.length) continue;
      const keep = rest.filter((r) => !gone.includes(r));
      const trash = join(dataDir, name + '-deleted.csv');
      if (!existsSync(trash)) writeFileSync(trash, '\uFEFF' + head.join(';') + '\n');
      appendFileSync(trash, gone.map(csvLine).join(''));
      // Обработчик заявок пишет в этот же файл синхронно в том же процессе — гонки нет
      const tmp = file + '.tmp';
      writeFileSync(tmp, '\uFEFF' + head.join(';') + '\n' + keep.filter((r) => r.length > 1).map(csvLine).join(''));
      renameSync(tmp, file);
      removed += gone.length;
    }
    return removed;
  }

  // ── Маршруты
  const routes = {
    'GET /pages': () => ({ pages: site.listDocs('page').map((p) => ({ id: p.id, url: p.url, title: p.meta.title || '', description: p.meta.description || '', noindex: !!p.meta.noindex, name: p.meta.crumbs?.at(-1)?.name || '', mtime: p.mtime })) }),
    'GET /docs': ({ q }) => ({ docs: site.listDocs(docKind(q.kind)).map((d) => ({ id: d.id, title: d.meta.title || d.id, category: d.meta.category || '', order: d.meta.order ?? 999, system: !!d.meta.system, mtime: d.mtime })) }),
    'GET /doc': ({ q }) => { const k = docKind(q.kind); need(k, q.id); const d = site.readDoc(k, q.id); return { ...d, url: k === 'page' ? idToUrl(q.id) : null }; },
    'PUT /doc': async ({ req }) => {
      const { kind, id, meta, body } = await readJson(req);
      docKind(kind); need(kind, id);
      if (typeof body !== 'string' || typeof meta !== 'object' || !meta) throw fail(400, 'Неверные данные');
      writeDoc(kind, id, meta, body);
      return { ok: true, warnings: rebuild() };
    },
    'POST /doc': async ({ req }) => { // создать
      const b = await readJson(req), kind = docKind(b.kind);
      let id, meta, body = '';
      if (b.from) { need(docKind(b.from.kind), b.from.id); body = site.readDoc(b.from.kind, b.from.id).body; }
      if (typeof b.body === 'string') body = b.body;
      if (kind === 'page') {
        const url = String(b.url || '');
        if (!URL_RE.test(url) || url === '/' || RESERVED.test(url)) throw fail(422, 'Адрес — латинские буквы, цифры и дефис, например /uslugi/novaya-usluga/');
        id = urlToId(url);
        const title = String(b.title || '').trim() || 'Новая страница';
        const src = b.from?.kind === 'page' ? site.readDoc('page', b.from.id).meta : {};
        meta = { title, description: String(b.description || ''), ...(src.ogimage ? { ogimage: src.ogimage } : {}), crumbs: crumbsFor(url, String(b.name || title).trim()) };
        if (!body) body = `<section class="phead">\n  <div class="wrap">\n    <h1 class="phead__h">${title.replace(/</g, '&lt;')}</h1>\n    <p class="phead__lead">Короткое описание страницы.</p>\n  </div>\n</section>`;
      } else {
        const title = String(b.title || '').trim();
        if (!title) throw fail(422, 'Укажите название');
        id = NAME_RE.test(b.id || '') ? b.id : slug(title) || 'blok';
        for (let n = 2; site.exists(kind, id); n++) id = id.replace(/-\d+$/, '') + '-' + n;
        meta = { title, ...(kind === 'block' ? { category: String(b.category || 'Мои шаблоны') } : {}) };
      }
      if (site.exists(kind, id)) throw fail(409, 'Такой адрес уже занят');
      writeDoc(kind, id, meta, body);
      return { ok: true, id, warnings: rebuild() };
    },
    'DELETE /doc': ({ q }) => {
      const k = docKind(q.kind); need(k, q.id);
      if (k === 'page' && ['index', '404'].includes(q.id)) throw fail(422, 'Эту страницу удалить нельзя');
      if (k === 'partial' && ['head', 'header', 'footer'].includes(q.id)) throw fail(422, 'Этот блок нужен сайту, удалить его нельзя');
      if (k === 'partial') {
        const users = site.listDocs('page').filter((p) => site.readDoc('page', p.id).body.includes(`<!--@include ${q.id}-->`)).map((p) => p.url);
        if (users.length) throw fail(422, 'Блок используется на страницах: ' + users.join(', '));
      }
      keepHistory(k, q.id);
      rmSync(site.file(k, q.id));
      return { ok: true, warnings: rebuild() };
    },
    'POST /page/move': async ({ req }) => { // смена адреса + правка ссылок на всём сайте
      const { id, url } = await readJson(req);
      need('page', id);
      if (['index', '404'].includes(id)) throw fail(422, 'У этой страницы адрес не меняется');
      if (!URL_RE.test(url) || url === '/' || RESERVED.test(url)) throw fail(422, 'Адрес — латинские буквы, цифры и дефис, например /uslugi/novaya-usluga/');
      const nid = urlToId(url), old = idToUrl(id);
      if (site.exists('page', nid)) throw fail(409, 'Такой адрес уже занят');
      keepHistory('page', id);
      mkdirSync(dirname(site.file('page', nid)), { recursive: true });
      renameSync(site.file('page', id), site.file('page', nid));
      const moved = site.readDoc('page', nid);
      if (moved.meta.crumbs?.length) { // хлебные крошки — по новому месту страницы
        moved.meta.crumbs = crumbsFor(url, moved.meta.crumbs.at(-1).name);
        writeFileSync(site.file('page', nid), formatDoc(moved.meta, moved.body));
      }
      let changed = 0;
      for (const kind of KINDS) for (const d of site.listDocs(kind)) {
        const f = site.file(kind, d.id), src = readFileSync(f, 'utf8');
        const out = src.split(`"${old}"`).join(`"${url}"`).split(`"${old}#`).join(`"${url}#`);
        if (out !== src) { keepHistory(kind, d.id); writeFileSync(f, out); changed++; }
      }
      return { ok: true, id: nid, changed, warnings: rebuild() };
    },
    'POST /expand': async ({ req }) => ({ html: site.expand((await readJson(req)).html || '') }),
    'GET /history': ({ q }) => {
      const dir = histDir(docKind(q.kind), String(q.id));
      return { versions: existsSync(dir) ? readdirSync(dir).sort().reverse().map((f) => ({ ts: f.replace(/\.html$/, ''), size: statSync(join(dir, f)).size })) : [] };
    },
    'POST /history/restore': async ({ req }) => {
      const { kind, id, ts } = await readJson(req);
      docKind(kind);
      if (!/^[\dTZ-]+$/.test(ts)) throw fail(400, 'Неверная версия');
      const f = join(histDir(kind, id), ts + '.html');
      if (!existsSync(f)) throw fail(404, 'Версия не найдена');
      const text = readFileSync(f, 'utf8');
      keepHistory(kind, id);
      mkdirSync(dirname(site.file(kind, id)), { recursive: true });
      writeFileSync(site.file(kind, id), text);
      return { ok: true, warnings: rebuild() };
    },
    'GET /media': () => ({ media: listMedia() }),
    'POST /media': async ({ req, q }) => { // файлы с именами полей 400 / 640 / 1280 (готовые размеры) или raw (как есть)
      const { files } = await readFiles(req);
      if (!files.length) throw fail(400, 'Файл не получен');
      let name = slug(q.name || 'foto') || 'foto';
      name = name.replace(/-(400|640|1280)$/, '');
      const base = name;
      for (let n = 2; mediaTaken(name); n++) name = `${base}-v${n}`;
      const saved = [];
      for (const f of files) {
        const ext = extname(f.filename).toLowerCase().replace('.jpeg', '.jpg');
        if (!IMG_EXT.test(ext)) throw fail(422, 'Можно загружать только изображения');
        const fn = /^(400|640|1280)$/.test(f.field) && /^\.(webp|jpg)$/.test(ext) ? `${name}-${f.field}${ext}` : `${name}${ext}`;
        storeAsset('media', 'img', fn, f.data);
        saved.push(fn);
      }
      return { ok: true, item: listMedia().find((m) => m.name === name), saved };
    },
    'DELETE /media': ({ q }) => {
      const item = listMedia().find((m) => m.name === q.name && !m.builtin);
      if (!item) throw fail(404, 'Файл не найден');
      const used = KINDS.flatMap((k) => site.listDocs(k).filter((d) => item.files.some((f) => readFileSync(site.file(k, d.id), 'utf8').includes('/assets/img/' + f))).map((d) => d.meta.title || d.id));
      if (used.length && q.force !== '1') throw fail(409, 'Изображение используется: ' + used.slice(0, 5).join(', '));
      for (const f of item.files) { rmSync(join(content, 'media', f), { force: true }); rmSync(join(dist, 'assets', 'img', f), { force: true }); }
      return { ok: true };
    },
    'GET /theme': () => ({ theme: site.readTheme(), defaults: site.themeDefaults(), fonts: Object.keys(FONT_STACKS), stacks: FONT_STACKS }),
    'PUT /theme': async ({ req }) => {
      const { theme } = await readJson(req);
      if (typeof theme !== 'object' || !theme) throw fail(400, 'Неверные данные');
      const f = join(content, 'theme.json');
      if (existsSync(f)) { mkdirSync(join(content, '.history', 'theme'), { recursive: true }); copyFileSync(f, join(content, '.history', 'theme', new Date().toISOString().replace(/[:.]/g, '-') + '.json')); }
      writeFileSync(f, JSON.stringify(theme, null, 2) + '\n');
      return { ok: true, warnings: rebuild() };
    },
    'POST /theme/css': async ({ req }) => ({ css: site.themeCss((await readJson(req)).theme || {}) }),
    'POST /font': async ({ req, q }) => {
      const { files } = await readFiles(req, 5e6);
      const f = files[0];
      if (!f) throw fail(400, 'Файл не получен');
      const ext = extname(f.filename).toLowerCase();
      if (!FONT_EXT.test(ext)) throw fail(422, 'Подходят файлы шрифтов .woff2, .woff, .ttf, .otf');
      const family = String(q.family || f.filename.replace(/\.[^.]+$/, '')).replace(/['"<>{};\\]/g, '').trim().slice(0, 40) || 'Шрифт';
      const fn = `${slug(family) || 'font'}-${randomBytes(3).toString('hex')}${ext}`;
      storeAsset('fonts', 'fonts', fn, f.data);
      const theme = site.readTheme();
      theme.fonts = [...(theme.fonts || []), { family, file: fn, weight: q.weight === 'bold' ? '700' : '100 900' }];
      writeFileSync(join(content, 'theme.json'), JSON.stringify(theme, null, 2) + '\n');
      return { ok: true, theme, warnings: rebuild() };
    },
    'GET /leads': () => {
      // Дата в таблице — «10.11.2026, 08:52:07» (Москва); новые сверху, обе таблицы вперемешку
      const when = (d) => { const m = String(d).match(/(\d+)\.(\d+)\.(\d+),?\s*(\d+):(\d+):?(\d*)/); return m ? Date.UTC(m[3], m[2] - 1, m[1], m[4], m[5], m[6] || 0) : 0; };
      const rows = [...readCsv(join(dataDir, 'leads.csv')), ...readCsv(join(dataDir, 'partners.csv'))].map((r, i) => [when(r.date), i, r]);
      rows.sort((a, b) => b[0] - a[0] || b[1] - a[1]);
      return { leads: rows.slice(0, 1000).map((r) => r[2]) };
    },
    'POST /leads/delete': async ({ req }) => {
      const { ids } = await readJson(req);
      if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || ids.some((x) => typeof x !== 'string' || !x)) throw fail(400, 'Не выбраны заявки');
      const removed = deleteLeads(new Set(ids));
      if (!removed) throw fail(404, 'Заявки не найдены — возможно, их уже удалили');
      return { ok: true, removed };
    },
    'POST /rebuild': () => ({ ok: true, warnings: rebuild(true) }),

    // ── Настройки: название сайта, куда присылать заявки, пароль
    'GET /settings': ({ req }) => {
      const s = readSettings();
      return { name: site.readSite().name || '', host: req.headers.host || '', mailTo: s.mailTo || '', maxTokenSet: !!s.maxToken, maxUser: s.maxUser || '', maxChat: s.maxChat || '', status: notify ? notify.status() : {} };
    },
    'PUT /settings': async ({ req }) => {
      const b = await readJson(req), s = readSettings();
      const name = String(b.name ?? '').replace(/[<>"]/g, '').trim().slice(0, 80);
      if (name !== (site.readSite().name || '')) writeFileSync(join(content, 'site.json'), JSON.stringify({ ...site.readSite(), name }, null, 2) + '\n');
      const mails = String(b.mailTo ?? '').split(/[,;\s]+/).filter(Boolean);
      if (mails.some((m) => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(m))) throw fail(422, 'Проверьте адрес почты');
      s.mailTo = mails.join(', ');
      if (typeof b.maxToken === 'string' && b.maxToken.trim()) s.maxToken = b.maxToken.trim();
      if (b.maxToken === null) delete s.maxToken;
      for (const k of ['maxUser', 'maxChat']) { const v = String(b[k] ?? '').trim(); if (v && !/^-?\d{1,20}$/.test(v)) throw fail(422, 'ID в MAX — это число'); s[k] = v; }
      writeSettings(s);
      return { ok: true, warnings: rebuild(true) };
    },
    'POST /settings/password': async ({ req }) => {
      const { current, next } = await readJson(req);
      if (!samePass(current || '')) throw fail(403, 'Текущий пароль указан неверно');
      if (typeof next !== 'string' || next.length < 8) throw fail(422, 'Новый пароль — не короче 8 символов');
      writeSettings({ ...readSettings(), passwordHash: hashPass(next) });
      return { ok: true };
    },
    'POST /settings/test': async () => {
      if (!notify) throw fail(503, 'Недоступно');
      return { ok: true, result: await notify.test() };
    },
    'POST /settings/max-detect': async () => { // кто написал боту: чтобы не искать свой ID вручную
      const token = readSettings().maxToken;
      if (!token) throw fail(422, 'Сначала вставьте токен бота и сохраните');
      const api = (process.env.MAX_API || 'https://platform-api2.max.ru').replace(/\/$/, '');
      const r = await fetch(`${api}/updates?timeout=3&limit=100`, { headers: { Authorization: token }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw fail(502, `MAX ответил ошибкой ${r.status}. Проверьте токен`);
      const { updates = [] } = await r.json(), seen = new Map();
      for (const u of updates) {
        const user = u.user || u.message?.sender;
        if (user) seen.set(String(user.user_id), [user.first_name, user.last_name].filter(Boolean).join(' ') || user.name || '');
      }
      return { users: [...seen].map(([id, name]) => ({ id, name })) };
    },
  };

  // ── Точка входа: true, если запрос обработан
  return async function handle(req, res, url, ip) {
    if (!url.pathname.startsWith('/api/admin/')) return false;
    const path = url.pathname.slice('/api/admin'.length), q = Object.fromEntries(url.searchParams);
    try {
      // Защита от запросов с чужих сайтов
      const origin = req.headers.origin;
      if (req.method !== 'GET' && origin && new URL(origin).host !== req.headers.host) throw fail(403, 'Запрос с другого сайта отклонён');

      if (path === '/me' && req.method === 'GET') return send(res, 200, { ok: authed(req), configured: configured(), name: site.readSite().name || '' }), true;
      if (path === '/login' && req.method === 'POST') {
        if (!configured()) throw fail(503, 'Пароль админ-панели не задан на сервере (ADMIN_PASSWORD в .env)');
        if (tooMany(ip)) throw fail(429, 'Слишком много попыток. Подождите 15 минут');
        const { password: p } = await readJson(req);
        await new Promise((r) => setTimeout(r, 400));
        if (!samePass(p || '')) { tries.set(ip, [...(tries.get(ip) || []).filter((t) => Date.now() - t < 15 * 60e3), Date.now()]); log('admin: неверный пароль', ip); throw fail(401, 'Неверный пароль'); }
        tries.delete(ip);
        const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(req.headers.host || '');
        res.setHeader('Set-Cookie', `aw_admin=${newToken()}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}${local ? '' : '; Secure'}`);
        log('admin: вход', ip);
        return send(res, 200, { ok: true }), true;
      }
      if (path === '/logout' && req.method === 'POST') {
        res.setHeader('Set-Cookie', 'aw_admin=; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=0');
        return send(res, 200, { ok: true }), true;
      }
      if (!authed(req)) throw fail(401, 'Нужно войти');

      if (path === '/render' && req.method === 'GET') {
        const k = docKind(q.kind); need(k, q.id);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN', 'X-Robots-Tag': 'noindex' });
        return res.end(site.renderEdit(k, q.id)), true;
      }
      const route = routes[`${req.method} ${path}`];
      if (!route) throw fail(404, 'Не найдено');
      const out = await route({ req, q });
      if (req.method !== 'GET') log('admin:', req.method, path, q.kind || '', q.id || q.name || '');
      return send(res, 200, out), true;
    } catch (e) {
      if (!e.code || typeof e.code !== 'number') log('admin error', path, e.stack || e.message);
      if (!res.headersSent) send(res, typeof e.code === 'number' ? e.code : 500, { ok: false, error: typeof e.code === 'number' ? e.message : 'Ошибка сервера: ' + e.message });
      return true;
    }
  };
}
