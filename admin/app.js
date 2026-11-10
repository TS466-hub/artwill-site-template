// Админ-панель сайта: вход, разделы, списки. Визуальный редактор — в editor.js.
import { h, set, api, btn, iconBtn, icon, esc, slug, toast, fail, modal, confirmBox, promptBox, mediaGrid, setUnauthorized } from './ui.js';
import { openEditor, pageSettingsModal } from './editor.js';

const app = document.getElementById('app');
let editor = null, mainEl = null;

const NAV = [
  ['pages', 'Страницы', 'pages'],
  ['shared', 'Общие блоки', 'shared'],
  ['blocks', 'Шаблоны блоков', 'blocks'],
  ['media', 'Изображения', 'image'],
  ['theme', 'Оформление', 'theme'],
  ['leads', 'Заявки', 'leads'],
  ['settings', 'Настройки', 'gear'],
];
let siteName = '';
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

// ── Вход
function showLogin(configured = true) {
  if (editor) { editor.teardown(); editor = null; }
  const pass = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password', placeholder: 'Пароль' });
  const err = h('p', { class: 'login__err' });
  const submit = btn('Войти', { class: 'btn--primary', type: 'submit', style: 'width:100%;margin-top:12px' });
  const form = h('form', { class: 'login__card', onsubmit: async (e) => {
    e.preventDefault(); err.textContent = ''; submit.disabled = true;
    try { await api('POST', '/login', { password: pass.value }); shell(); route(); }
    catch (ex) { err.textContent = ex.message; submit.disabled = false; pass.select(); }
  } },
    h('div', { class: 'login__logo' }, h('img', { src: '/assets/img/favicon.svg', alt: '' }), (siteName || location.host) + ' · управление сайтом'),
    configured ? [h('label', { class: 'fld', style: 'margin:0' }, h('span', {}, 'Пароль администратора'), pass), submit, err]
      : h('p', { class: 'hint' }, h('b', {}, 'Пароль ещё не задан'), 'Задайте его на сервере командой  sitectl password ' + location.host + '  — после этого здесь появится вход.'));
  app.replaceChildren(h('div', { class: 'login' }, form));
  configured && pass.focus();
}

// ── Каркас
function shell() {
  mainEl = h('main', { class: 'main' });
  app.replaceChildren(h('div', { class: 'shell' },
    h('nav', { class: 'side' },
      h('div', { class: 'side__logo' }, h('img', { src: '/assets/img/favicon.svg', alt: '' }), h('div', {}, siteName || location.host, h('small', {}, 'управление сайтом'))),
      NAV.map(([id, label, ico]) => h('a', { href: '#/' + id, 'data-nav': id, html: icon(ico) + `<span>${label}</span>` })),
      h('div', { class: 'side__sep' }),
      h('div', { class: 'side__foot' },
        h('a', { href: '/', target: '_blank', rel: 'noopener', html: icon('ext') + '<span>Открыть сайт</span>' }),
        h('a', { href: '#', html: icon('out') + '<span>Выйти</span>', onclick: async (e) => { e.preventDefault(); try { await api('POST', '/logout'); } catch {} showLogin(); } }))),
    mainEl));
}

const SCREENS = { pages: pagesScreen, shared: sharedScreen, blocks: blocksScreen, media: mediaScreen, theme: themeScreen, leads: leadsScreen, settings: settingsScreen };
let lastList = '#/pages';
async function route() {
  if (!mainEl) return;
  if (editor) { editor.teardown(); editor = null; }
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'edit' && parts.length >= 3) {
    const kind = parts[1], id = parts.slice(2).join('/');
    editor = await openEditor({ kind, id, onExit: () => { editor = null; go(lastList); }, onMoved: (nid) => { editor = null; go('#/edit/page/' + nid); } });
    return;
  }
  const name = SCREENS[parts[0]] ? parts[0] : 'pages';
  lastList = '#/' + name;
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('is-on', a.dataset.nav === name));
  mainEl.replaceChildren(h('p', { class: 'muted' }, 'Загрузка…'));
  try { await SCREENS[name](mainEl); } catch (e) { mainEl.replaceChildren(h('p', { class: 'hint' }, e.message)); }
}
const header = (title, lead, ...actions) => [h('div', { class: 'head' }, h('h1', {}, title), h('span', { class: 'spacer' }), actions), h('p', { class: 'lead' }, lead)];

// ── Страницы
async function newPageModal(pages, from = null) {
  const sections = pages.filter((p) => p.id !== '404' && p.url.split('/').filter(Boolean).length <= 1);
  const title = h('input', { class: 'inp', placeholder: 'Например: Интерьер квартиры на Садовой', value: from ? 'Копия: ' + (from.name || from.title) : '' });
  const parent = h('select', { class: 'inp' }, sections.map((p) => h('option', { value: p.url }, p.url === '/' ? `Без раздела (${location.host}/…)` : `${p.name || p.title} (${p.url}…)`)));
  const sl = h('input', { class: 'inp', placeholder: 'interer-kvartiry' });
  const base = h('select', { class: 'inp' }, h('option', { value: '' }, 'Пустая страница'), h('optgroup', { label: 'Скопировать существующую' }, pages.filter((p) => p.id !== '404').map((p) => h('option', { value: p.id }, `${p.name || p.title} — ${p.url}`))));
  const full = h('small', {});
  let touched = false;
  if (from) { base.value = from.id; const pu = '/' + from.url.split('/').filter(Boolean).slice(0, -1).join('/') + '/'; parent.value = sections.some((s) => s.url === pu) ? pu : '/'; }
  const upd = () => { if (!touched) sl.value = slug(title.value); full.textContent = 'Полный адрес: ' + location.host + parent.value + (sl.value || '…') + '/'; };
  title.addEventListener('input', upd); parent.addEventListener('change', upd);
  sl.addEventListener('input', () => { touched = true; sl.value = sl.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); upd(); });
  upd();
  const create = btn('Создать страницу', { class: 'btn--primary', onclick: async () => {
    if (!title.value.trim() || !sl.value) return toast('Заполните название и адрес', 'err');
    create.disabled = true;
    try {
      const r = await api('POST', '/doc', { kind: 'page', url: parent.value + sl.value + '/', title: title.value.trim(), from: base.value ? { kind: 'page', id: base.value } : null });
      box.close(); go('#/edit/page/' + r.id);
    } catch (e) { fail(e); create.disabled = false; }
  } });
  const box = modal({
    title: 'Новая страница',
    body: h('div', {},
      h('label', { class: 'fld' }, h('span', {}, 'Название страницы'), title),
      h('label', { class: 'fld' }, h('span', {}, 'Раздел сайта'), parent),
      h('label', { class: 'fld' }, h('span', {}, 'Адрес (латиницей)'), sl, full),
      h('label', { class: 'fld' }, h('span', {}, 'С чего начать'), base, h('small', {}, 'Проще всего скопировать похожую страницу и заменить в ней тексты и фото.'))),
    actions: [btn('Отмена', { onclick: () => box.close() }), create],
  });
}
async function pagesScreen(main) {
  const { pages } = await api('GET', '/pages');
  pages.sort((a, b) => (a.url === '/' ? -1 : b.url === '/' ? 1 : a.url.localeCompare(b.url)));
  const search = h('input', { class: 'inp', placeholder: 'Поиск по названию или адресу…', style: 'max-width:320px;margin-bottom:14px' });
  const list = h('div', { class: 'card list' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const rows = pages.filter((p) => !q || (p.title + p.url + p.name).toLowerCase().includes(q));
    list.replaceChildren(...rows.map((p) => {
      const depth = p.id === '404' ? 0 : Math.max(0, p.url.split('/').filter(Boolean).length - 1);
      return h('div', { class: 'list__row', onclick: () => go('#/edit/page/' + p.id) },
        h('div', { class: 'grow', style: `padding-left:${depth * 22}px` },
          h('div', { class: 'list__t' }, p.url === '/' ? 'Главная страница' : p.name || p.title || p.id, p.noindex ? h('span', { class: 'tag', style: 'margin-left:8px' }, 'скрыта от поиска') : null, !p.description && !p.noindex ? h('span', { class: 'tag tag--warn', style: 'margin-left:8px' }, 'нет описания') : null),
          h('div', { class: 'list__u' }, p.url)),
        h('div', { class: 'list__act' },
          iconBtn('gear', 'Настройки: заголовок, описание, адрес', () => editSettings(p)),
          iconBtn('copy', 'Создать копию', () => newPageModal(pages, p)),
          iconBtn('ext', 'Открыть на сайте', () => window.open(p.url, '_blank', 'noopener')),
          ['index', '404'].includes(p.id) ? null : iconBtn('trash', 'Удалить', async () => {
            if (!(await confirmBox(`Удалить страницу «${p.name || p.title}» (${p.url})? Ссылки на неё с других страниц перестанут работать.`, { ok: 'Удалить', danger: true }))) return;
            try { await api('DELETE', `/doc?kind=page&id=${encodeURIComponent(p.id)}`); toast('Страница удалена', 'ok'); route(); } catch (e) { fail(e); }
          }, 'btn--danger')),
        btn('Изменить', { class: 'btn--sm' }, 'edit'));
    }));
    if (!rows.length) list.append(h('div', { class: 'empty' }, 'Ничего не найдено'));
  };
  async function editSettings(p) {
    try {
      const d = await api('GET', `/doc?kind=page&id=${encodeURIComponent(p.id)}`);
      const res = await pageSettingsModal({ id: p.id, url: p.url, meta: d.meta });
      if (!res) return;
      await api('PUT', '/doc', { kind: 'page', id: p.id, meta: res.meta, body: d.body });
      if (res.url !== p.url) await api('POST', '/page/move', { id: p.id, url: res.url });
      toast('Сохранено', 'ok'); route();
    } catch (e) { fail(e); }
  }
  search.addEventListener('input', draw);
  draw();
  set(main, header('Страницы', 'Нажмите на страницу, чтобы изменить на ней тексты, фотографии и блоки. Изменения появляются на сайте сразу после кнопки «Сохранить».',
    btn('Новая страница', { class: 'btn--primary', onclick: () => newPageModal(pages) }, 'plus')), search, list);
}

// ── Общие блоки и шаблоны
function codeEditor({ kind, id, title }) {
  api('GET', `/doc?kind=${kind}&id=${id}`).then((d) => {
    const ta = h('textarea', { class: 'inp code', spellcheck: 'false', style: 'min-height:60vh', value: d.body });
    const box = modal({
      title, size: 'wide', body: ta,
      actions: [h('span', { class: 'muted small grow' }, 'Служебный код. Меняйте, только если точно знаете, что делаете — прошлые версии сохраняются.'), btn('Отмена', { onclick: () => box.close() }),
        btn('Сохранить', { class: 'btn--primary', onclick: async () => { try { await api('PUT', '/doc', { kind, id, meta: d.meta, body: ta.value }); box.close(); toast('Сохранено', 'ok'); } catch (e) { fail(e); } } })],
    });
  }).catch(fail);
}
async function sharedScreen(main) {
  const { docs } = await api('GET', '/docs?kind=partial');
  const core = ['header', 'footer', 'head'];
  docs.sort((a, b) => (core.indexOf(a.id) + 1 || 9) - (core.indexOf(b.id) + 1 || 9) || a.title.localeCompare(b.title));
  const tile = (d) => h('div', { class: 'card tile', onclick: () => (d.system ? codeEditor({ kind: 'partial', id: d.id, title: d.title }) : go('#/edit/partial/' + d.id)) },
    h('b', {}, d.title), h('span', { class: 'muted small' }, d.system ? 'служебный код' : 'меняется сразу на всех страницах'),
    h('div', { class: 'list__act' }, btn('Изменить', { class: 'btn--sm' }, 'edit'),
      core.includes(d.id) ? null : iconBtn('trash', 'Удалить', async () => {
        if (!(await confirmBox(`Удалить общий блок «${d.title}»?`, { ok: 'Удалить', danger: true }))) return;
        try { await api('DELETE', `/doc?kind=partial&id=${d.id}`); route(); } catch (e) { fail(e); }
      }, 'btn--danger')));
  set(main, header('Общие блоки', 'Части сайта, которые повторяются на многих страницах: шапка с меню, подвал, форма заявки. Измените блок один раз — он обновится везде, где стоит.',
    btn('Новый общий блок', { class: 'btn--primary', onclick: async () => {
      const title = await promptBox({ title: 'Новый общий блок', label: 'Название', placeholder: 'Например: Форма «Заказать звонок»', ok: 'Создать' });
      if (!title) return;
      try { const r = await api('POST', '/doc', { kind: 'partial', title, body: '<div class="card" style="padding: 24px;">\n  <h3 class="h3">Новый общий блок</h3>\n  <p>Нажмите на текст, чтобы изменить. Через кнопку «Блок» сюда можно добавить форму, кнопку или фото.</p>\n</div>' }); go('#/edit/partial/' + r.id); } catch (e) { fail(e); }
    } }, 'plus')),
  h('div', { class: 'tiles' }, docs.map(tile)));
}
async function blocksScreen(main) {
  const { docs } = await api('GET', '/docs?kind=block');
  docs.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
  const cats = [...new Set(docs.map((d) => d.category || 'Прочее'))];
  const edit = async (d) => {
    const title = h('input', { class: 'inp', value: d.title });
    const cat = h('input', { class: 'inp', value: d.category, list: 'aw-cats' });
    const box = modal({
      title: 'Название и раздел шаблона',
      body: h('div', {}, h('label', { class: 'fld' }, h('span', {}, 'Название'), title), h('label', { class: 'fld' }, h('span', {}, 'Раздел в окне «Добавить блок»'), cat, h('datalist', { id: 'aw-cats' }, cats.map((c) => h('option', { value: c }))))),
      actions: [btn('Отмена', { onclick: () => box.close() }), btn('Сохранить', { class: 'btn--primary', onclick: async () => {
        try { const full = await api('GET', `/doc?kind=block&id=${d.id}`); await api('PUT', '/doc', { kind: 'block', id: d.id, meta: { ...full.meta, title: title.value.trim() || d.title, category: cat.value.trim() || 'Прочее' }, body: full.body }); box.close(); route(); } catch (e) { fail(e); }
      } })],
    });
  };
  const tile = (d) => h('div', { class: 'card tile', onclick: () => go('#/edit/block/' + d.id) },
    h('b', {}, d.title),
    h('div', { class: 'list__act' }, btn('Изменить', { class: 'btn--sm' }, 'edit'),
      iconBtn('gear', 'Название и раздел', () => edit(d)),
      iconBtn('copy', 'Создать копию', async () => { try { const r = await api('POST', '/doc', { kind: 'block', title: d.title + ' (копия)', category: d.category, from: { kind: 'block', id: d.id } }); go('#/edit/block/' + r.id); } catch (e) { fail(e); } }),
      iconBtn('trash', 'Удалить', async () => {
        if (!(await confirmBox(`Удалить шаблон «${d.title}»? Страницы, где он уже вставлен, не изменятся.`, { ok: 'Удалить', danger: true }))) return;
        try { await api('DELETE', `/doc?kind=block&id=${d.id}`); route(); } catch (e) { fail(e); }
      }, 'btn--danger')));
  set(main, header('Шаблоны блоков', 'Готовые заготовки: секции, карточки, формы заявок, кнопки. В редакторе страницы они вставляются кнопкой «Блок». Шаблон можно изменить под себя или сохранить свой — из любого элемента страницы.',
    btn('Новый шаблон', { class: 'btn--primary', onclick: async () => {
      const title = await promptBox({ title: 'Новый шаблон', label: 'Название', ok: 'Создать' });
      if (!title) return;
      try { const r = await api('POST', '/doc', { kind: 'block', title, category: 'Мои шаблоны', body: '<section class="sec">\n  <div class="wrap">\n    <h2 class="h2">Заголовок</h2>\n    <p>Текст блока.</p>\n  </div>\n</section>' }); go('#/edit/block/' + r.id); } catch (e) { fail(e); }
    } }, 'plus')),
  cats.map((c) => [h('h3', { class: 'group-t' }, c), h('div', { class: 'tiles' }, docs.filter((d) => (d.category || 'Прочее') === c).map(tile))]));
}

// ── Изображения
async function mediaScreen(main) {
  set(main, header('Изображения', 'Все фотографии сайта. Загрузите новые — и выбирайте их в редакторе, когда меняете картинку на странице.'),
    mediaGrid({ manage: true, onPick: (m) => {
      const url = h('input', { class: 'inp', value: m.src, readonly: true, onfocus: (e) => e.target.select() });
      modal({ title: m.name, body: h('div', {}, h('img', { src: m.src, alt: '', style: 'display:block;max-width:100%;max-height:55vh;margin:0 auto 14px;border-radius:8px' }),
        h('label', { class: 'fld' }, h('span', {}, 'Адрес изображения'), url), m.builtin ? h('p', { class: 'muted small' }, 'Это изображение из первоначального набора сайта, удалить его нельзя.') : null) });
    } }));
}

// ── Оформление
const COLOR_LABELS = {
  '--accent': 'Фирменный цвет (кнопки, акценты)', '--accent-d': 'Фирменный цвет при наведении', '--accent-ink': 'Текст на фирменном цвете',
  '--bg': 'Фон сайта', '--paper': 'Фон чередующихся секций', '--card': 'Фон карточек', '--ink': 'Основной текст и заголовки', '--ink-2': 'Второстепенный текст',
  '--muted': 'Приглушённый текст', '--line': 'Линии и рамки', '--dark': 'Тёмный фон (подвал, плашки)',
};
async function themeScreen(main) {
  const info = await api('GET', '/theme');
  let theme = structuredClone(info.theme || {});
  theme.colors = theme.colors || {};
  const frame = h('iframe', { title: 'Предпросмотр', src: '/api/admin/render?kind=page&id=index' });
  let t;
  const preview = () => { clearTimeout(t); t = setTimeout(async () => { try { const { css } = await api('POST', '/theme/css', { theme }); const st = frame.contentDocument && frame.contentDocument.getElementById('aw-theme'); if (st) st.textContent = css; } catch {} }, 150); };
  frame.addEventListener('load', preview);
  const form = h('div', { class: 'card theme__form' });
  const draw = () => {
    const fontNames = [...info.fonts, ...(theme.fonts || []).map((f) => f.family)];
    const fontSel = (key, def) => { const s = h('select', { class: 'inp' }, h('option', { value: '' }, `Как сейчас (${def})`), fontNames.map((f) => h('option', { value: f }, f))); s.value = theme[key] || ''; s.addEventListener('change', () => { if (s.value) theme[key] = s.value; else delete theme[key]; preview(); }); return s; };
    const num = (key, ph, min, max) => { const i = h('input', { class: 'inp', type: 'number', min, max, value: theme[key] ?? '', placeholder: ph }); i.addEventListener('input', () => { if (i.value === '') delete theme[key]; else theme[key] = +i.value; preview(); }); return i; };
    const css = h('textarea', { class: 'inp code', rows: 6, spellcheck: 'false', value: theme.customCss || '', placeholder: '/* например */\n.btn { border-radius: 4px; }' });
    css.addEventListener('input', () => { if (css.value.trim()) theme.customCss = css.value; else delete theme.customCss; preview(); });
    const fontFile = h('input', { type: 'file', accept: '.woff2,.woff,.ttf,.otf', hidden: true });
    fontFile.addEventListener('change', async () => {
      const f = fontFile.files[0]; if (!f) return;
      const family = await promptBox({ title: 'Загрузка шрифта', label: 'Название шрифта (как показывать в списках)', value: f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '), ok: 'Загрузить' });
      if (!family) return;
      const fd = new FormData(); fd.append('font', f, f.name);
      try { const r = await api('POST', '/font?family=' + encodeURIComponent(family), fd); theme.fonts = r.theme.fonts; info.theme = r.theme; toast('Шрифт загружен — выберите его в списке', 'ok'); draw(); } catch (e) { fail(e); }
    });
    set(form,
      h('h3', {}, 'Цвета'),
      Object.keys(COLOR_LABELS).filter((v) => info.defaults[v]).map((v) => {
        const inp = h('input', { type: 'color', value: theme.colors[v] || info.defaults[v] });
        inp.addEventListener('input', () => { theme.colors[v] = inp.value; preview(); });
        return h('label', { class: 'crow' }, inp, h('span', {}, COLOR_LABELS[v]),
          h('button', { type: 'button', class: 'x', title: 'Вернуть исходный цвет', onclick: (e) => { e.preventDefault(); delete theme.colors[v]; inp.value = info.defaults[v]; preview(); } }, '✕'));
      }),
      h('h3', {}, 'Шрифты'),
      h('label', { class: 'fld' }, h('span', {}, 'Шрифт заголовков'), fontSel('fontHead', 'Manrope')),
      h('label', { class: 'fld' }, h('span', {}, 'Шрифт текста'), fontSel('fontBody', 'Manrope')),
      h('div', { class: 'row', style: 'margin-bottom:6px' }, btn('Загрузить свой шрифт', { class: 'btn--sm', onclick: () => fontFile.click() }, 'upload'), fontFile),
      h('p', { class: 'muted small' }, 'Подойдут файлы .woff2, .ttf, .otf. Убедитесь, что в шрифте есть русские буквы и лицензия разрешает использовать его на сайте.'),
      h('h3', {}, 'Форма и размер'),
      h('div', { class: 'g2' },
        h('label', { class: 'fld' }, h('span', {}, 'Скругление углов, px'), num('radius', parseInt(info.defaults['--radius']) || 18, 0, 60)),
        h('label', { class: 'fld' }, h('span', {}, 'Размер текста, %'), num('baseSize', 100, 80, 130))),
      h('details', { class: 'more', open: !!theme.customCss }, h('summary', {}, 'Свой CSS (для опытных)'), css));
  };
  draw();
  set(main, header('Оформление', 'Цвета и шрифты всего сайта. Справа — предпросмотр главной страницы. На сайте изменения появятся после кнопки «Сохранить».',
    btn('Сбросить всё', { onclick: async () => { if (!(await confirmBox('Вернуть исходные цвета и шрифты сайта? Загруженные шрифты останутся в списке.'))) return; theme = { colors: {}, ...(theme.fonts ? { fonts: theme.fonts } : {}) }; draw(); preview(); } }),
    btn('Сохранить', { class: 'btn--primary', onclick: async () => { try { await api('PUT', '/theme', { theme }); toast('Оформление сохранено и опубликовано', 'ok'); } catch (e) { fail(e); } } })),
  h('div', { class: 'theme' }, form, h('div', { class: 'card theme__prev' }, frame)));
}

// ── Заявки
async function leadsScreen(main) {
  const { leads } = await api('GET', '/leads');
  const details = (l) => [['Город', l.city], ['Файлы', l.files], ['', l.extra], ['', l.comment]]
    .filter(([, v]) => v).map(([k, v]) => h('div', {}, k ? h('span', { class: 'muted' }, k + ': ') : null, v));
  const csv = () => {
    const cols = ['date', 'formTitle', 'name', 'contact', 'phone', 'email', 'city', 'comment', 'extra', 'files', 'page'];
    const text = '﻿' + [cols.join(';'), ...leads.map((l) => cols.map((c) => '"' + String(l[c] ?? '').replace(/"/g, '""') + '"').join(';'))].join('\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv' })), download: 'zayavki.csv' });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const picked = new Set();
  const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'заявку' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'заявки' : 'заявок');
  const remove = async (ids) => {
    const n = ids.length;
    if (!(await confirmBox(n === 1 ? 'Удалить эту заявку?' : `Удалить ${n} ${plural(n)}?`, { ok: 'Удалить', danger: true, title: 'Удаление заявок' }))) return;
    try { const r = await api('POST', '/leads/delete', { ids }); toast(r.removed === 1 ? 'Заявка удалена' : `Удалено: ${r.removed}`, 'ok'); route(); } catch (e) { fail(e); }
  };
  const delSel = btn('Удалить выбранные', { class: 'btn--danger', hidden: true, onclick: () => remove([...picked]) }, 'trash');
  const all = h('input', { type: 'checkbox', title: 'Выбрать все', 'aria-label': 'Выбрать все' });
  const boxes = [];
  const sync = () => {
    delSel.hidden = !picked.size;
    delSel.querySelector('span').textContent = `Удалить выбранные (${picked.size})`;
    all.checked = picked.size > 0 && picked.size === boxes.length;
    all.indeterminate = picked.size > 0 && picked.size < boxes.length;
  };
  all.addEventListener('change', () => { boxes.forEach((b) => { b.checked = all.checked; b.checked ? picked.add(b.value) : picked.delete(b.value); }); sync(); });
  const row = (l) => {
    const cb = h('input', { type: 'checkbox', value: l.id, 'aria-label': 'Выбрать заявку' });
    cb.addEventListener('change', () => { cb.checked ? picked.add(l.id) : picked.delete(l.id); sync(); });
    if (l.id) boxes.push(cb);
    return h('tr', {},
      h('td', { class: 'tbl__chk' }, l.id ? h('label', {}, cb) : null),
      h('td', { style: 'white-space:nowrap' }, l.date), h('td', {}, l.formTitle), h('td', {}, h('b', {}, l.name)),
      h('td', {}, [l.contact, l.phone, l.email].filter(Boolean).map((v) => h('div', {}, v))),
      h('td', {}, details(l)), h('td', { class: 'muted' }, l.page),
      h('td', { class: 'tbl__act' }, l.id ? iconBtn('trash', 'Удалить заявку', () => remove([l.id]), 'btn--danger') : null));
  };
  set(main, header('Заявки', 'Все заявки с форм сайта. Если в «Настройках» указаны почта или MAX, заявки приходят и туда — здесь копия на случай, если уведомление потерялось. Удалённые заявки переносятся в отдельный файл на сервере.',
    delSel, leads.length ? btn('Скачать таблицу (Excel)', { onclick: csv }) : null),
  leads.length
    ? h('div', { class: 'card tbl-wrap' }, h('table', { class: 'tbl' },
      h('thead', {}, h('tr', {}, h('th', { class: 'tbl__chk' }, h('label', {}, all)), ['Когда', 'Форма', 'Имя', 'Связь', 'Подробности', 'Страница', ''].map((t) => h('th', {}, t)))),
      h('tbody', {}, leads.map(row))))
    : h('div', { class: 'card empty' }, 'Заявок пока нет. Как только кто-то отправит форму на сайте, она появится здесь.'));
}

// ── Настройки
async function settingsScreen(main) {
  const s = await api('GET', '/settings');
  const name = h('input', { class: 'inp', value: s.name, placeholder: 'Например: Анна Смирнова — дизайн интерьеров' });
  const mail = h('input', { class: 'inp', value: s.mailTo, placeholder: 'you@example.ru' });
  const token = h('input', { class: 'inp', type: 'password', autocomplete: 'off', placeholder: s.maxTokenSet ? 'Токен сохранён. Вставьте новый, чтобы заменить' : 'Токен бота из business.max.ru' });
  const user = h('input', { class: 'inp', value: s.maxUser, inputmode: 'numeric', placeholder: 'Например: 12345678' });
  const chat = h('input', { class: 'inp', value: s.maxChat, inputmode: 'numeric', placeholder: 'Необязательно' });
  const st = s.status || {};
  const state = (on, text) => h('span', { class: on ? 'tag tag--ok' : 'tag tag--warn' }, on ? 'работает' : text);
  const found = h('div', { class: 'small', style: 'margin-top:6px' });
  const save = async () => {
    try {
      await api('PUT', '/settings', { name: name.value, mailTo: mail.value, maxToken: token.value, maxUser: user.value, maxChat: chat.value });
      toast('Настройки сохранены', 'ok'); siteName = name.value.trim(); shell(); route();
    } catch (e) { fail(e); }
  };
  const detect = async () => {
    try {
      const { users } = await api('POST', '/settings/max-detect');
      if (!users.length) return set(found, h('span', { class: 'muted' }, 'Никого не нашли. Откройте своего бота в MAX, нажмите «Старт», затем снова нажмите эту кнопку.'));
      set(found, users.map((u) => h('div', { class: 'row', style: 'gap:8px;margin-top:4px' }, h('span', {}, `${u.name || 'Без имени'} — ${u.id}`), btn('Это я', { class: 'btn--sm', onclick: () => { user.value = u.id; toast('ID подставлен — нажмите «Сохранить»'); } }))));
    } catch (e) { fail(e); }
  };
  const test = async () => {
    try { const { result } = await api('POST', '/settings/test'); toast(`MAX: ${result.max}. Почта: ${result.mail}`, result.max === 'отправлено' || result.mail === 'отправлено' ? 'ok' : 'err'); } catch (e) { fail(e); }
  };
  const cur = h('input', { class: 'inp', type: 'password', autocomplete: 'current-password' });
  const nxt = h('input', { class: 'inp', type: 'password', autocomplete: 'new-password', placeholder: 'Не короче 8 символов' });
  const changePass = async () => {
    try { await api('POST', '/settings/password', { current: cur.value, next: nxt.value }); toast('Пароль изменён. Войдите с новым паролем', 'ok'); showLogin(); } catch (e) { fail(e); }
  };
  set(main, header('Настройки', 'Название сайта и куда присылать заявки с форм. Все заявки в любом случае сохраняются в разделе «Заявки».',
    btn('Сохранить', { class: 'btn--primary', onclick: save })),
  h('div', { class: 'card', style: 'padding:22px;max-width:720px' },
    h('h3', {}, 'Сайт'),
    h('label', { class: 'fld' }, h('span', {}, 'Название сайта'), name, h('small', {}, 'Показывается во вкладке браузера и в поисковиках, если у страницы нет своего заголовка. Адрес сайта: ' + (s.host || location.host))),
    h('h3', { style: 'margin-top:22px' }, 'Заявки на почту ', state(st.mail, st.smtp ? 'не указан адрес' : 'отправка писем не настроена на сервере')),
    h('label', { class: 'fld' }, h('span', {}, 'Почта для заявок'), mail, h('small', {}, 'Можно несколько адресов через запятую.')),
    h('h3', { style: 'margin-top:22px' }, 'Заявки в MAX ', state(st.max, 'не настроено')),
    h('ol', { class: 'small muted', style: 'margin:0 0 12px 18px;line-height:1.6' },
      h('li', {}, 'Создайте бота: business.max.ru → Чат-боты → Создать. Скопируйте токен (⋮ → Настройки).'),
      h('li', {}, 'Вставьте токен ниже и нажмите «Сохранить».'),
      h('li', {}, 'Откройте бота в MAX и нажмите «Старт», затем — «Найти мой ID».')),
    h('label', { class: 'fld' }, h('span', {}, 'Токен бота'), token),
    h('div', { class: 'g2' }, h('label', { class: 'fld' }, h('span', {}, 'Ваш ID в MAX'), user), h('label', { class: 'fld' }, h('span', {}, 'ID группового чата'), chat)),
    h('div', { class: 'row', style: 'gap:8px' }, btn('Найти мой ID', { class: 'btn--sm', onclick: detect }), s.maxTokenSet ? btn('Убрать токен', { class: 'btn--sm btn--ghost', onclick: async () => { try { await api('PUT', '/settings', { name: name.value, mailTo: mail.value, maxToken: null, maxUser: '', maxChat: '' }); route(); } catch (e) { fail(e); } } }) : null),
    found,
    h('div', { class: 'row', style: 'margin-top:18px' }, btn('Отправить тестовую заявку', { onclick: test }))),
  h('div', { class: 'card', style: 'padding:22px;max-width:720px;margin-top:18px' },
    h('h3', {}, 'Пароль от админ-панели'),
    h('div', { class: 'g2' }, h('label', { class: 'fld' }, h('span', {}, 'Текущий пароль'), cur), h('label', { class: 'fld' }, h('span', {}, 'Новый пароль'), nxt)),
    btn('Сменить пароль', { onclick: changePass })));
}

// ── Запуск
setUnauthorized(() => showLogin());
window.addEventListener('hashchange', route);
(async () => {
  try {
    const me = await api('GET', '/me');
    siteName = me.name || '';
    if (!me.ok) return showLogin(me.configured);
    shell(); route();
  } catch (e) { app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'login__card' }, h('p', { class: 'hint' }, h('b', {}, 'Админ-панель недоступна'), e.message)))); }
})();
