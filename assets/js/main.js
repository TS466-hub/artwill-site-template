/* Интерактив сайта-шаблона. Без зависимостей. */
(() => {
  const d = document, root = d.documentElement;
  root.classList.add('js');
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => [...c.querySelectorAll(s)];

  const LEAD_ENDPOINT = '/api/lead';
  const THANKS_URL = '/spasibo/';

  // Год в подвале
  $$('[data-year]').forEach((n) => (n.textContent = new Date().getFullYear()));

  // Текущая страница в меню
  $$('.nav a, .mnav a').forEach((a) => {
    const h = a.getAttribute('href');
    if (h && h !== '/' && location.pathname.startsWith(h)) a.setAttribute('aria-current', 'page');
  });

  // Шапка: линия после прокрутки
  const hdr = $('[data-hdr]');
  const onScroll = () => hdr && hdr.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Мобильное меню
  const burger = $('[data-burger]'), mnav = $('#mnav');
  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    mnav.hidden = !open;
    d.body.style.overflow = open ? 'hidden' : '';
  };
  if (burger && mnav) {
    burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
    mnav.addEventListener('click', (e) => e.target.closest('a') && setMenu(false));
    addEventListener('keydown', (e) => e.key === 'Escape' && !mnav.hidden && setMenu(false));
  }

  // Появление при прокрутке (со ступенчатой задержкой внутри ряда)
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      io.unobserve(en.target);
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    $$('.reveal').forEach((el) => {
      const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
      el.style.setProperty('--d', Math.min(sibs.indexOf(el), 5) * 0.08 + 's');
      io.observe(el);
    });
  } else $$('.reveal').forEach((el) => el.classList.add('is-in'));

  // Просмотр фото крупно: <figure data-zoom><img …></figure>
  d.addEventListener('click', (e) => {
    const f = e.target.closest('[data-zoom]');
    if (!f) return;
    const im = $('img', f);
    if (!im) return;
    const lb = d.createElement('div'), big = d.createElement('img');
    lb.className = 'lb';
    lb.setAttribute('role', 'dialog');
    big.src = im.currentSrc.replace(/-(400|640)\.(webp|jpg)$/, '-1280.$2');
    big.onerror = () => { big.onerror = null; big.src = im.currentSrc; };
    big.alt = im.alt;
    lb.append(big);
    const close = () => { lb.remove(); removeEventListener('keydown', esc); };
    const esc = (ev) => ev.key === 'Escape' && close();
    lb.addEventListener('click', close);
    addEventListener('keydown', esc);
    d.body.append(lb);
  });

  // Сообщение о cookie
  const cookie = $('[data-cookie]');
  try { if (cookie && !localStorage.getItem('cookie-ok')) cookie.hidden = false; } catch { cookie && (cookie.hidden = false); }
  const cookieOk = $('[data-cookie-ok]');
  cookieOk && cookieOk.addEventListener('click', () => {
    cookie.hidden = true;
    try { localStorage.setItem('cookie-ok', '1'); } catch {}
  });

  // Маска телефона (+7) — если вводят цифры; @ник для Telegram не трогаем
  const maskPhone = (v) => {
    let n = v.replace(/\D/g, '');
    if (!n) return '';
    if (n[0] === '8') n = '7' + n.slice(1);
    if (n[0] !== '7') n = '7' + n;
    n = n.slice(0, 11);
    const p = [n.slice(1, 4), n.slice(4, 7), n.slice(7, 9), n.slice(9, 11)];
    let out = '+7';
    if (p[0]) out += ' (' + p[0];
    if (p[0].length === 3) out += ')';
    if (p[1]) out += ' ' + p[1];
    if (p[2]) out += '-' + p[2];
    if (p[3]) out += '-' + p[3];
    return out;
  };
  $$('[data-contact], [data-phone]').forEach((inp) => inp.addEventListener('input', () => {
    const v = inp.value.trim();
    if (inp.hasAttribute('data-phone') || /^[+\d(]/.test(v)) inp.value = maskPhone(v);
  }));

  // Проверка и отправка форм: <form data-form="zayavka" data-title="…">
  const isPhone = (v) => /^\+7 \(\d{3}\) \d{3}-\d{2}-\d{2}$/.test(v);
  const isTg = (v) => /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(v) || /^(https?:\/\/)?t\.me\/[a-zA-Z0-9_]{5,}/.test(v);
  const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
  const mark = (el, msg) => {
    const box = el.closest('.fld, .chk');
    if (!box) return;
    box.classList.toggle('is-bad', !!msg);
    let m = $('.fld__msg', box);
    if (msg && !m && box.classList.contains('fld')) { m = d.createElement('span'); m.className = 'fld__msg'; box.append(m); }
    if (m) m.textContent = msg || '';
  };
  const validate = (form) => {
    let ok = true;
    $$('input, textarea, select', form).forEach((el) => {
      if (el.classList.contains('hp') || el.type === 'file' || el.type === 'radio' || el.type === 'hidden') return;
      const v = (el.value || '').trim();
      let msg = '';
      if (el.type === 'checkbox') { if (el.required && !el.checked) msg = 'Нужно согласие'; }
      else if (el.required && !v) msg = 'Заполните поле';
      else if (v && el.hasAttribute('data-contact') && !isPhone(v) && !isTg(v)) msg = 'Телефон в формате +7 (___) ___-__-__ или @ник в Telegram';
      else if (v && el.hasAttribute('data-phone') && !isPhone(v)) msg = 'Телефон в формате +7 (___) ___-__-__';
      else if (v && el.type === 'email' && !isEmail(v)) msg = 'Проверьте e-mail';
      mark(el, msg);
      if (msg) ok = false;
    });
    return ok;
  };
  $$('form[data-form]').forEach((form) => {
    let err = $('.form__err', form);
    if (!err) { err = d.createElement('p'); err.className = 'form__err'; err.setAttribute('role', 'alert'); form.append(err); }
    form.addEventListener('input', (e) => { if (e.target.closest('.is-bad')) mark(e.target, ''); });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.textContent = '';
      if (!validate(form)) { const bad = $('.is-bad input, .is-bad textarea', form); bad && bad.focus(); return; }
      const hp = $('.hp', form);
      if (hp && hp.value) return;
      form.classList.add('is-sending');
      const data = new FormData(form);
      data.append('form', form.dataset.form || 'zayavka');
      if (form.dataset.title) data.append('form_title', form.dataset.title);
      data.append('page', location.pathname);
      try {
        const res = await fetch(LEAD_ENDPOINT, { method: 'POST', body: data });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || 'Ошибка ' + res.status);
        location.href = THANKS_URL;
      } catch (ex) {
        form.classList.remove('is-sending');
        err.textContent = 'Не получилось отправить: ' + ex.message + '. Попробуйте ещё раз или свяжитесь со мной по контактам внизу страницы.';
      }
    });
  });
})();
