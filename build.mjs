// Сборка статического сайта без зависимостей.
// Источник правды — папка content/ (её же редактирует админ-панель):
//   content/pages/**/*.html   страницы; в начале файла — <!--meta {...} -->, адрес = путь к файлу
//   content/partials/*.html   общие блоки (шапка, подвал, формы): <!--@include имя-->
//   content/blocks/*.html     шаблоны блоков для вставки в редакторе
//   content/theme.json        цвета и шрифты; content/site.json — название сайта; content/media, content/fonts — загруженные файлы
// Запуск: node build.mjs → dist/. Этот же модуль использует сервер админки (server/admin.mjs).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, cpSync, rmSync, existsSync, renameSync, realpathSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = dirname(fileURLToPath(import.meta.url));
// Адрес сайта (для canonical, sitemap) задаёт сервер: SITE_URL=https://ivan.artwillkrd.ru
export const SITE = (process.env.SITE_URL || 'http://localhost:4173').replace(/\/$/, '');

// Шрифты, которые можно выбрать в админке (кроме загруженных): название → CSS-стек
export const FONT_STACKS = {
  Manrope: "'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif",
  Unbounded: "'Unbounded', system-ui, sans-serif",
  'Системный': "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Verdana: 'Verdana, Geneva, sans-serif',
  Tahoma: 'Tahoma, Geneva, sans-serif',
  'Trebuchet MS': "'Trebuchet MS', Arial, sans-serif",
  Georgia: "Georgia, 'Times New Roman', serif",
  'Times New Roman': "'Times New Roman', Times, serif",
  'Courier New': "'Courier New', Courier, monospace",
};
const DIRS = { page: 'pages', partial: 'partials', block: 'blocks' };
const ID_RE = { page: /^[a-z0-9-]+(\/[a-z0-9-]+)*$/, partial: /^[a-z0-9-]+$/, block: /^[a-z0-9-]+$/ };

export const idToUrl = (id) => (id === 'index' ? '/' : id === '404' ? '/404.html' : '/' + id.replace(/\/index$/, '') + '/');
export const urlToId = (url) => (url === '/' ? 'index' : url === '/404.html' ? '404' : url.replace(/^\/|\/$/g, ''));

export function parseDoc(src) {
  const m = src.match(/^<!--meta\s*([\s\S]*?)-->/);
  return { meta: m ? JSON.parse(m[1]) : {}, body: src.replace(/^<!--meta[\s\S]*?-->\s*/, '') };
}
export const formatDoc = (meta, body) => `<!--meta ${JSON.stringify(meta || {}, null, 2)} -->\n\n${String(body).trim()}\n`;

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [];
  });
}

export function makeSite({ root = ROOT, content = process.env.CONTENT_DIR || join(root, 'content'), dist = process.env.DIST_DIR || join(root, 'dist') } = {}) {
  const file = (kind, id) => {
    if (!DIRS[kind] || !ID_RE[kind].test(id)) throw new Error('Недопустимое имя: ' + id);
    return join(content, DIRS[kind], id + '.html');
  };
  const exists = (kind, id) => { try { return existsSync(file(kind, id)); } catch { return false; } };
  const readDoc = (kind, id) => ({ kind, id, ...parseDoc(readFileSync(file(kind, id), 'utf8')) });
  const listDocs = (kind) => {
    const base = join(content, DIRS[kind]);
    return walk(base)
      .map((f) => {
        const id = relative(base, f).replace(/\\/g, '/').replace(/\.html$/, '');
        const { meta } = parseDoc(readFileSync(f, 'utf8'));
        return { kind, id, meta, mtime: statSync(f).mtimeMs, ...(kind === 'page' ? { url: idToUrl(id) } : {}) };
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  };

  // ── Общие блоки
  const partialBody = (name) => {
    try { return parseDoc(readFileSync(file('partial', name), 'utf8')).body; }
    catch { console.warn(`⚠ общий блок не найден: ${name}`); return ''; }
  };
  // edit = режим редактора: общий блок оборачивается, чтобы при сохранении вернуть на его место <!--@include-->
  const includes = (html, edit = false, depth = 0) =>
    depth > 8 ? html : html.replace(/<!--@include ([\w-]+)-->/g, (_, n) => {
      const inner = includes(partialBody(n), edit, depth + 1);
      return edit ? `<div data-aw-include="${n}">${inner}</div>` : inner;
    });

  // ── Название сайта (меняется в админке → «Настройки»)
  const readSite = () => { try { return JSON.parse(readFileSync(join(content, 'site.json'), 'utf8')); } catch { return {}; } };

  // ── Оформление
  const readTheme = () => { try { return JSON.parse(readFileSync(join(content, 'theme.json'), 'utf8')); } catch { return {}; } };
  const fontStack = (name, theme) => FONT_STACKS[name] || ((theme.fonts || []).some((f) => f.family === name) ? `'${name}', system-ui, sans-serif` : null);
  const safeCss = (v) => String(v).replace(/[<>{};]/g, '');
  function themeCss(theme = readTheme()) {
    let css = '';
    for (const f of theme.fonts || []) {
      const fmt = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[String(f.file).split('.').pop()] || 'woff2';
      css += `@font-face{font-family:'${safeCss(f.family)}';src:url(/assets/fonts/${encodeURIComponent(f.file)}) format('${fmt}');font-weight:${safeCss(f.weight || '100 900')};font-style:${safeCss(f.style || 'normal')};font-display:swap}\n`;
    }
    const vars = Object.entries(theme.colors || {}).filter(([k, v]) => /^--[\w-]+$/.test(k) && v).map(([k, v]) => `${k}:${safeCss(v)}`);
    const fb = theme.fontBody && fontStack(theme.fontBody, theme), fh = theme.fontHead && fontStack(theme.fontHead, theme);
    if (fb) vars.push(`--ff:${fb}`);
    if (fh) vars.push(`--ff-h:${fh}`);
    if (theme.radius != null && theme.radius !== '') vars.push(`--radius:${+theme.radius}px`, `--radius-sm:${Math.round(+theme.radius * 0.66)}px`);
    if (theme.baseSize) vars.push(`font-size:${+theme.baseSize}%`);
    if (vars.length) css += `:root{${vars.join(';')}}\n`;
    if (theme.customCss) css += String(theme.customCss).replace(/<\/style/gi, '') + '\n';
    return css;
  }
  // Значения по умолчанию из style.css — чтобы показать их в админке
  function themeDefaults() {
    const css = readFileSync(join(root, 'assets/css/style.css'), 'utf8');
    const block = (css.match(/:root\s*{([\s\S]*?)}/) || [])[1] || '';
    return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
  }

  // ── Картинки: всем <img> из /assets/img/*-640|1280.(webp|jpg) без srcset добавляем варианты
  const imgDirs = [join(root, 'assets', 'img'), join(content, 'media')];
  function addSrcset(html) {
    return html.replace(/<img\b(?![^>]*\bsrcset=)([^>]*?)\bsrc="\/assets\/img\/([\w-]+)-(640|1280)\.(webp|jpg)"([^>]*)>/g, (m, pre, name, size, ext, post) => {
      const has = (w) => imgDirs.some((d) => existsSync(join(d, `${name}-${w}.${ext}`)));
      if (!has(400)) return m;
      const widths = size === '640' ? [400, 640] : [400, 640, 1280];
      const set = widths.filter(has).map((w) => `/assets/img/${name}-${w}.${ext} ${w}w`).join(', ');
      const attrW = +((pre + post).match(/\bwidth="(\d+)"/) || [])[1] || 640;
      const sizes = attrW <= 120 ? `${attrW}px` : size === '640' ? `(max-width: 700px) 92vw, ${Math.min(attrW, 640)}px` : '(max-width: 700px) 92vw, 50vw';
      return `<img${pre}src="/assets/img/${name}-${size}.${ext}" srcset="${set}" sizes="${sizes}"${post}>`;
    });
  }

  function breadcrumbs(crumbs, url) {
    if (!crumbs || !crumbs.length) return { html: '', ld: null };
    const all = [{ name: 'Главная', url: '/' }, ...crumbs];
    const html =
      '<nav class="crumbs" aria-label="Хлебные крошки"><div class="wrap"><ol>' +
      all.map((c, i) => (i === all.length - 1 ? `<li aria-current="page">${c.name}</li>` : `<li><a href="${c.url}">${c.name}</a></li>`)).join('') +
      '</ol></div></nav>';
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: all.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE + (c.url || url) })),
    };
    return { html, ld };
  }

  // Версия статики для сброса кэша браузера
  const version = () => createHash('md5').update(readFileSync(join(root, 'assets/css/style.css'))).update(readFileSync(join(root, 'assets/js/main.js'))).digest('hex').slice(0, 8);

  // Для редактора: без скриптов; <noscript> прячем в <template>, иначе браузер испортит его содержимое при сохранении
  const forEditor = (html) => html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<noscript\b[^>]*>/gi, '<template data-aw-noscript>').replace(/<\/noscript>/gi, '</template>');

  // ── HTML одной страницы. edit: null | { root: 'body' | 'header' | 'footer' } — разметка для редактора
  const START = '<!--aw:start-->', END = '<!--aw:end-->';
  function pageHtml({ url, meta, body }, { ver = version(), theme = readTheme(), edit = null } = {}) {
    const bc = breadcrumbs(meta.crumbs, url);
    const siteName = readSite().name || 'Мой сайт';
    const ld = [...(meta.jsonld || [])];
    if (bc.ld) ld.push(bc.ld);
    let head = partialBody('head')
      .replaceAll('{{title}}', meta.title || siteName)
      .replaceAll('{{sitename}}', siteName.replace(/[<>"]/g, ''))
      .replaceAll('{{description}}', meta.description || '')
      .replaceAll('{{canonical}}', SITE + url)
      .replaceAll('{{ogimage}}', SITE + (meta.ogimage || '/assets/img/og-default.jpg'))
      .replaceAll('{{jsonld}}', ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`).join('\n'))
      .replaceAll('{{v}}', ver)
      .replaceAll('{{robots}}', meta.noindex ? 'noindex, follow' : 'index, follow');
    const tcss = themeCss(theme);
    if (tcss || edit) head += `\n<style id="aw-theme">\n${tcss}</style>`;
    if (edit) head += '\n<link rel="stylesheet" href="/admin/frame.css">';

    const part = (name) => {
      if (!edit) return includes(partialBody(name));
      if (edit.root === name) return START + includes(partialBody(name), true) + END;
      return `<div data-aw-include="${name}">${includes(partialBody(name), true)}</div>`;
    };
    const main = edit ? (edit.root === 'body' ? START + includes(body, true) + END : '') : includes(body);
    let html =
      `<!doctype html>\n<html lang="ru"${edit ? ' class="aw-edit"' : ''}>\n<head>\n` + head + '\n</head>\n<body class="' + (meta.bodyClass || '') + '">\n' +
      part('header') + '\n<main id="main">\n' + bc.html + main + '\n</main>\n' + part('footer') + '\n</body>\n</html>\n';
    // В редакторе скрипты сайта не выполняются: страница остаётся ровно такой, как в исходнике
    // В редакторе srcset не добавляем — иначе он попал бы в исходник страницы при сохранении
    return edit ? forEditor(html) : addSrcset(html);
  }

  // HTML для редактора: страница, общий блок или шаблон блока внутри оболочки сайта
  function renderEdit(kind, id) {
    const doc = readDoc(kind, id);
    if (kind === 'page') return pageHtml({ url: idToUrl(id), meta: doc.meta, body: doc.body }, { edit: { root: 'body' } });
    const rootName = kind === 'partial' && (id === 'header' || id === 'footer') ? id : 'body';
    return pageHtml({ url: '/', meta: { title: doc.meta.title || id }, body: doc.body }, { edit: { root: rootName } });
  }
  // Фрагмент исходника → фрагмент для редактора (общие блоки раскрыты и обёрнуты)
  const expand = (html) => forEditor(includes(String(html), true));

  // ── Сборка. full: всё заново во временную папку и мгновенная подмена; иначе — только HTML поверх готового dist
  function build({ full = true } = {}) {
    const pages = listDocs('page').map((p) => ({ url: p.url, ...readDoc('page', p.id) }));
    const out = full ? `${dist}.tmp-${process.pid}` : dist;
    if (!full && !existsSync(dist)) return build({ full: true });
    if (full) {
      if (existsSync(out)) rmSync(out, { recursive: true });
      mkdirSync(out, { recursive: true });
      cpSync(join(root, 'assets'), join(out, 'assets'), { recursive: true });
      // Файлы в корень сайта как есть (подтверждение Яндекс.Вебмастера и т. п.)
      if (existsSync(join(root, 'static'))) cpSync(join(root, 'static'), out, { recursive: true });
      if (existsSync(join(content, 'media'))) cpSync(join(content, 'media'), join(out, 'assets', 'img'), { recursive: true });
      if (existsSync(join(content, 'fonts'))) cpSync(join(content, 'fonts'), join(out, 'assets', 'fonts'), { recursive: true });
      if (existsSync(join(root, 'admin'))) cpSync(join(root, 'admin'), join(out, 'admin'), { recursive: true });
    }
    const ver = version(), theme = readTheme();
    const indexed = [], written = new Set(), warnings = [];
    const TODAY = new Date().toISOString().slice(0, 10);
    for (const page of pages) {
      const { url, meta } = page;
      if (meta.title && meta.title.length > 60) warnings.push(`title > 60 символов: ${url} (${meta.title.length})`);
      if (meta.description && meta.description.length > 160) warnings.push(`description > 160 символов: ${url} (${meta.description.length})`);
      const file = url === '/' ? join(out, 'index.html') : url.endsWith('.html') ? join(out, url) : join(out, url, 'index.html');
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, pageHtml(page, { ver, theme }));
      written.add(file);
      if (!meta.noindex && !url.endsWith('.html')) indexed.push(url);
    }
    writeFileSync(
      join(out, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        indexed.sort().map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n') + '\n</urlset>\n'
    );
    writeFileSync(join(out, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /spasibo/\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);

    if (full) {
      const old = `${dist}.old-${process.pid}`;
      if (existsSync(dist)) renameSync(dist, old);
      renameSync(out, dist);
      if (existsSync(old)) rmSync(old, { recursive: true });
    } else {
      // Убираем страницы, которых больше нет (удалены или переименованы)
      const keepRoot = new Set(existsSync(join(root, 'static')) ? readdirSync(join(root, 'static')) : []);
      const prune = (dir, top) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (top && (f === 'assets' || f === 'admin' || keepRoot.has(f))) continue;
          if (statSync(p).isDirectory()) { prune(p, false); if (!readdirSync(p).length) rmSync(p, { recursive: true }); }
          else if (f.endsWith('.html') && !written.has(p)) rmSync(p);
        }
      };
      prune(dist, true);
    }
    return { pages: pages.length, warnings };
  }

  return { root, content, dist, file, exists, readDoc, listDocs, includes, expand, readSite, readTheme, themeCss, themeDefaults, pageHtml, renderEdit, build };
}

// Запуск из командной строки: node build.mjs
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = makeSite().build();
  for (const w of r.warnings) console.warn('⚠ ' + w);
  console.log(`Собрано страниц: ${r.pages}`);
}
