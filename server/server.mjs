// Сервер сайта: заявки с форм (POST /api/lead) и админ-панель (/api/admin/*).
// Каждая заявка: 1) пишется в таблицу (CSV) — сразу, до всего остального,
//                2) уходит в MAX, 3) уходит на e-mail — если они настроены (админка → «Настройки»).
// Если один канал упал — остальные работают.
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import Busboy from 'busboy';
import nodemailer from 'nodemailer';
import { createAdmin } from './admin.mjs';

// ── Настройки из .env рядом с файлом (без сторонних библиотек)
const HERE = dirname(fileURLToPath(import.meta.url));
const envFile = process.env.ENV_FILE || join(HERE, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const C = {
  port: +(process.env.PORT || 3100),
  data: process.env.DATA_DIR || join(HERE, 'data'),
  smtpHost: process.env.SMTP_HOST, smtpPort: +(process.env.SMTP_PORT || 465),
  smtpUser: process.env.SMTP_USER, smtpPass: process.env.SMTP_PASS, smtpFrom: process.env.SMTP_FROM || process.env.SMTP_USER,
  maxApi: (process.env.MAX_API || 'https://platform-api2.max.ru').replace(/\/$/, ''),
  captchaKey: process.env.SMARTCAPTCHA_SERVER_KEY,
  test: process.env.TEST_MODE === '1',
  // Админ-панель: пароль и папка с кодом сайта (build.mjs, assets, admin)
  adminPassword: process.env.ADMIN_PASSWORD || '',
  siteDir: process.env.SITE_DIR || join(HERE, '..'),
  siteUrl: (process.env.SITE_URL || 'http://localhost:4173').replace(/\/$/, ''),
};
mkdirSync(join(C.data, 'uploads'), { recursive: true });
const HOST = new URL(C.siteUrl).host;

// Настройки уведомлений: админка → «Настройки» (data/settings.json); значения из .env — запасные
const settingsFile = join(C.data, 'settings.json');
const readSettings = () => { try { return JSON.parse(readFileSync(settingsFile, 'utf8')); } catch { return {}; } };
const N = () => {
  const s = readSettings();
  return {
    mailTo: s.mailTo || process.env.MAIL_TO || '',
    maxToken: s.maxToken || process.env.MAX_TOKEN || '', maxUser: s.maxUser || process.env.MAX_USER_ID || '', maxChat: s.maxChat || process.env.MAX_CHAT_ID || '',
  };
};
const siteName = () => { try { return JSON.parse(readFileSync(join(process.env.CONTENT_DIR || join(C.siteDir, 'content'), 'site.json'), 'utf8')).name || HOST; } catch { return HOST; } };

const FORMS = {
  zayavka: 'Заявка с сайта',
  quick: 'Быстрый вопрос',
};
const LABELS = {
  name: 'Имя', contact: 'Телефон / Telegram', phone: 'Телефон', email: 'E-mail', city: 'Город', comment: 'Комментарий',
};
const LIMITS = { files: 5, fileSize: 15 * 1024 * 1024, fields: 30, fieldSize: 5000 };

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ── Валидация (дублирует проверку в браузере)
const isPhone = (v) => /^\+7\D*(\d\D*){10}$/.test(v);
const isTg = (v) => /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(v) || /^(https?:\/\/)?t\.me\/[a-zA-Z0-9_]{5,}/.test(v);
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
function validate(form, f) {
  if (!form || form.length > 60) return 'Неизвестная форма';
  if (f.consent !== 'on') return 'Нет согласия на обработку данных';
  // Набор полей свободный (формы собираются в админ-панели), но способ связи обязателен
  if (f.contact && !(isPhone(f.contact) || isTg(f.contact))) return 'Неверный телефон или Telegram';
  if (f.phone && !isPhone(f.phone)) return 'Неверный телефон';
  if (f.email && !isEmail(f.email)) return 'Неверный e-mail';
  return f.contact || f.phone || f.email ? null : 'Не указан способ связи';
}
// Поля, добавленные в форму через админку (имя поля = его подпись)
const SYSTEM_FIELDS = new Set(['form', 'form_title', 'consent', 'website', 'page', 'smart-token', 'files']);
const extraFields = (f) => Object.entries(f).filter(([k, v]) => !SYSTEM_FIELDS.has(k) && !(k in LABELS) && v).slice(0, 20).map(([k, v]) => [k.slice(0, 60), v.slice(0, 2000)]);

// ── Защита от спама: honeypot + лимит запросов + (опционально) Яндекс SmartCaptcha
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  list.push(now); hits.set(ip, list);
  return list.length > 8;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.every((t) => now - t > 10 * 60e3)) hits.delete(k); }, 60e3).unref();

async function captchaOk(token, ip) {
  if (!C.captchaKey) return true;
  if (!token) return false;
  try {
    const u = new URL('https://smartcaptcha.yandexcloud.net/validate');
    u.search = new URLSearchParams({ secret: C.captchaKey, token, ip }).toString();
    const r = await fetch(u, { signal: AbortSignal.timeout(5000) });
    return (await r.json()).status === 'ok';
  } catch (e) { log('captcha error, пропускаю', e.message); return true; } // сбой капчи не должен терять заявки
}

// ── Каналы доставки
const csvCell = (v) => '"' + String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
function saveToTable(lead) {
  // Отдельная «вкладка» для партнёров, как в ТЗ
  const file = join(C.data, 'leads.csv');
  const cols = ['id', 'date', 'formTitle', 'name', 'contact', 'phone', 'email', 'city', 'comment', 'files', 'page', 'ip', 'extra'];
  if (!existsSync(file)) writeFileSync(file, '﻿' + cols.join(';') + '\n'); // BOM — чтобы Excel открыл кириллицу
  const val = (c) => (c === 'extra' ? lead.extra.map(([k, v]) => `${k}: ${v}`).join(' | ') : c === 'files' ? lead.files.map((f) => f.name).join(', ') : lead[c]);
  appendFileSync(file, cols.map((c) => csvCell(val(c))).join(';') + '\n');
}

function leadText(lead, md = false) {
  const b = (s) => (md ? `**${s}**` : s);
  const lines = [`${b('📩 ' + lead.formTitle)}  ·  ${HOST}  ·  ${lead.date}`];
  for (const k of Object.keys(LABELS)) if (lead[k]) lines.push(`${b(LABELS[k] + ':')} ${lead[k]}`);
  for (const [k, v] of lead.extra) lines.push(`${b(k + ':')} ${v}`);
  if (lead.files.length) lines.push(`${b('Файлы:')} ${lead.files.map((f) => f.name).join(', ')} (${md ? 'отправлены ниже' : 'во вложении'})`);
  lines.push(`Страница: ${lead.page || '—'}`);
  return lines.join('\n');
}

// ── MAX: текст заявки + фото и файлы отдельными сообщениями
const MAX_IMG = /\.(jpe?g|png|gif|heic|bmp|tiff?)$/i; // форматы, которые MAX принимает как фото (webp — как файл)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const maxTarget = (n) => (n.maxChat ? `chat_id=${n.maxChat}` : `user_id=${n.maxUser}`);

async function maxMessage(payload, n = N()) {
  const body = JSON.stringify(payload);
  if (C.test && !process.env.MAX_API_FORCE) { log('[TEST] MAX →', maxTarget(n), body.slice(0, 300)); return; }
  for (let attempt = 1; attempt <= 6; attempt++) {
    const r = await fetch(`${C.maxApi}/messages?${maxTarget(n)}`, {
      method: 'POST', headers: { Authorization: n.maxToken, 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15000),
    });
    if (r.ok) return;
    const t = await r.text();
    // 429 — лимит запросов; attachment.not.ready — MAX ещё обрабатывает загруженный файл
    const retry = r.status === 429 || /attachment\.not\.ready/.test(t);
    if (!retry || attempt === 6) throw new Error(`MAX ${r.status}: ${t.slice(0, 200)}`);
    await sleep(1000 * 2 ** (attempt - 1));
  }
}

async function maxUpload(file, n = N()) {
  const type = MAX_IMG.test(file.name) ? 'image' : 'file';
  const r1 = await fetch(`${C.maxApi}/uploads?type=${type}`, { method: 'POST', headers: { Authorization: n.maxToken }, signal: AbortSignal.timeout(15000) });
  if (!r1.ok) throw new Error(`MAX uploads ${r1.status}: ${(await r1.text()).slice(0, 150)}`);
  const { url, token: preToken } = await r1.json();
  const fd = new FormData();
  fd.append('data', new Blob([readFileSync(file.path)]), file.name);
  const r2 = await fetch(url, { method: 'POST', headers: { Authorization: n.maxToken }, body: fd, signal: AbortSignal.timeout(90000) });
  if (!r2.ok) throw new Error(`MAX upload ${r2.status}: ${(await r2.text()).slice(0, 150)}`);
  const j = await r2.json().catch(() => ({}));
  const token = type === 'image' ? Object.values(j.photos || {})[0]?.token || preToken : j.token || preToken;
  if (!token) throw new Error('MAX upload: не пришёл токен');
  return { type, payload: { token } };
}

const maxReady = (n) => !!(n.maxToken && (n.maxUser || n.maxChat));
async function sendMax(lead) {
  if (!maxReady(N())) throw new Error('MAX не настроен');
  await maxMessage({ text: leadText(lead, true).slice(0, 3990), format: 'markdown' });
}

// Вложения отправляем после текста и не задерживаем ответ сайту; ошибки только в журнал
async function sendMaxFiles(lead) {
  if (!lead.files.length || !maxReady(N())) return 'нет';
  if (C.test && !process.env.MAX_API_FORCE) { log('[TEST] MAX файлы →', lead.files.map((f) => f.name).join(', ')); return 'test'; }
  const up = await Promise.allSettled(lead.files.map(maxUpload));
  const ok = up.filter((u) => u.status === 'fulfilled').map((u) => u.value);
  const failed = up.filter((u) => u.status === 'rejected').map((u) => u.reason.message);
  const images = ok.filter((a) => a.type === 'image'), files = ok.filter((a) => a.type === 'file');
  await sleep(1500); // MAX просит паузу после загрузки перед отправкой
  for (let i = 0; i < images.length; i += 12) await maxMessage({ text: `📎 Фото к заявке ${lead.id}`, attachments: images.slice(i, i + 12) });
  for (const f of files) await maxMessage({ text: `📎 Файл к заявке ${lead.id}`, attachments: [f] }); // файл нельзя совмещать с фото
  return `${ok.length}/${lead.files.length}` + (failed.length ? ` (ошибки: ${failed.join('; ')})` : '');
}

const mailer = C.test
  ? nodemailer.createTransport({ streamTransport: true, buffer: true })
  : nodemailer.createTransport({ host: C.smtpHost, port: C.smtpPort, secure: C.smtpPort === 465, auth: { user: C.smtpUser, pass: C.smtpPass } });

const mailReady = () => !!(N().mailTo && (C.test || (C.smtpHost && C.smtpPass)));
async function sendMail(msg) {
  if (!C.test && !(C.smtpHost && C.smtpPass)) throw new Error('почта для отправки не настроена на сервере (SMTP)');
  if (!msg.to) throw new Error('не указан адрес для заявок (Настройки)');
  const info = await mailer.sendMail({ from: `"${siteName().replace(/["<>]/g, '')}" <${C.smtpFrom}>`, ...msg });
  if (C.test) {
    mkdirSync(join(C.data, 'outbox'), { recursive: true });
    writeFileSync(join(C.data, 'outbox', `${Date.now()}-${randomUUID().slice(0, 6)}.eml`), info.message);
  }
}

async function notifyOwner(lead) {
  const html = `<h2 style="font-family:sans-serif">${lead.formTitle}</h2><table style="font-family:sans-serif;font-size:15px;border-collapse:collapse">` +
    [...Object.keys(LABELS).filter((k) => lead[k]).map((k) => [LABELS[k], lead[k]]), ...lead.extra].map(([k, v]) => `<tr><td style="padding:6px 16px 6px 0;color:#6F665B">${esc(k)}</td><td style="padding:6px 0"><b>${esc(v)}</b></td></tr>`).join('') +
    `<tr><td style="padding:6px 16px 6px 0;color:#6F665B">Страница</td><td>${esc(lead.page)}</td></tr><tr><td style="padding:6px 16px 6px 0;color:#6F665B">Время</td><td>${lead.date}</td></tr></table>`;
  await sendMail({
    to: N().mailTo,
    replyTo: lead.email || undefined,
    subject: `${lead.formTitle}: ${lead.name || lead.email || ''} — ${HOST}`,
    text: leadText(lead), html,
    attachments: lead.files.map((f) => ({ filename: f.name, path: f.path })),
  });
}


const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ── Разбор multipart
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const fields = {}, files = [], pending = [];
    let bb;
    // defParamCharset: иначе кириллица в именах файлов читается как latin1 («Ð¼ÐµÐ¼.png»)
    try { bb = Busboy({ headers: req.headers, limits: LIMITS, defParamCharset: 'utf8' }); } catch (e) { return reject(e); }
    bb.on('field', (k, v) => { fields[k] = v.trim(); });
    bb.on('file', (k, stream, info) => {
      if (!info.filename) return stream.resume();
      const ext = extname(info.filename).toLowerCase();
      if (!/^\.(jpe?g|png|webp|heic|gif|pdf)$/.test(ext)) return stream.resume();
      const path = join(C.data, 'uploads', `${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
      const chunks = [];
      stream.on('data', (c) => chunks.push(c));
      pending.push(new Promise((ok) => stream.on('end', () => {
        if (!stream.truncated) { writeFileSync(path, Buffer.concat(chunks)); files.push({ name: info.filename.slice(0, 120), path }); }
        ok();
      })));
    });
    bb.on('close', () => Promise.all(pending).then(() => resolve({ fields, files })));
    bb.on('error', reject);
    req.pipe(bb);
  });
}

const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

// Проверочная отправка из админки («Настройки» → «Отправить тестовую заявку»)
async function testNotify() {
  const lead = { id: 'test', date: new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }), form: 'test', formTitle: 'Проверка уведомлений', name: 'Тест', comment: 'Если вы видите это сообщение, уведомления о заявках работают.', extra: [], files: [], page: '/admin/' };
  for (const k of Object.keys(LABELS)) lead[k] ??= '';
  const n = N();
  const [mx, ml] = await Promise.allSettled([maxReady(n) ? sendMax(lead) : Promise.reject(new Error('не настроен')), n.mailTo ? notifyOwner(lead) : Promise.reject(new Error('не указан адрес'))]);
  const st = (r) => (r.status === 'fulfilled' ? 'отправлено' : r.reason.message);
  return { max: st(mx), mail: st(ml) };
}

// ── Админ-панель (/api/admin/*). Если не поднялась — заявки всё равно принимаются
let admin = null;
try { admin = await createAdmin({ dataDir: C.data, siteDir: C.siteDir, password: C.adminPassword, log, notify: { status: () => ({ mail: mailReady(), max: maxReady(N()), smtp: !!(C.smtpHost && C.smtpPass) }), test: (s) => testNotify(s) } }); }
catch (e) { log('Админ-панель не запущена:', e.message); }

// ── HTTP-сервер
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, { ok: true, mail: mailReady(), max: maxReady(N()), test: C.test, admin: !!admin });
  }
  const ip = (req.headers['x-real-ip'] || req.socket.remoteAddress || '').toString();
  if (url.pathname.startsWith('/api/admin/')) {
    if (!admin) return json(res, 503, { ok: false, error: 'Админ-панель не запущена' });
    return admin(req, res, url, ip);
  }
  if (req.method !== 'POST' || url.pathname !== '/api/lead') return json(res, 404, { ok: false });

  if (rateLimited(ip)) return json(res, 429, { ok: false, error: 'Слишком много заявок, попробуйте позже' });

  let data;
  try { data = await parseForm(req); } catch (e) { log('parse error', e.message); return json(res, 400, { ok: false }); }
  const { fields: f, files } = data;

  if (f.website) { log('honeypot: бот отсеян', ip); return json(res, 200, { ok: true }); } // бот не должен понять, что его отсеяли
  const form = f.form;
  const err = validate(form, f);
  if (err) return json(res, 422, { ok: false, error: err });
  if (!(await captchaOk(f['smart-token'], ip))) return json(res, 403, { ok: false, error: 'Проверка от спама не пройдена' });

  const lead = {
    id: randomUUID().slice(0, 8), date: new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
    form, formTitle: FORMS[form] || (f.form_title || form).slice(0, 80), extra: extraFields(f), page: (f.page || '').slice(0, 200), ip, files,
    ...Object.fromEntries(Object.keys(LABELS).map((k) => [k, (f[k] || '').slice(0, 2000)])),
  };

  // 1) таблица — до отправки куда-либо, чтобы заявка не потерялась ни при каком сбое
  let saved = false;
  try { saveToTable(lead); saved = true; } catch (e) { log('CSV error', e.message); }

  // 2) MAX и e-mail параллельно, независимо друг от друга
  const [mx, ml] = await Promise.allSettled([sendMax(lead), notifyOwner(lead)]);
  const st = (r) => (r.status === 'fulfilled' ? 'ok' : 'ошибка: ' + r.reason.message);
  log(`lead ${lead.id} ${form} | table:${saved} | max:${st(mx)} | mail:${st(ml)}`);
  try { appendFileSync(join(C.data, 'delivery.log'), `${new Date().toISOString()} ${lead.id} ${form} max=${st(mx)} mail=${st(ml)}\n`); } catch {}

  if (mx.status === 'fulfilled' && lead.files.length) {
    sendMaxFiles(lead)
      .then((r) => { try { appendFileSync(join(C.data, 'delivery.log'), `${new Date().toISOString()} ${lead.id} max-files=${r}\n`); } catch {} })
      .catch((e) => { log('MAX files error', e.message); try { appendFileSync(join(C.data, 'delivery.log'), `${new Date().toISOString()} ${lead.id} max-files=ошибка: ${e.message}\n`); } catch {} });
  }
  const delivered = saved || mx.status === 'fulfilled' || ml.status === 'fulfilled';
  return delivered ? json(res, 200, { ok: true, id: lead.id }) : json(res, 500, { ok: false });
});

server.listen(C.port, '127.0.0.1', () => log(`Обработчик заявок слушает 127.0.0.1:${C.port}${C.test ? ' (TEST_MODE)' : ''}`));
