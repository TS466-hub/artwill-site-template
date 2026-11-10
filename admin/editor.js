// Визуальный редактор: страница открывается в окне как на сайте (без скриптов), правки делаются прямо на ней.
// Редактируется только область между метками <!--aw:start--> и <!--aw:end-->; общие блоки обёрнуты в [data-aw-include].
import { h, api, btn, icon, esc, toast, fail, modal, confirmBox, promptBox, pickImage, imageSize } from './ui.js';

const INLINE = new Set(['SPAN', 'B', 'I', 'EM', 'STRONG', 'SMALL', 'U', 'S', 'SUP', 'SUB', 'MARK', 'A', 'BR']);
const TEXTY = /^(P|H[1-6]|LI|SPAN|A|BUTTON|TD|TH|FIGCAPTION|SMALL|B|STRONG|EM|I|LABEL|SUMMARY|LEGEND|BLOCKQUOTE|DT|DD)$/;
const VOID = /^(INPUT|TEXTAREA|SELECT|IMG|VIDEO|IFRAME|HR|BR|CANVAS)$/;
const NAMES = {
  H1: 'Главный заголовок', H2: 'Заголовок', H3: 'Подзаголовок', H4: 'Подзаголовок', H5: 'Подзаголовок', H6: 'Подзаголовок', P: 'Текст', A: 'Ссылка', IMG: 'Изображение',
  SECTION: 'Секция', UL: 'Список', OL: 'Список', LI: 'Пункт списка', FORM: 'Форма', INPUT: 'Поле формы', TEXTAREA: 'Поле формы', SELECT: 'Поле формы', BUTTON: 'Кнопка',
  SPAN: 'Текст', B: 'Жирный текст', STRONG: 'Жирный текст', EM: 'Акцент', I: 'Курсив', SMALL: 'Мелкий текст', DIV: 'Блок', HEADER: 'Шапка', FOOTER: 'Подвал', NAV: 'Меню',
  FIGURE: 'Фото с подписью', FIGCAPTION: 'Подпись', SVG: 'Иконка', LABEL: 'Поле с подписью', TABLE: 'Таблица', TR: 'Строка таблицы', TD: 'Ячейка', TH: 'Ячейка',
  DETAILS: 'Вопрос и ответ', SUMMARY: 'Вопрос', HR: 'Линия', DIALOG: 'Всплывающее окно', FIELDSET: 'Группа полей', LEGEND: 'Подпись группы', BLOCKQUOTE: 'Цитата', ARTICLE: 'Карточка',
};
const typeName = (el) => (el.hasAttribute('data-aw-include') ? 'Общий блок' : el.tagName === 'A' && /\bbtn\b/.test(el.className) ? 'Кнопка' : NAMES[el.tagName.toUpperCase()] || 'Блок');
const DEVICES = { desktop: '100%', tablet: '820px', phone: '390px' };
const SWATCHES = ['--accent', '--ink', '--muted', '--bg', '--paper', '--card', '--dark'];
const toHex = (c) => {
  const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (!m || m[4] === '0') return '#ffffff';
  return '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('');
};
const fmtDate = (ts) => { const m = ts.match(/^(\d+)-(\d+)-(\d+)T(\d+)-(\d+)/); return m ? new Date(Date.UTC(m[1], m[2] - 1, m[3], m[4], m[5])).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ts; };

// ── Настройки страницы (используются и в списке страниц)
export function pageSettingsModal({ id, url, meta }) {
  return new Promise((resolve) => {
    let done = false;
    const fixed = id === 'index' || id === '404';
    const counter = (inp, max) => { const i = h('i', {}); const upd = () => { i.textContent = `${inp.value.length} / ${max}`; i.className = inp.value.length > max ? 'bad' : ''; }; inp.addEventListener('input', upd); upd(); return i; };
    const title = h('input', { class: 'inp', value: meta.title || '' });
    const desc = h('textarea', { class: 'inp', rows: 3, value: meta.description || '' });
    const name = h('input', { class: 'inp', value: meta.crumbs?.at(-1)?.name || '' });
    const addr = h('input', { class: 'inp', value: url, disabled: fixed });
    const og = h('input', { class: 'inp', value: meta.ogimage || '', placeholder: 'Стандартная картинка сайта' });
    const noindex = h('input', { type: 'checkbox', checked: !!meta.noindex });
    const crumbsOn = h('input', { type: 'checkbox', checked: !!(meta.crumbs && meta.crumbs.length) });
    const finish = () => {
      const m = { ...meta, title: title.value.trim(), description: desc.value.trim() };
      if (og.value.trim()) m.ogimage = og.value.trim(); else delete m.ogimage;
      if (noindex.checked) m.noindex = true; else delete m.noindex;
      if (crumbsOn.checked) {
        const prev = meta.crumbs && meta.crumbs.length ? meta.crumbs : [{ name: '', url }];
        m.crumbs = [...prev.slice(0, -1), { ...prev.at(-1), name: name.value.trim() || m.title }];
      } else delete m.crumbs;
      let u = addr.value.trim();
      if (!fixed) { if (!u.startsWith('/')) u = '/' + u; if (!u.endsWith('/')) u += '/'; }
      done = true; box.close(); resolve({ meta: m, url: u });
    };
    const box = modal({
      title: 'Настройки страницы', onClose: () => { if (!done) resolve(null); },
      body: h('div', {},
        h('label', { class: 'fld' }, h('span', {}, 'Заголовок для поисковиков и вкладки браузера', counter(title, 60)), title),
        h('label', { class: 'fld' }, h('span', {}, 'Описание для поисковиков', counter(desc, 160)), desc),
        h('label', { class: 'fld' }, h('span', {}, 'Адрес страницы'), addr, h('small', {}, fixed ? 'У этой страницы адрес не меняется.' : 'Латинские буквы, цифры и дефис. При смене адреса ссылки на сайте поправятся сами.')),
        h('label', { class: 'chk' }, crumbsOn, h('span', {}, 'Показывать «хлебные крошки» (Главная → …) вверху страницы')),
        h('label', { class: 'fld' }, h('span', {}, 'Короткое название (в хлебных крошках)'), name),
        h('label', { class: 'fld' }, h('span', {}, 'Картинка для соцсетей и мессенджеров'),
          h('div', { class: 'row' }, og, btn('Выбрать', { onclick: async () => { const it = await pickImage(); if (it) og.value = it.src; } }))),
        h('label', { class: 'chk' }, noindex, h('span', {}, 'Скрыть страницу от поисковиков'))),
      actions: [btn('Отмена', { onclick: () => box.close() }), btn('Готово', { class: 'btn--primary', onclick: finish })],
    });
  });
}

// ── Выбор блока для вставки
function blockPicker({ hasSel }) {
  return new Promise(async (resolve) => {
    let done = false, cur = null;
    let blocks = [], partials = [];
    try { [blocks, partials] = await Promise.all([api('GET', '/docs?kind=block').then((r) => r.docs), api('GET', '/docs?kind=partial').then((r) => r.docs)]); }
    catch (e) { fail(e); return resolve(null); }
    blocks.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    const cats = [...new Set(blocks.map((b) => b.category || 'Прочее'))];
    const shared = partials.filter((p) => !p.system && !['header', 'footer'].includes(p.id));
    const frame = h('iframe', { title: 'Предпросмотр', tabindex: '-1' });
    frame.addEventListener('load', () => { try { frame.contentDocument.documentElement.classList.add('aw-bare'); } catch {} });
    const where = h('select', { class: 'inp', style: 'width:auto' });
    const setWhere = (small) => {
      const opts = hasSel
        ? [['section-after', 'После текущей секции'], ['after', 'После выбранного элемента'], ['before', 'Перед выбранным элементом'], ['inside', 'Внутрь выбранного элемента'], ['end', 'В конец страницы'], ['start', 'В начало страницы']]
        : [['end', 'В конец страницы'], ['start', 'В начало страницы']];
      where.replaceChildren(...opts.map(([v, t]) => h('option', { value: v }, t)));
      where.value = hasSel ? (small ? 'after' : 'section-after') : 'end';
    };
    const insert = btn('Вставить', { class: 'btn--primary', disabled: true, onclick: async () => {
      try {
        const html = cur.kind === 'partial' ? `<!--@include ${cur.id}-->` : (await api('GET', `/doc?kind=block&id=${cur.id}`)).body;
        done = true; box.close(); resolve({ html, mode: where.value });
      } catch (e) { fail(e); }
    } });
    const items = [];
    const item = (kind, d, small) => {
      const b = h('button', { type: 'button', class: 'pick__it', onclick: () => {
        cur = { kind, id: d.id };
        items.forEach((x) => x.classList.toggle('is-on', x === b));
        frame.src = `/api/admin/render?kind=${kind}&id=${d.id}`;
        setWhere(small); insert.disabled = false;
      }, ondblclick: () => insert.click() }, d.title);
      items.push(b);
      return b;
    };
    setWhere(false);
    const box = modal({
      title: 'Добавить блок', size: 'full', onClose: () => { if (!done) resolve(null); },
      body: h('div', { class: 'pick' },
        h('div', { class: 'pick__list' },
          cats.map((c) => [h('h3', {}, c), blocks.filter((b) => (b.category || 'Прочее') === c).map((b) => item('block', b, /Элементы|Формы/.test(c)))]),
          shared.length ? [h('h3', {}, 'Общие блоки (одинаковые на всех страницах)'), shared.map((p) => item('partial', p, true))] : null),
        h('div', { class: 'pick__prev' },
          h('div', { class: 'pick__frame' }, frame),
          h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Куда вставить:'), where, h('span', { class: 'spacer' }), insert))),
    });
  });
}

export async function openEditor({ kind, id, onExit, onMoved }) {
  let doc0, pages = [], themeInfo = { theme: {}, defaults: {}, stacks: {} };
  try {
    [doc0, pages, themeInfo] = await Promise.all([
      api('GET', `/doc?kind=${kind}&id=${encodeURIComponent(id)}`),
      api('GET', '/pages').then((r) => r.pages),
      api('GET', '/theme'),
    ]);
  } catch (e) { fail(e); onExit(); return null; }
  const fonts = { ...themeInfo.stacks };
  for (const f of themeInfo.theme.fonts || []) fonts[f.family] = `'${f.family}', system-ui, sans-serif`;

  const S = { meta: doc0.meta, url: doc0.url, dirty: false, sel: null, host: null, undo: [], ui: 0, note: '', typing: false };
  let fd, fw, start, end, typeTimer;

  // ── Каркас
  const frame = h('iframe', { title: 'Страница' });
  const tb = h('div', { class: 'ed__tb', hidden: true });
  const canvas = h('div', { class: 'ed__canvas' }, frame, tb);
  const side = h('aside', { class: 'ed__side' });
  const saveBtn = btn('Сохранить', { class: 'btn--primary', onclick: () => save() });
  const undoBtn = btn('', { class: 'btn--icon btn--ghost', title: 'Отменить (Ctrl+Z)', onclick: () => undo() }, 'undo');
  const redoBtn = btn('', { class: 'btn--icon btn--ghost', title: 'Вернуть (Ctrl+Shift+Z)', onclick: () => redo() }, 'redo');
  const hiddenBtn = btn('', { class: 'btn--icon btn--ghost', title: 'Показать скрытые элементы (мобильное меню, всплывающие окна)', onclick: () => { hiddenBtn.classList.toggle('is-on'); fd.documentElement.classList.toggle('aw-show-hidden', hiddenBtn.classList.contains('is-on')); placeToolbar(); } }, 'eye');
  const devBtns = Object.keys(DEVICES).map((d) => btn('', { class: 'btn--icon' + (d === 'desktop' ? ' is-on' : ''), title: { desktop: 'Компьютер', tablet: 'Планшет', phone: 'Телефон' }[d], onclick: () => {
    devBtns.forEach((b, i) => b.classList.toggle('is-on', Object.keys(DEVICES)[i] === d));
    device = d; fit(); setTimeout(placeToolbar, 250);
  } }, d));
  // На узком экране страница в режиме «Компьютер» показывается уменьшенной, чтобы вид был как на большом мониторе
  let device = 'desktop', scale = 1;
  function fit() {
    const narrow = device !== 'desktop';
    canvas.classList.toggle('is-narrow', narrow);
    scale = narrow ? 1 : Math.min(1, canvas.clientWidth / 1360);
    Object.assign(frame.style, narrow
      ? { width: DEVICES[device], height: '', transform: '', position: '' }
      : { width: canvas.clientWidth / scale + 'px', height: canvas.clientHeight / scale + 'px', transform: scale < 1 ? `scale(${scale})` : '', position: 'absolute' });
    placeToolbar();
  }
  const fitWatch = new ResizeObserver(() => fit());
  const titleEl = h('div', { class: 'ed__title' });
  const drawTitle = () => titleEl.replaceChildren(h('b', {}, S.meta.title || id), h('span', {}, kind === 'page' ? S.url : kind === 'partial' ? 'Общий блок — меняется на всех страницах' : 'Шаблон блока'));
  drawTitle();
  const root = h('div', { class: 'ed' },
    h('div', { class: 'ed__bar' },
      btn('Назад', { class: 'btn--ghost', onclick: () => exit() }, 'back'), titleEl, h('span', { class: 'spacer' }),
      h('div', { class: 'ed__seg' }, devBtns), undoBtn, redoBtn, hiddenBtn,
      btn('', { class: 'btn--icon btn--ghost', title: 'Код страницы (HTML)', onclick: () => codeModal() }, 'code'),
      btn('', { class: 'btn--icon btn--ghost', title: 'История изменений', onclick: () => historyModal() }, 'history'),
      btn('', { class: 'btn--icon btn--ghost', title: 'Настройки', onclick: () => settings() }, 'gear'),
      kind === 'page' ? h('a', { class: 'btn btn--icon btn--ghost', href: S.url, target: '_blank', rel: 'noopener', title: 'Открыть на сайте', html: icon('ext') }) : null,
      btn('Блок', { onclick: () => addBlock() }, 'plus'), saveBtn),
    canvas, side);
  document.body.append(root);
  fitWatch.observe(canvas);

  const setDirty = (v) => { S.dirty = v; saveBtn.querySelector('span').textContent = v ? 'Сохранить •' : 'Сохранить'; };
  const beforeUnload = (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  const onKey = (e) => {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); save(); return; }
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (mod && k === 'z' && !inField) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  };
  document.addEventListener('keydown', onKey);

  const teardown = () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('keydown', onKey); fitWatch.disconnect(); root.remove(); };
  async function exit() {
    if (S.dirty && !(await confirmBox('Есть несохранённые изменения. Выйти без сохранения?', { ok: 'Выйти', danger: true }))) return;
    teardown();
    onExit();
  }

  // ── Окно со страницей
  const load = () => { tb.hidden = true; frame.src = `/api/admin/render?kind=${kind}&id=${encodeURIComponent(id)}&t=${Date.now()}`; };
  frame.addEventListener('load', init);
  load();

  function init() {
    fd = frame.contentDocument; fw = frame.contentWindow;
    if (!fd || !fd.body) return;
    start = end = null;
    const w = fd.createTreeWalker(fd, NodeFilter.SHOW_COMMENT);
    while (w.nextNode()) { if (w.currentNode.nodeValue === 'aw:start') start = w.currentNode; else if (w.currentNode.nodeValue === 'aw:end') end = w.currentNode; }
    if (!start || !end) { side.replaceChildren(h('div', { class: 'ins' }, h('p', { class: 'hint' }, 'Не удалось открыть страницу для правки. Попробуйте режим «Код».'))); return; }
    if (hiddenBtn.classList.contains('is-on')) fd.documentElement.classList.add('aw-show-hidden');
    prep(fd);
    S.sel = S.host = null; S.undo = [snapshot()]; S.ui = 0; setDirty(false);
    fd.addEventListener('click', onClick, true);
    fd.addEventListener('mousedown', (e) => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) e.preventDefault(); }, true);
    fd.addEventListener('submit', (e) => e.preventDefault(), true);
    fd.addEventListener('mouseover', (e) => hover(e.target), true);
    fd.addEventListener('mouseleave', () => hover(null), true);
    fd.addEventListener('keydown', onFrameKey, true);
    fd.addEventListener('input', () => { if (S.host) typed(); }, true);
    fd.addEventListener('paste', (e) => { if (!S.host) return; e.preventDefault(); fd.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ')); }, true);
    fd.addEventListener('dragstart', (e) => e.preventDefault(), true);
    fw.addEventListener('scroll', placeToolbar, { passive: true });
    fw.addEventListener('resize', placeToolbar);
    drawInspector(); syncUndo();
  }

  // Подготовка разметки к правке: раскрываем <details>, чтобы ответы были видны
  function prep(scope) {
    scope.querySelectorAll('details:not([open])').forEach((d) => { if (scope !== fd || inRoot(d)) { d.setAttribute('open', ''); d.setAttribute('data-aw-closed', ''); } });
  }
  const inRoot = (n) => !!n && !!(start.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(end.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING) && !n.contains(end);
  const rootRange = () => { const r = fd.createRange(); r.setStartAfter(start); r.setEndBefore(end); return r; };

  function snapshot() {
    const t = fd.createElement('template');
    t.content.append(rootRange().cloneContents());
    t.content.querySelectorAll('[data-aw-sel],[data-aw-hover],[contenteditable]').forEach((n) => { n.removeAttribute('data-aw-sel'); n.removeAttribute('data-aw-hover'); n.removeAttribute('contenteditable'); });
    return t.innerHTML;
  }
  // Разметка редактора → исходник страницы
  function toSource(html) {
    const t = fd.createElement('template');
    t.innerHTML = html;
    const c = t.content;
    c.querySelectorAll('[data-aw-include]').forEach((n) => { if (n.parentNode) n.replaceWith(fd.createComment('@include ' + n.getAttribute('data-aw-include'))); });
    c.querySelectorAll('template[data-aw-noscript]').forEach((n) => n.replaceWith(fd.createComment('aw-noscript:' + n.innerHTML)));
    c.querySelectorAll('[data-aw-closed]').forEach((n) => { n.removeAttribute('open'); n.removeAttribute('data-aw-closed'); });
    // Варианты-«чипсы» в формах: значение = подпись
    c.querySelectorAll('.chips label').forEach((l) => { const i = l.querySelector('input[type=radio], input[type=checkbox]'), s = l.querySelector('span'); if (i && s && s.textContent.trim()) i.setAttribute('value', s.textContent.trim()); });
    c.querySelectorAll('[data-aw-sel],[data-aw-hover],[contenteditable],[class=""],[style=""]').forEach((n) => { for (const a of ['data-aw-sel', 'data-aw-hover', 'contenteditable']) n.removeAttribute(a); for (const a of ['class', 'style']) if (n.getAttribute(a) === '') n.removeAttribute(a); });
    return t.innerHTML.replace(/<!--aw-noscript:([\s\S]*?)-->/g, '<noscript>$1</noscript>').trim();
  }
  function restore(html) {
    const r = rootRange();
    r.deleteContents();
    r.insertNode(r.createContextualFragment(html));
    S.sel = S.host = null;
    drawInspector(); placeToolbar();
  }
  const fragment = (html, ctx) => { const r = fd.createRange(); r.selectNodeContents(ctx && ctx.nodeType === 1 ? ctx : start.parentNode); const f = r.createContextualFragment(html); prep(f); return f; };

  // ── Отмена / возврат
  function commit() {
    clearTimeout(typeTimer); S.typing = false;
    const snap = snapshot();
    if (snap === S.undo[S.ui]) return;
    S.undo.length = S.ui + 1;
    S.undo.push(snap);
    if (S.undo.length > 60) S.undo.shift();
    S.ui = S.undo.length - 1;
    setDirty(true); syncUndo();
  }
  const typed = () => { S.typing = true; setDirty(true); clearTimeout(typeTimer); typeTimer = setTimeout(commit, 700); placeToolbar(); };
  const syncUndo = () => { undoBtn.disabled = S.ui <= 0; redoBtn.disabled = S.ui >= S.undo.length - 1; };
  function undo() { stopEdit(); if (S.ui <= 0) return; S.ui--; restore(S.undo[S.ui]); setDirty(true); syncUndo(); }
  function redo() { stopEdit(); if (S.ui >= S.undo.length - 1) return; S.ui++; restore(S.undo[S.ui]); setDirty(true); syncUndo(); }
  // Структурная правка: выполнить, запомнить, перерисовать панель
  const change = (fn) => { stopEdit(); fn(); commit(); if (S.sel && !S.sel.isConnected) S.sel = null; drawInspector(); placeToolbar(); };

  // ── Выбор элемента
  function pick(t) {
    if (!t || t.nodeType !== 1) return null;
    let inc = t.closest('[data-aw-include]');
    if (inc) { for (let up; (up = inc.parentElement && inc.parentElement.closest('[data-aw-include]')); ) inc = up; return inc; }
    if (!inRoot(t)) return null;
    const svg = t.closest('svg');
    return svg || t;
  }
  function textHost(t) {
    if (!t || t.closest('svg') || VOID.test(t.tagName)) return null;
    const chain = [t];
    for (let e = t; INLINE.has(e.tagName) && e.parentElement && inRoot(e.parentElement) && !e.parentElement.hasAttribute('data-aw-include'); ) { e = e.parentElement; chain.push(e); }
    const hasText = (x) => [...x.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
    for (let i = chain.length - 1; i >= 0; i--) if (hasText(chain[i])) return chain[i];
    return TEXTY.test(t.tagName) && ![...t.children].some((c) => c.tagName !== 'BR') ? t : null;
  }
  function hover(t) {
    fd.querySelectorAll('[data-aw-hover]').forEach((n) => n.removeAttribute('data-aw-hover'));
    if (S.host && t && S.host.contains(t)) return;
    const el = t && pick(t.nodeType === 1 ? t : t.parentElement);
    if (el && el !== S.sel) el.setAttribute('data-aw-hover', '');
  }
  function select(el, host = null, ev = null) {
    if (S.host && S.host !== host) stopEdit();
    if (S.sel) S.sel.removeAttribute('data-aw-sel');
    S.sel = el; S.note = '';
    if (el) { el.removeAttribute('data-aw-hover'); el.setAttribute('data-aw-sel', ''); }
    if (host && S.host !== host) startEdit(host, ev);
    drawInspector(); placeToolbar();
  }
  function onClick(e) {
    e.preventDefault();
    const t = e.target.nodeType === 1 ? e.target : e.target.parentElement;
    if (S.host && S.host.contains(t)) { if (S.sel !== t) select(t.closest('svg') || t, S.host); return; }
    const el = pick(t);
    if (!el) { select(null); S.note = t.closest('.crumbs') ? 'crumbs' : 'outside'; drawInspector(); return; }
    select(el, el.hasAttribute('data-aw-include') ? null : textHost(t), e);
  }
  function startEdit(host, ev) {
    S.host = host;
    host.setAttribute('contenteditable', 'true');
    host.focus({ preventScroll: true });
    let r = null;
    if (ev && fd.caretRangeFromPoint) r = fd.caretRangeFromPoint(ev.clientX, ev.clientY);
    else if (ev && fd.caretPositionFromPoint) { const p = fd.caretPositionFromPoint(ev.clientX, ev.clientY); if (p) { r = fd.createRange(); r.setStart(p.offsetNode, p.offset); } }
    if (!r || !host.contains(r.startContainer)) { r = fd.createRange(); r.selectNodeContents(host); r.collapse(false); }
    r.collapse(true);
    const s = fw.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function stopEdit() {
    if (!S.host) return;
    S.host.removeAttribute('contenteditable');
    S.host = null;
    try { fw.getSelection().removeAllRanges(); } catch {}
    if (S.typing) commit();
  }
  function onFrameKey(e) {
    const mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 's') { e.preventDefault(); save(); return; }
    if (mod && k === 'z' && !S.host) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (e.key === 'Escape') {
      if (S.host) { stopEdit(); drawInspector(); }
      else if (S.sel && inRoot(S.sel.parentElement)) select(S.sel.parentElement);
      else select(null);
      return;
    }
    if (e.key === 'Enter' && S.host) {
      e.preventDefault();
      if (S.host.tagName === 'LI' && !e.shiftKey) {
        const li = S.host.cloneNode(false);
        li.removeAttribute('data-aw-sel'); li.removeAttribute('contenteditable'); li.removeAttribute('id');
        S.host.after(li); li.append(fd.createElement('br'));
        select(li, li);
        commit();
      } else { fd.execCommand('insertLineBreak'); typed(); }
    }
  }

  // ── Плавающая панель у выбранного элемента
  const tbBtn = (ico, title, fn) => h('button', { type: 'button', title, 'aria-label': title, html: icon(ico), onmousedown: (e) => e.preventDefault(), onclick: fn });
  function placeToolbar() {
    const el = S.sel;
    if (!start) { tb.hidden = true; return; }
    if (!el || !el.isConnected || !inRoot(el)) { tb.hidden = true; return; }
    const box = (el.hasAttribute('data-aw-include') ? el.firstElementChild : el) || el;
    const r = box.getBoundingClientRect();
    const fh = frame.clientHeight;
    if (r.bottom < 0 || r.top > fh || (!r.width && !r.height)) { tb.hidden = true; return; }
    tb.hidden = false;
    const top = r.top * scale - 38 < 2 ? Math.min(Math.max(r.top * scale + 4, 4), fh * scale - 40) : r.top * scale - 38;
    const left = Math.min(Math.max(r.left * scale, 4), frame.clientWidth * scale - tb.offsetWidth - 20);
    tb.style.top = frame.offsetTop + top + 'px';
    tb.style.left = frame.offsetLeft + left + 'px';
  }
  tb.append(
    tbBtn('parent', 'Выбрать внешний блок', () => { const p = S.sel && S.sel.parentElement; if (p && inRoot(p)) select(p); }),
    h('i'),
    tbBtn('up', 'Поднять выше', () => move(-1)), tbBtn('down', 'Опустить ниже', () => move(1)),
    tbBtn('copy', 'Дублировать', () => duplicate()), tbBtn('plus', 'Добавить блок рядом', () => addBlock()),
    h('i'), tbBtn('trash', 'Удалить', () => removeSel()));

  // ── Действия с элементом
  function move(dir) {
    const el = S.sel; if (!el) return;
    const sib = dir < 0 ? el.previousElementSibling : el.nextElementSibling;
    if (!sib || !inRoot(sib)) return toast(dir < 0 ? 'Выше уже некуда' : 'Ниже уже некуда');
    change(() => (dir < 0 ? sib.before(el) : sib.after(el)));
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function duplicate() {
    const el = S.sel; if (!el) return;
    change(() => {
      const c = el.cloneNode(true);
      c.removeAttribute('data-aw-sel'); c.removeAttribute('id');
      c.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
      el.after(c);
      el.removeAttribute('data-aw-sel'); S.sel = c; c.setAttribute('data-aw-sel', '');
    });
  }
  function removeSel() {
    const el = S.sel; if (!el) return;
    change(() => { const p = el.parentElement; el.remove(); S.sel = p && inRoot(p) ? p : null; if (S.sel) S.sel.setAttribute('data-aw-sel', ''); });
  }
  async function addBlock() {
    stopEdit();
    const sel = S.sel && inRoot(S.sel) ? S.sel : null;
    const res = await blockPicker({ hasSel: !!sel });
    if (!res) return;
    try {
      const { html } = await api('POST', '/expand', { html: res.html });
      let top = sel;
      while (top && inRoot(top.parentElement)) top = top.parentElement;
      const f = fragment(html, res.mode === 'inside' ? sel : sel && res.mode !== 'section-after' ? sel.parentElement : null);
      const first = f.firstElementChild;
      if (res.mode !== 'inside') f.prepend(fd.createTextNode('\n'));
      change(() => {
        if (res.mode === 'section-after' && top) top.after(f);
        else if (res.mode === 'after' && sel) sel.after(f);
        else if (res.mode === 'before' && sel) sel.before(f);
        else if (res.mode === 'inside' && sel) sel.append(f);
        else if (res.mode === 'start') start.after(f);
        else end.before(f);
      });
      if (first) { select(pick(first) || first); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    } catch (e) { fail(e); }
  }
  function htmlModal(el) {
    const whole = !el;
    const clean = (n) => { const c = n.cloneNode(true); c.removeAttribute('data-aw-sel'); return c.outerHTML; };
    const ta = h('textarea', { class: 'inp code', spellcheck: 'false', style: 'height:100%;min-height:55vh', value: toSource(whole ? snapshot() : clean(el)) });
    const box = modal({
      title: whole ? 'Код страницы (HTML)' : 'Код элемента (HTML)', size: 'wide', body: ta,
      actions: [
        h('span', { class: 'muted small grow' }, 'Для опытных пользователей. Общие блоки записаны как <!--@include имя-->.'),
        btn('Отмена', { onclick: () => box.close() }),
        btn('Применить', { class: 'btn--primary', onclick: async () => {
          try {
            const { html } = await api('POST', '/expand', { html: ta.value });
            if (whole) { stopEdit(); restore(html); prep(fd); commit(); }
            else change(() => { const f = fragment(html, el.parentElement); const first = f.firstElementChild; el.replaceWith(f); S.sel = first && first.isConnected ? first : null; if (S.sel) S.sel.setAttribute('data-aw-sel', ''); });
            box.close();
          } catch (e) { fail(e); }
        } }),
      ],
    });
  }
  const codeModal = () => { stopEdit(); htmlModal(null); };
  async function saveAsTemplate(el) {
    const title = await promptBox({ title: 'Сохранить как шаблон', label: 'Название шаблона', value: typeName(el), ok: 'Сохранить' });
    if (!title) return;
    const c = el.cloneNode(true); c.removeAttribute('data-aw-sel');
    try { await api('POST', '/doc', { kind: 'block', title, category: 'Мои шаблоны', body: toSource(c.outerHTML) }); toast('Шаблон сохранён — он появится в окне «Добавить блок»', 'ok'); }
    catch (e) { fail(e); }
  }

  // ── Сохранение, история, настройки
  async function save() {
    if (!start) return false;
    stopEdit();
    saveBtn.disabled = true;
    try {
      const r = await api('PUT', '/doc', { kind, id, meta: S.meta, body: toSource(snapshot()) });
      setDirty(false);
      toast(kind === 'block' ? 'Шаблон сохранён' : 'Сохранено и опубликовано на сайте', 'ok');
      for (const w of r.warnings || []) if (kind === 'page' && w.includes(` ${S.url} `)) toast('Подсказка: ' + w);
      return true;
    } catch (e) { fail(e); return false; }
    finally { saveBtn.disabled = false; drawInspector(); }
  }
  async function historyModal() {
    let versions;
    try { versions = (await api('GET', `/history?kind=${kind}&id=${encodeURIComponent(id)}`)).versions; } catch (e) { return fail(e); }
    const box = modal({
      title: 'История изменений',
      body: versions.length
        ? h('div', {}, h('p', { class: 'muted', style: 'margin-bottom:12px' }, 'Перед каждым сохранением прежняя версия остаётся здесь. Можно вернуть любую из последних 40.'),
          h('div', { class: 'card list' }, versions.map((v) => h('div', { class: 'list__row', style: 'cursor:default' }, h('span', { class: 'grow' }, fmtDate(v.ts)),
            btn('Вернуть эту версию', { class: 'btn--sm', onclick: async () => {
              if (!(await confirmBox('Вернуть версию от ' + fmtDate(v.ts) + '? Текущая версия тоже останется в истории.', { ok: 'Вернуть' }))) return;
              try { await api('POST', '/history/restore', { kind, id, ts: v.ts }); box.close(); const d = await api('GET', `/doc?kind=${kind}&id=${encodeURIComponent(id)}`); S.meta = d.meta; drawTitle(); load(); toast('Версия восстановлена', 'ok'); } catch (e) { fail(e); }
            } })))))
        : h('p', { class: 'muted' }, 'Пока нет прошлых версий — они появятся после первого сохранения.'),
    });
  }
  async function settings() {
    if (kind !== 'page') {
      const title = await promptBox({ title: 'Название', label: kind === 'block' ? 'Название шаблона' : 'Название общего блока', value: S.meta.title || id });
      if (title) { S.meta = { ...S.meta, title }; setDirty(true); drawTitle(); }
      return;
    }
    const res = await pageSettingsModal({ id, url: S.url, meta: S.meta });
    if (!res) return;
    S.meta = res.meta; setDirty(true); drawTitle();
    if (res.url !== S.url) {
      if (!(await save())) return;
      try {
        const r = await api('POST', '/page/move', { id, url: res.url });
        toast('Адрес изменён' + (r.changed ? `, ссылки обновлены: ${r.changed}` : ''), 'ok');
        teardown();
        onMoved(r.id);
      } catch (e) { fail(e); }
    }
  }

  // ── Правая панель
  const ins = (title, ...kids) => h('div', { class: 'ins' }, title ? h('h3', {}, title) : null, kids);
  const fld = (label, control) => h('label', { class: 'fld' }, h('span', {}, label), control);
  const cs = (el) => fw.getComputedStyle(el);
  const setStyle = (el, prop, val) => { if (val === '' || val == null) el.style.removeProperty(prop); else el.style.setProperty(prop, val); placeToolbar(); };

  function pxInput(el, prop, { step = 1, min, ph } = {}) {
    const cur = el.style.getPropertyValue(prop);
    const inp = h('input', { class: 'inp inp--sm', type: 'number', step, min, value: /px$/.test(cur) ? parseFloat(cur) : '', placeholder: ph ?? Math.round(parseFloat(cs(el).getPropertyValue(prop)) || 0) });
    inp.addEventListener('input', () => setStyle(el, prop, inp.value === '' ? '' : inp.value + 'px'));
    inp.addEventListener('change', commit);
    return inp;
  }
  function textInput(el, prop, ph) {
    const inp = h('input', { class: 'inp inp--sm', value: el.style.getPropertyValue(prop), placeholder: ph });
    inp.addEventListener('change', () => { setStyle(el, prop, inp.value.trim()); commit(); });
    return inp;
  }
  function selectInput(el, prop, opts) {
    const s = h('select', { class: 'inp inp--sm' }, opts.map(([v, t]) => h('option', { value: v }, t)));
    const cur = el.style.getPropertyValue(prop);
    s.value = opts.some(([v]) => v === cur) ? cur : '';
    s.addEventListener('change', () => { setStyle(el, prop, s.value); commit(); });
    return s;
  }
  function colorInput(el, prop) {
    const inp = h('input', { type: 'color', value: toHex(cs(el).getPropertyValue(prop)) });
    inp.addEventListener('input', () => setStyle(el, prop, inp.value));
    inp.addEventListener('change', commit);
    const vars = { ...themeInfo.defaults, ...(themeInfo.theme.colors || {}) };
    return h('div', { class: 'color' }, inp,
      h('div', { class: 'sw' }, SWATCHES.filter((v) => vars[v]).map((v) => h('button', { type: 'button', title: 'Цвет из оформления сайта', style: `background:${vars[v]}`, onclick: () => { setStyle(el, prop, `var(${v})`); inp.value = toHex(cs(el).getPropertyValue(prop)); commit(); } })),
        h('button', { type: 'button', title: 'Белый', style: 'background:#fff', onclick: () => { setStyle(el, prop, '#ffffff'); inp.value = '#ffffff'; commit(); } })),
      h('span', { class: 'spacer' }),
      h('button', { type: 'button', class: 'x', title: 'Сбросить', onclick: () => { setStyle(el, prop, ''); inp.value = toHex(cs(el).getPropertyValue(prop)); commit(); } }, '✕'));
  }
  const attrInput = (el, name, { ph = '', onChange } = {}) => {
    const inp = h('input', { class: 'inp inp--sm', value: el.getAttribute(name) || '', placeholder: ph });
    inp.addEventListener('change', () => { const v = inp.value.trim(); change(() => { if (v) el.setAttribute(name, v); else el.removeAttribute(name); onChange && onChange(v); }); });
    return inp;
  };
  // Кнопка форматирования выделенного текста: не забирает фокус у страницы
  const fmtBtn = (label, title, fn, style = '') => h('button', { type: 'button', class: 'btn btn--sm', title, style, onmousedown: (e) => e.preventDefault(), onclick: fn }, label);
  const exec = (name, val, css = false) => { if (!S.host) return; fd.execCommand('styleWithCSS', false, css); fd.execCommand(name, false, val); typed(); };
  const hasSelection = () => { const s = fw.getSelection(); if (!s.rangeCount || s.isCollapsed) { toast('Сначала выделите часть текста мышью'); return false; } return true; };

  function drawInspector() {
    const el = S.sel && S.sel.isConnected ? S.sel : null;
    const out = [];
    if (!el) {
      const what = kind === 'page' ? 'страницы' : kind === 'partial' ? 'общего блока' : 'шаблона';
      if (S.note === 'crumbs') out.push(ins('', h('p', { class: 'hint' }, h('b', {}, 'Хлебные крошки'), 'Эта строка строится сама. Название и показ настраиваются в настройках страницы.'), h('div', { style: 'margin-top:10px' }, btn('Настройки страницы', { onclick: () => settings() }, 'gear'))));
      else if (S.note === 'outside') out.push(ins('', h('p', { class: 'hint' }, 'Эта часть не относится к содержимому ' + what + ' и здесь не меняется.')));
      out.push(ins('',
        h('p', { class: 'ins__type' }, 'Как пользоваться'),
        h('p', { class: 'muted', style: 'margin:8px 0 12px' }, 'Нажмите на любой элемент ' + what + '. Текст меняется прямо на месте — просто печатайте. Картинки, цвета, шрифты и отступы настраиваются в этой панели.'),
        btn('Добавить блок', { class: 'btn--primary', onclick: () => addBlock() }, 'plus')));
      side.replaceChildren(...out);
      return;
    }

    // Общий блок
    if (el.hasAttribute('data-aw-include')) {
      const name = el.getAttribute('data-aw-include'), mine = inRoot(el);
      out.push(ins('', h('p', { class: 'ins__type' }, 'Общий блок'),
        h('p', { class: 'hint', style: 'margin:10px 0' }, h('b', {}, { header: 'Шапка сайта', footer: 'Подвал сайта' }[name] || `«${name}»`), 'Он одинаковый на всех страницах. Измените его один раз — обновится везде.'),
        h('div', { class: 'row row--wrap' },
          btn('Изменить общий блок', { class: 'btn--primary', onclick: async () => { if (S.dirty && !(await save())) return; teardown(); location.hash = `#/edit/partial/${name}`; } }, 'edit'),
          mine ? btn('Отвязать', { title: 'Превратить в обычную копию, которую можно менять только на этой странице', onclick: () => change(() => { const kids = [...el.children]; el.replaceWith(...el.childNodes); S.sel = kids[0] || null; if (S.sel) S.sel.setAttribute('data-aw-sel', ''); }) }) : null)));
      side.replaceChildren(...out);
      return;
    }

    // Заголовок панели: тип и путь
    const path = [];
    for (let e = el; e && inRoot(e); e = e.parentElement) path.unshift(e);
    const kids = [...el.children].filter((c) => !c.classList.contains('hp')).slice(0, 14);
    out.push(ins('',
      h('p', { class: 'ins__type' }, typeName(el)),
      h('div', { class: 'path' }, path.slice(-5).map((e) => h('button', { type: 'button', class: e === el ? 'is-cur' : '', onclick: () => select(e) }, typeName(e)))),
      kids.length && !S.host ? h('div', { class: 'path' }, h('span', { class: 'muted small', style: 'padding:2px 4px 2px 0' }, 'Внутри:'), kids.map((e) => h('button', { type: 'button', onclick: () => { select(pick(e) || e); e.scrollIntoView({ block: 'nearest' }); } }, typeName(e)))) : null));

    // Форматирование выделенного текста
    if (S.host) out.push(ins('Выделенный текст',
      h('div', { class: 'row row--wrap' },
        fmtBtn('Ж', 'Жирный', () => exec('bold'), 'font-weight:800'),
        fmtBtn('К', 'Курсив', () => exec('italic'), 'font-style:italic'),
        fmtBtn('Акцент', 'Выделить фирменным стилем', () => { if (!hasSelection()) return; const r = fw.getSelection().getRangeAt(0), em = fd.createElement('em'); em.append(r.extractContents()); r.insertNode(em); typed(); }),
        fmtBtn('Ссылка', 'Сделать выделенный текст ссылкой', async () => {
          if (!hasSelection()) return;
          const r = fw.getSelection().getRangeAt(0).cloneRange(), host = S.host;
          const url = await promptBox({ title: 'Ссылка', label: 'Адрес (страница сайта или https://…)', list: pages.map((p) => p.url), placeholder: '/kontakty/' });
          if (!url || S.host !== host) return;
          host.focus(); const s = fw.getSelection(); s.removeAllRanges(); s.addRange(r);
          exec('createLink', url);
          if (/^https?:/.test(url)) host.querySelectorAll(`a[href="${CSS.escape(url)}"]`).forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
        }),
        (() => { const c = h('input', { type: 'color', title: 'Цвет выделенного текста', value: '#2f5d50', style: 'width:34px;height:30px;padding:2px;border:1px solid var(--line);border-radius:7px;background:#fff' }); c.addEventListener('change', () => { if (hasSelection()) exec('foreColor', c.value, true); }); return c; })(),
        fmtBtn('Очистить', 'Убрать оформление с выделенного', () => { exec('removeFormat'); exec('unlink'); })),
      h('p', { class: 'muted small', style: 'margin-top:8px' }, 'Enter — новая строка. Esc — закончить правку текста.')));

    // Изображение
    if (el.tagName === 'IMG') {
      const alt = h('input', { class: 'inp inp--sm', value: el.getAttribute('alt') || '', placeholder: 'Что изображено на фото' });
      alt.addEventListener('change', () => change(() => el.setAttribute('alt', alt.value.trim())));
      out.push(ins('Изображение',
        h('img', { class: 'thumb', src: el.currentSrc || el.src, alt: '' }),
        h('div', { style: 'margin-bottom:10px' }, btn('Заменить изображение', { class: 'btn--primary', onclick: async () => {
          const it = await pickImage(); if (!it) return;
          const small = /-(400|640)\./.test(el.getAttribute('src') || '') && it.small;
          const src = small ? it.small : it.src, [w, hh] = await imageSize(src);
          change(() => {
            el.setAttribute('src', src); el.removeAttribute('srcset'); el.removeAttribute('sizes');
            const aw = +el.getAttribute('width');
            if (!(aw && aw <= 120) && w) { el.setAttribute('width', w); el.setAttribute('height', hh); }
          });
        } }, 'image')),
        fld('Описание (для поисковиков и незрячих)', alt),
        fld('Как вписать в рамку', selectInput(el, 'object-fit', [['', 'Как на сайте'], ['cover', 'Заполнить, обрезая края'], ['contain', 'Показать целиком']]))));
    }

    // Ссылка
    const a = el.closest('a');
    if (a && inRoot(a)) {
      const href = h('input', { class: 'inp inp--sm', value: a.getAttribute('href') || '', list: 'aw-pages', placeholder: '/kontakty/ или https://…' });
      const blank = h('input', { type: 'checkbox', checked: a.target === '_blank' });
      const apply = () => change(() => {
        a.setAttribute('href', href.value.trim() || '#');
        if (blank.checked) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener'); } else { a.removeAttribute('target'); a.removeAttribute('rel'); }
      });
      href.addEventListener('change', () => { if (/^https?:\/\//.test(href.value.trim())) blank.checked = true; apply(); });
      blank.addEventListener('change', apply);
      out.push(ins(typeName(a) === 'Кнопка' ? 'Куда ведёт кнопка' : 'Ссылка',
        fld('Адрес', href), h('datalist', { id: 'aw-pages' }, pages.map((p) => h('option', { value: p.url }, p.title)), h('option', { value: 'tel:+7' }, 'Телефон'), h('option', { value: 'mailto:' }, 'Почта')),
        h('label', { class: 'chk' }, blank, h('span', {}, 'Открывать в новой вкладке')),
        btn('Убрать ссылку', { class: 'btn--sm', onclick: () => change(() => { const first = a.firstElementChild; a.replaceWith(...a.childNodes); S.sel = first && first.isConnected ? first : null; if (S.sel) S.sel.setAttribute('data-aw-sel', ''); }) })));
    } else if (/^(IMG|SPAN|B|STRONG|EM|svg)$/.test(el.tagName)) {
      out.push(ins('Ссылка', btn('Сделать ссылкой', { class: 'btn--sm', onclick: async () => {
        const url = await promptBox({ title: 'Ссылка', label: 'Адрес (страница сайта или https://…)', list: pages.map((p) => p.url), placeholder: '/kontakty/' });
        if (!url) return;
        change(() => { const l = fd.createElement('a'); l.setAttribute('href', url); if (/^https?:/.test(url)) { l.target = '_blank'; l.rel = 'noopener'; } el.replaceWith(l); l.append(el); });
      } })));
    }

    // Форма и её поля
    const form = el.closest('form');
    if (form && inRoot(form)) {
      if (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/^(checkbox|radio|file|hidden)$/.test(el.type)) {
        const req = h('input', { type: 'checkbox', checked: el.hasAttribute('required') });
        req.addEventListener('change', () => change(() => (req.checked ? el.setAttribute('required', '') : el.removeAttribute('required'))));
        out.push(ins('Поле формы',
          fld('Подсказка внутри поля', attrInput(el, 'placeholder')),
          h('label', { class: 'chk' }, req, h('span', {}, 'Обязательное поле')),
          fld('Название поля в заявке', attrInput(el, 'name')),
          h('p', { class: 'muted small' }, 'Подпись над полем меняется прямо на странице. Чтобы убрать поле, выберите «Поле с подписью» в строке выше и нажмите «Удалить».')));
      }
      const ft = h('input', { class: 'inp inp--sm', value: form.dataset.title || '', placeholder: { zayavka: 'Заявка с сайта', quick: 'Быстрый вопрос' }[form.dataset.form] || 'Например: Заказ звонка' });
      ft.addEventListener('change', () => change(() => {
        const v = ft.value.trim();
        if (v) { form.dataset.title = v; if (!['zayavka', 'quick'].includes(form.dataset.form) || !form.dataset.form) form.dataset.form = 'custom'; } else delete form.dataset.title;
      }));
      const kindSel = h('select', { class: 'inp inp--sm' }, [['text', 'Текст (одна строка)'], ['area', 'Большой текст'], ['phone', 'Телефон'], ['email', 'E-mail']].map(([v, t]) => h('option', { value: v }, t)));
      const lab = h('input', { class: 'inp inp--sm', placeholder: 'Подпись, например: Удобное время' });
      const addField = () => {
        const label = lab.value.trim() || { text: 'Новое поле', area: 'Комментарий', phone: 'Телефон', email: 'E-mail' }[kindSel.value];
        const k = kindSel.value, safe = esc(label);
        const html = k === 'area' ? `<label class="fld"><span>${safe}</span><textarea name="${safe}" rows="3"></textarea></label>`
          : k === 'phone' ? `<label class="fld"><span>${safe}</span><input name="phone" type="tel" data-phone placeholder="+7 900 000-00-00" autocomplete="tel"></label>`
          : k === 'email' ? `<label class="fld"><span>${safe}</span><input name="email" type="email" placeholder="name@example.ru" autocomplete="email"></label>`
          : `<label class="fld"><span>${safe}</span><input name="${safe}"></label>`;
        const anchor = form.querySelector('.chk') || form.querySelector('[type=submit]');
        let added;
        change(() => { const f = fragment(html, form); added = f.firstElementChild; if (anchor && anchor.parentElement === form) anchor.before(f); else form.append(f); });
        select(added); added.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      out.push(ins('Форма заявки',
        fld('Название заявки (так она придёт на почту и в MAX)', ft),
        h('div', { class: 'lbl' }, 'Добавить поле'),
        h('div', { class: 'g2', style: 'margin-bottom:8px' }, kindSel, lab),
        h('div', { class: 'row' }, btn('Добавить поле', { class: 'btn--sm', onclick: addField }, 'plus'), el !== form ? btn('Выбрать всю форму', { class: 'btn--sm btn--ghost', onclick: () => select(form) }) : null),
        h('p', { class: 'muted small', style: 'margin-top:8px' }, 'Заявки с любой формы попадают в раздел «Заявки» (и на почту / в MAX, если они указаны в «Настройках»). Галочку согласия на обработку данных удалять нельзя — без неё заявка не отправится.')));
    }

    // Текст
    if (!VOID.test(el.tagName) && el.tagName !== 'svg') {
      const fontSel = h('select', { class: 'inp inp--sm' }, h('option', { value: '' }, 'Как на сайте'), Object.keys(fonts).map((f) => h('option', { value: f }, f)));
      const first = (v) => v.split(',')[0].replace(/['"]/g, '').trim();
      const curFont = first(el.style.fontFamily);
      fontSel.value = Object.keys(fonts).find((f) => first(fonts[f]) === curFont) || '';
      fontSel.addEventListener('change', () => { setStyle(el, 'font-family', fonts[fontSel.value] || ''); commit(); });
      const al = el.style.textAlign;
      out.push(ins('Текст',
        fld('Шрифт', fontSel),
        h('div', { class: 'g2' },
          fld('Размер, px', pxInput(el, 'font-size', { min: 6 })),
          fld('Насыщенность', selectInput(el, 'font-weight', [['', 'Как на сайте'], ['400', 'Обычный'], ['500', 'Средний'], ['600', 'Полужирный'], ['700', 'Жирный'], ['800', 'Очень жирный']]))),
        h('div', { class: 'lbl' }, 'Цвет текста'), h('div', { style: 'margin-bottom:10px' }, colorInput(el, 'color')),
        h('div', { class: 'lbl' }, 'Выравнивание'),
        h('div', { class: 'row', style: 'margin-bottom:10px' }, [['', 'Авто'], ['left', 'Слева'], ['center', 'По центру'], ['right', 'Справа']].map(([v, t]) => h('button', { type: 'button', class: 'btn btn--sm' + (al === v ? ' is-on' : ''), onclick: () => { setStyle(el, 'text-align', v); commit(); drawInspector(); } }, t))),
        h('div', { class: 'g2' },
          fld('Высота строки', (() => { const i = h('input', { class: 'inp inp--sm', type: 'number', step: '0.05', min: '0.8', value: /^[\d.]+$/.test(el.style.lineHeight) ? el.style.lineHeight : '', placeholder: 'авто' }); i.addEventListener('input', () => setStyle(el, 'line-height', i.value)); i.addEventListener('change', commit); return i; })()),
          fld('Регистр', selectInput(el, 'text-transform', [['', 'Как на сайте'], ['uppercase', 'ВСЕ ЗАГЛАВНЫЕ'], ['none', 'Как набрано']])))));
    }

    // Фон, рамка, отступы, размер
    const bgImg = el.style.backgroundImage;
    out.push(h('div', { class: 'ins' }, h('details', { class: 'more', open: !!(el.style.background || el.style.backgroundColor || bgImg || el.style.borderRadius || el.style.border) },
      h('summary', {}, 'Фон и рамка'),
      h('div', { class: 'lbl' }, 'Цвет фона'), h('div', { style: 'margin-bottom:10px' }, colorInput(el, 'background-color')),
      h('div', { class: 'row', style: 'margin-bottom:10px' },
        btn(bgImg ? 'Сменить фоновое фото' : 'Фоновое фото', { class: 'btn--sm', onclick: async () => { const it = await pickImage(); if (!it) return; change(() => { el.style.backgroundImage = `url(${it.src})`; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; }); } }, 'image'),
        bgImg ? btn('Убрать', { class: 'btn--sm btn--ghost', onclick: () => change(() => { for (const p of ['background-image', 'background-size', 'background-position']) el.style.removeProperty(p); }) }) : null),
      h('div', { class: 'g2' },
        fld('Скругление углов, px', pxInput(el, 'border-radius', { min: 0 })),
        fld('Рамка', selectInput(el, 'border', [['', 'Как на сайте'], ['1px solid var(--line)', 'Тонкая'], ['2px solid var(--ink)', 'Тёмная'], ['2px solid var(--accent)', 'Цветная'], ['0', 'Без рамки']]))))));

    const side4 = (base) => h('div', { class: 'g4' }, [['top', 'сверху'], ['right', 'справа'], ['bottom', 'снизу'], ['left', 'слева']].map(([s, t]) => h('label', {}, pxInput(el, `${base}-${s}`), t)));
    out.push(h('div', { class: 'ins' }, h('details', { class: 'more', open: !!(el.style.padding || el.style.margin || el.style.width || el.style.maxWidth || el.style.height || /padding|margin/.test(el.getAttribute('style') || '')) },
      h('summary', {}, 'Отступы и размер'),
      h('div', { class: 'lbl' }, 'Внутренние отступы, px'), h('div', { style: 'margin-bottom:10px' }, side4('padding')),
      h('div', { class: 'lbl' }, 'Внешние отступы, px'), h('div', { style: 'margin-bottom:10px' }, side4('margin')),
      h('div', { class: 'g2' }, fld('Ширина', textInput(el, 'width', 'авто, 50%, 320px')), fld('Макс. ширина', textInput(el, 'max-width', 'например 640px'))),
      fld('Высота', textInput(el, 'height', 'авто или 300px')))));

    // Дополнительно
    const hid = h('input', { type: 'checkbox', checked: el.hasAttribute('hidden') });
    hid.addEventListener('change', () => change(() => (hid.checked ? el.setAttribute('hidden', '') : el.removeAttribute('hidden'))));
    out.push(h('div', { class: 'ins' }, h('details', { class: 'more' },
      h('summary', {}, 'Дополнительно'),
      fld('Якорь (для ссылок вида #zayavka)', attrInput(el, 'id', { ph: 'латинскими буквами' })),
      fld('Классы оформления (CSS)', attrInput(el, 'class')),
      h('label', { class: 'chk' }, hid, h('span', {}, 'Скрыть элемент на сайте')),
      h('div', { class: 'row row--wrap' },
        btn('Код элемента', { class: 'btn--sm', onclick: () => { stopEdit(); htmlModal(el); } }, 'code'),
        btn('Сохранить как шаблон', { class: 'btn--sm', onclick: () => saveAsTemplate(el) }, 'blocks')))));

    const scroll = side.scrollTop;
    side.replaceChildren(...out);
    side.scrollTop = scroll;
  }

  return { teardown, isDirty: () => S.dirty };
}
