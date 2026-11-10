// Общие помощники админ-панели: DOM, запросы к серверу, окна, загрузка изображений.

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat(3).filter((x) => x != null && x !== false));
  return el;
}

// Заменить содержимое элемента (вложенные массивы раскрываются)
export const set = (el, ...kids) => el.replaceChildren(...kids.flat(3).filter((x) => x != null && x !== false));

const ICONS = {
  pages: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
  shared: '<rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="15" width="18" height="5" rx="1"/><path d="M12 9v6"/>',
  blocks: '<rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><path d="M17 14v6M14 17h6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5L5 20"/>',
  theme: '<circle cx="12" cy="12" r="9"/><circle cx="8" cy="10" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16" cy="10" r="1"/><path d="M12 21c-1.5 0-2-1-2-2s1-1.5 1-2.5-1-1.5-1-1.5"/>',
  leads: '<path d="M4 5h16v12H8l-4 4z"/><path d="M8 9h8M8 13h5"/>',
  out: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  undo: '<path d="M8 5 3 10l5 5"/><path d="M3 10h11a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m16 5 5 5-5 5"/><path d="M21 10H10a6 6 0 0 0 0 12h3"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  tablet: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M11 18h2"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  parent: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  upload: '<path d="M12 16V4M6 10l6-6 6 6M4 20h16"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
export const btn = (label, attrs = {}, ico) => h('button', { type: 'button', ...attrs, class: 'btn ' + (attrs.class || ''), html: (ico ? icon(ico) : '') + (label ? `<span>${esc(label)}</span>` : '') });
export const iconBtn = (ico, title, onclick, cls = '') => h('button', { type: 'button', class: 'btn btn--icon btn--sm btn--ghost ' + cls, title, 'aria-label': title, html: icon(ico), onclick: (e) => { e.stopPropagation(); onclick(e); } });

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'j', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const slug = (s) => String(s).toLowerCase().replace(/[а-яё]/g, (c) => TR[c] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// ── Сервер
let onUnauthorized = () => {};
export const setUnauthorized = (fn) => { onUnauthorized = fn; };
export async function api(method, path, body) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body instanceof FormData) opt.body = body;
  else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch('/api/admin' + path, opt); } catch { throw new Error('Нет связи с сервером'); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { onUnauthorized(); throw new Error('Нужно войти заново'); }
  if (!r.ok) throw new Error(j.error || 'Ошибка ' + r.status);
  return j;
}

// ── Сообщения и окна
export function toast(text, type = '') {
  const t = h('div', { class: 'toast ' + (type ? 'toast--' + type : '') }, text);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), type === 'err' ? 6000 : 2600);
}
export const fail = (e) => { console.error(e); toast(e.message || String(e), 'err'); };

export function modal({ title, body, actions = [], size = '', onClose }) {
  const close = () => { bg.remove(); document.removeEventListener('keydown', key, true); onClose && onClose(); };
  const key = (e) => { if (e.key === 'Escape' && document.querySelector('.modal-bg:last-of-type') === bg) { e.stopPropagation(); close(); } };
  const foot = actions.length ? h('div', { class: 'modal__f' }, actions) : null;
  const bg = h('div', { class: 'modal-bg', onmousedown: (e) => { if (e.target === bg) close(); } },
    h('div', { class: 'modal ' + (size ? 'modal--' + size : ''), role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal__h' }, h('h2', {}, title), h('button', { class: 'x', type: 'button', 'aria-label': 'Закрыть', onclick: close }, '✕')),
      h('div', { class: 'modal__b' }, body), foot));
  document.body.append(bg);
  document.addEventListener('keydown', key, true);
  const first = bg.querySelector('.modal__b input, .modal__b textarea, .modal__b select');
  first && setTimeout(() => first.focus(), 30);
  return { el: bg, close };
}
export function confirmBox(text, { ok = 'Да', danger = false, title = 'Подтвердите' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title, body: h('p', {}, text), onClose: () => { if (!done) resolve(false); },
      actions: [btn('Отмена', { onclick: () => m.close() }), btn(ok, { class: danger ? 'btn--danger' : 'btn--primary', onclick: () => { done = true; m.close(); resolve(true); } })],
    });
  });
}
export function promptBox({ title, label, value = '', ok = 'Готово', placeholder = '', list }) {
  return new Promise((resolve) => {
    let done = false;
    const inp = h('input', { class: 'inp', value, placeholder, list: list ? 'aw-prompt-list' : null });
    const finish = () => { done = true; m.close(); resolve(inp.value.trim()); };
    inp.addEventListener('keydown', (e) => e.key === 'Enter' && finish());
    const m = modal({
      title, onClose: () => { if (!done) resolve(null); },
      body: h('label', { class: 'fld' }, h('span', {}, label), inp, list ? h('datalist', { id: 'aw-prompt-list' }, list.map((v) => h('option', { value: v }))) : null),
      actions: [btn('Отмена', { onclick: () => m.close() }), btn(ok, { class: 'btn--primary', onclick: finish })],
    });
  });
}

// ── Изображения: уменьшаем в браузере до 400 / 640 / 1280 px (как остальные картинки сайта) и отправляем
const canvasBlob = (canvas, type, q) => new Promise((ok) => canvas.toBlob(ok, type, q));
export async function uploadImage(file) {
  const base = slug(file.name.replace(/\.[^.]+$/, '')) || 'foto';
  const fd = new FormData();
  if (/svg|gif/.test(file.type)) fd.append('raw', file, file.name);
  else {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { throw new Error(`«${file.name}»: формат не поддерживается. Сохраните фото как JPG или PNG`); }
    for (const w of [400, 640, 1280]) {
      const W = Math.min(w, bmp.width), H = Math.round((bmp.height * W) / bmp.width);
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bmp, 0, 0, W, H);
      let blob = await canvasBlob(c, 'image/webp', 0.82), ext = 'webp';
      if (!blob || blob.type !== 'image/webp') { blob = await canvasBlob(c, 'image/jpeg', 0.85); ext = 'jpg'; } // Safari не умеет сохранять WebP
      fd.append(String(w), blob, `${base}.${ext}`);
    }
  }
  return (await api('POST', '/media?name=' + encodeURIComponent(base), fd)).item;
}
export async function uploadMany(files) {
  const out = [];
  for (const f of files) {
    try { out.push(await uploadImage(f)); } catch (e) { fail(e); }
  }
  return out;
}
export const imageSize = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok([i.naturalWidth, i.naturalHeight]); i.onerror = () => ok([0, 0]); i.src = src; });

// Сетка изображений с загрузкой; onPick — выбор, onDelete — показывать удаление
export function mediaGrid({ onPick, manage = false }) {
  const grid = h('div', { class: 'media' });
  const search = h('input', { class: 'inp', placeholder: 'Поиск по названию…', style: 'max-width:260px' });
  const fileInp = h('input', { type: 'file', accept: 'image/*', multiple: true, hidden: true });
  const drop = h('div', { class: 'drop' }, 'Перетащите фотографии сюда или нажмите «Загрузить». Подойдут JPG, PNG, WebP — сайт сам уменьшит их до нужного размера.');
  let items = [];
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const list = items.filter((m) => !q || m.name.includes(q));
    grid.replaceChildren(...list.map((m) => h('button', { type: 'button', class: 'media__it', title: m.name, onclick: () => onPick && onPick(m) },
      h('img', { src: m.thumb, alt: '', loading: 'lazy' }), h('span', {}, m.name),
      manage && !m.builtin ? h('span', { class: 'media__del', role: 'button', title: 'Удалить', onclick: async (e) => {
        e.stopPropagation();
        if (!(await confirmBox(`Удалить изображение «${m.name}»?`, { ok: 'Удалить', danger: true }))) return;
        try { await api('DELETE', '/media?name=' + encodeURIComponent(m.name)); }
        catch (err) {
          if (!/используется/.test(err.message)) return fail(err);
          if (!(await confirmBox(err.message + '. Всё равно удалить? На этих страницах картинка пропадёт.', { ok: 'Удалить', danger: true }))) return;
          try { await api('DELETE', '/media?force=1&name=' + encodeURIComponent(m.name)); } catch (e2) { return fail(e2); }
        }
        load();
      } }, '✕') : null)));
    if (!list.length) grid.append(h('p', { class: 'muted' }, 'Ничего не найдено'));
  };
  const load = async () => { try { items = (await api('GET', '/media')).media; draw(); } catch (e) { fail(e); } };
  const add = async (files) => {
    files = [...files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    drop.textContent = `Загружаю: ${files.length}…`;
    const done = await uploadMany(files);
    drop.textContent = 'Перетащите фотографии сюда или нажмите «Загрузить».';
    await load();
    if (done.length) toast(done.length === 1 ? 'Изображение загружено' : `Загружено: ${done.length}`, 'ok');
    if (done.length === 1 && onPick && !manage) onPick(done[0]);
  };
  search.addEventListener('input', draw);
  fileInp.addEventListener('change', () => { add(fileInp.files); fileInp.value = ''; });
  const el = h('div', {},
    h('div', { class: 'row', style: 'margin-bottom:12px' }, btn('Загрузить', { class: 'btn--primary', onclick: () => fileInp.click() }, 'upload'), search, fileInp),
    drop, grid);
  el.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  el.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); add(e.dataTransfer.files); });
  load();
  return el;
}
export function pickImage() {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({ title: 'Выберите изображение', size: 'wide', onClose: () => { if (!done) resolve(null); }, body: mediaGrid({ onPick: (item) => { done = true; m.close(); resolve(item); } }) });
  });
}
