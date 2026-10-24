// Витрина «Тата» — каталог, корзина и форма заказа.
// Каталог вшит в index.html (блок CATALOG:BEGIN/END, генерирует
// tools/update_shop_catalog.py) и приходит вместе со страницей: отдельного
// файла, который может не долететь, больше нет. Каталог рисуется первым и
// в собственном try/catch — остальное странице не враг.

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('ru-RU') + ' ₽';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* Мост заявок — тот же веб-апп Apps Script, что синхронизирует базу приложения.
   Ключа приложения здесь нет и не должно быть: заявку подписывает сам Телеграм
   (initData), подпись проверяет скрипт на сервере. POST идёт как text/plain —
   без preflight, как и синхронизация приложения. */
const BRIDGE_URL = 'https://script.google.com/macros/s/AKfycbx-uXKZ7ePHDlL-wXuAFFlmroSByhrtojN8j1JqF8fMu079A208zSI8FUWVTJLuWI708w/exec';

/* ---------- Телеграм-мини-апп: без Телеграма страница — обычный сайт.
   Всё в try/catch: телеграмовский SDK вне приложения неполноценен
   (v6.0 не определяет viewport), уронить страницу он не имеет права ---------- */
const tg = window.Telegram && window.Telegram.WebApp;
try {
  if (tg) {
    tg.ready && tg.ready();
    tg.expand && tg.expand();
    tg.disableVerticalSwipes && tg.disableVerticalSwipes(); // свайп вниз листает шторки, а не закрывает приложение
    if (tg.BackButton) tg.BackButton.onClick(() => closeSheet());
    const onVv = () => {
      if (tg.viewport && isFinite(tg.viewport.height)) {
        document.documentElement.style.setProperty('--vvh', Math.round(tg.viewport.height) + 'px');
      }
    };
    tg.onEvent && tg.onEvent('viewportChanged', onVv);
    onVv();
  } else if (window.visualViewport) {
    const onVv = () => document.documentElement.style.setProperty('--vvh', Math.round(window.visualViewport.height) + 'px');
    window.visualViewport.addEventListener('resize', onVv);
    onVv();
  }
} catch (e) { /* вне Телеграма работаем как обычный сайт */ }
const tgBack = show => { if (tg && tg.BackButton) show ? tg.BackButton.show() : tg.BackButton.hide(); };

let cart = {};
try { cart = JSON.parse(localStorage.getItem('tata-shop-cart') || '{}'); } catch (e) { cart = {}; }
const CATALOG_OK = typeof CATALOG !== 'undefined' && Array.isArray(CATALOG) && CATALOG.length > 0;
const save = () => { try { localStorage.setItem('tata-shop-cart', JSON.stringify(cart)); } catch (e) {} };
/* чистка корзины на входе: остаются только целые количества 1…∞ по живым
   товарам — строка «2», мусор или снятый с продажи товар выкидываются,
   вычищенное сразу сохраняется */
if (CATALOG_OK) {
  let dirty = false;
  for (const id of Object.keys(cart)) {
    const q = Math.round(+cart[id]);
    if (!CATALOG.some(p => p.id === +id) || !isFinite(q) || q <= 0) { delete cart[id]; dirty = true; }
    else if (cart[id] !== q) { cart[id] = q; dirty = true; }
  }
  if (dirty) save();
}
let filter = 'all';

const byId = id => CATALOG.find(p => p.id === id);
const cartCount = () => Object.values(cart).reduce((s, q) => s + q, 0);
const cartSum = () => Object.entries(cart).reduce((s, [id, q]) => s + byId(+id).price * q, 0);
/* единственная дверь в корзину для всех трёх степперов (карточка, корзина,
   товар): NaN в количестве записать нельзя — «−» по отсутствующему ключу
   просто ничего не меняет, ноль и меньше удаляет позицию */
function changeQty(id, delta) {
  const q = (+cart[id] || 0) + delta;
  if (q <= 0) delete cart[id];
  else cart[id] = q;
}
/* позиция без цены (пока только «Картошка Люкс») — заглушка вместо нуля */
const priceHtml = p => p.price ? fmt(p.price) : '<span class="fill">[уточнить цену]</span>';

/* ---------- каталог ---------- */

function renderChips() {
  const chips = [{ key: 'all', label: 'Все' }]
    .concat(Object.entries(GROUPS).map(([key, label]) => ({ key, label })));
  $('chips').innerHTML = chips.map(c =>
    `<button class="chip${c.key === filter ? ' on' : ''}" data-k="${c.key}" type="button">${c.label}</button>`
  ).join('');
  for (const b of $('chips').querySelectorAll('.chip')) {
    b.addEventListener('click', () => { filter = b.dataset.k; renderChips(); renderGrid(); });
  }
}

function cardHtml(p) {
  const qty = cart[p.id] || 0;
  const actions = qty
    ? `<div class="stepper">
         <button class="minus" data-a="dec" data-id="${p.id}" type="button" aria-label="Меньше">
           <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>
         </button>
         <span class="qty">${qty}</span>
         <button class="plus" data-a="inc" data-id="${p.id}" type="button" aria-label="Больше">
           <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
         </button>
       </div>`
    : `<button class="add-btn" data-a="inc" data-id="${p.id}" type="button">В корзину</button>`;
  return `
  <article class="pcard" data-id="${p.id}">
    <div class="pcard-ph">
      <img src="${p.ph2}" srcset="${p.ph} 262w, ${p.ph2} 524w" sizes="(max-width: 520px) 46vw, 240px"
           loading="lazy" decoding="async" alt="${p.full}"
           onerror="this.remove(); this.closest('.pcard-ph').insertAdjacentHTML('beforeend','<div class=\\'noimg\\'>${p.name.slice(0, 1)}</div>')">
    </div>
    <div class="pcard-body">
      <div class="pcard-label">${p.lbl || ''}</div>
      <div class="pcard-name">${p.name}</div>
      <div class="pcard-price">${priceHtml(p)}</div>
      <div class="pcard-actions">${actions}</div>
    </div>
  </article>`;
}

function renderGrid() {
  const list = filter === 'all' ? CATALOG : CATALOG.filter(p => p.g === filter);
  $('grid').innerHTML = list.map(cardHtml).join('');
}

/* фото — хотлинк на CDN Флаувау: если картинка недоступна, карточка остаётся читаемой */

function onGridClick(e) {
  const b = e.target.closest('[data-a]');
  if (b) {
    changeQty(+b.dataset.id, b.dataset.a === 'inc' ? 1 : -1);
    save();
    renderGrid();
    updateBars();
    if ($('sheet').classList.contains('open')) renderCartItems();
    return;
  }
  /* тап мимо кнопок — провал в товар */
  const card = e.target.closest('.pcard');
  if (card) openProduct(+card.dataset.id);
}

/* ---------- индикаторы корзины ---------- */

function updateBars() {
  const n = cartCount(), sum = cartSum();
  $('cartBtn').hidden = n === 0;
  $('cartBar').hidden = n === 0;
  $('cartBtnCount').textContent = n;
  $('cartBarCount').textContent = n;
  $('cartBarSum').textContent = fmt(sum);
}

/* ---------- шторка корзины ---------- */

function itemRow(p, qty) {
  return `
  <div class="citem">
    <img class="citem-ph" src="${p.ph}" alt="" loading="lazy">
    <div class="citem-mid">
      <div class="citem-name">${p.name}</div>
      <div class="citem-sub">${p.price ? fmt(p.price) + ' × ' + qty : 'цена уточняется × ' + qty}</div>
    </div>
    <div class="stepper">
      <button class="minus" data-a="dec" data-id="${p.id}" type="button" aria-label="Меньше">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>
      </button>
      <span class="qty">${qty}</span>
      <button class="plus" data-a="inc" data-id="${p.id}" type="button" aria-label="Больше">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
  </div>`;
}

const FORM_HTML = `
  <form id="orderForm" novalidate>
    <div id="cartItems"></div>
    <div class="ctotal"><span>Итого</span><span class="sum" id="totalSum"></span></div>
    <div class="f-row" id="rowName">
      <label for="fName">Ваше имя</label>
      <input id="fName" name="name" type="text" autocomplete="name" placeholder="Как к вам обращаться">
    </div>
    <div class="f-row" id="rowPhone">
      <label for="fPhone">Телефон</label>
      <input id="fPhone" name="phone" type="tel" autocomplete="tel" placeholder="+7 ··· ··· ·· ··">
    </div>
    <div class="f-row">
      <label for="fWhen">Когда доставить</label>
      <input id="fWhen" name="when" type="text" placeholder="Например: суббота, к 15:00">
    </div>
    <div class="f-row">
      <label for="fAddr">Адрес доставки или самовывоз</label>
      <input id="fAddr" name="addr" type="text" placeholder="Улица, дом, квартира — или «самовывоз»">
    </div>
    <div class="f-row">
      <label for="fNote">Комментарий</label>
      <textarea id="fNote" name="note" rows="2" placeholder="Надпись на наборе, аллергии, вопросы"></textarea>
    </div>
    <button class="submit-btn" type="submit">Отправить заказ</button>
    <p class="form-note">Мы напишем или позвоним, чтобы подтвердить заказ</p>
  </form>`;

function renderSheet() {
  const body = $('sheetBody');
  const ids = Object.keys(cart);
  if (!ids.length) {
    body.innerHTML = `
      <div class="empty">
        <div class="done-circle"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l1.5 12.5a1 1 0 0 1-1 1.1H5.5a1 1 0 0 1-1-1.1L6 7Z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg></div>
        <p>Пока пусто — загляните в каталог</p>
        <button class="ghost-btn" id="toCatalog" type="button">К каталогу</button>
      </div>`;
    $('toCatalog').addEventListener('click', closeSheet);
    return;
  }
  body.innerHTML = FORM_HTML;
  $('orderForm').addEventListener('submit', onSubmit);
  renderCartItems();
}

/* только строки позиций и итог: степпер внутри корзины не пересобирает
   форму, чтобы не стирать набранные имя и телефон */
function renderCartItems() {
  const ids = Object.keys(cart);
  if (!ids.length) { renderSheet(); return; }
  $('cartItems').innerHTML = ids.map(id => itemRow(byId(+id), cart[id])).join('');
  $('totalSum').textContent = fmt(cartSum());
  const note = $('npNote');
  if (ids.some(id => !byId(+id).price)) {
    if (!note) document.querySelector('.ctotal').insertAdjacentHTML('afterend',
      '<p class="form-note" id="npNote">Есть позиция без цены — итог посчитаем при подтверждении заказа</p>');
  } else if (note) note.remove();
}

function onSheetClick(e) {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  changeQty(+b.dataset.id, b.dataset.a === 'inc' ? 1 : -1);
  save();
  renderGrid();      /* сетка за шторкой не остаётся со старым степпером */
  renderCartItems();
  updateBars();
}

async function onSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const btn = form.querySelector('.submit-btn');
  const name = $('fName').value.trim(), phone = $('fPhone').value.trim();
  let ok = true;
  $('rowName').classList.toggle('err', !name);
  $('rowPhone').classList.toggle('err', !phone);
  document.querySelectorAll('.f-err').forEach(el => el.remove());
  if (!name) { rowErr($('rowName'), 'Подскажите имя'); ok = false; }
  if (!phone) { rowErr($('rowPhone'), 'Оставьте телефон для подтверждения'); ok = false; }
  if (!ok) return;

  /* сайт без Телеграма заказы пока не отправляет — сценарий сайта следующий шаг */
  if (!(tg && tg.initData)) { websiteDraft(name); return; }

  const payload = {
    action: 'order',
    tg: tg.initData,
    order: {
      name, phone,
      when: $('fWhen').value.trim(),
      addr: $('fAddr').value.trim(),
      note: $('fNote').value.trim(),
      items: Object.entries(cart).map(([id, qty]) => {
        const p = byId(+id);
        return { id: p.id, name: p.full, qty, price: p.price || 0 };
      }),
      sum: cartSum()
    }
  };

  btn.disabled = true;
  btn.textContent = 'Отправляем…';
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30000);
  try {
    const res = await fetch(BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ac.signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'мост отказал');
    orderDone(name, data.num);
  } catch (err) {
    formErr(/Подпись/.test(err.message)
      ? 'Ссылка устарела — закройте витрину и откройте заново, корзина сохранится'
      : 'Не получилось отправить — проверьте связь и нажмите ещё раз');
    btn.disabled = false;
    btn.textContent = 'Отправить заказ';
  } finally {
    clearTimeout(timer);
  }
}

/* Корзина чистится только здесь — после подтверждения моста, а не в момент
   нажатия кнопки: при сбое сети состав должен остаться у клиента */
function orderDone(name, num) {
  cart = {}; save(); renderGrid(); updateBars();
  $('sheetBody').innerHTML = `
    <div class="done">
      <div class="done-circle"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg></div>
      <h3>Спасибо, ${esc(name)}!</h3>
      <p>Заявка №${num} отправлена — ответ придёт сюда же, в чат с ботом. Можно закрывать витрину.</p>
      <button class="submit-btn" id="doneBtn" type="button">Готово</button>
    </div>`;
  $('doneBtn').addEventListener('click', () => {
    closeSheet();
    try { tg.close && tg.close(); } catch (e) { /* вне приложения закрыть нечем */ }
  });
}

function websiteDraft(name) {
  $('sheetBody').innerHTML = `
    <div class="done">
      <div class="done-circle"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5 10-11"/></svg></div>
      <h3>Спасибо, ${esc(name)}!</h3>
      <p>Заказы через сайт подключаются — пока оформите, пожалуйста, в Телеграме: корзина сохранится, перечислите её в сообщении.</p>
      <a class="submit-btn" href="https://t.me/taira_lis" target="_blank" rel="noopener">Написать в Телеграм</a>
      <button class="ghost-btn" id="doneBtn" type="button">Вернуться</button>
    </div>`;
  $('doneBtn').addEventListener('click', closeSheet);
}

/* ошибка отправки — инлайн над кнопкой, форма и корзина остаются как были */
function formErr(text) {
  document.querySelectorAll('.send-err').forEach(el => el.remove());
  const d = document.createElement('div');
  d.className = 'f-err send-err'; d.textContent = text;
  document.querySelector('.submit-btn').insertAdjacentElement('beforebegin', d);
}

function rowErr(row, text) {
  const d = document.createElement('div');
  d.className = 'f-err'; d.textContent = text;
  row.appendChild(d);
}

function openSheet() { renderSheet(); $('overlay').hidden = false; $('sheet').classList.add('open'); requestAnimationFrame(() => $('overlay').classList.add('show')); tgBack(true); }
function closeSheet() {
  $('overlay').classList.remove('show');
  $('sheet').classList.remove('open');
  $('psheet').classList.remove('open');
  tgBack(false);
  setTimeout(() => { $('overlay').hidden = true; }, 220);
}

/* ---------- товар: полный экран ---------- */

let currentP = null;

function pActionHtml() {
  const p = currentP;
  const qty = cart[p.id] || 0;
  if (!qty) {
    return `<button class="add-btn" id="pAdd" type="button">В корзину${p.price ? ' · ' + fmt(p.price) : ''}</button>`;
  }
  return `<div class="stepper">
    <button class="minus" id="pDec" type="button" aria-label="Меньше">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M5 12h14"/></svg>
    </button>
    <span class="qty">${qty}</span>
    <button class="plus" id="pInc" type="button" aria-label="Больше">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
    </button>
  </div>`;
}

function renderPAction() { $('pAction').innerHTML = pActionHtml(); }

function openProduct(id) {
  const p = byId(id);
  if (!p) return;
  currentP = p;
  $('pGallery').innerHTML = (p.imgs && p.imgs.length ? p.imgs : [p.ph2]).filter(Boolean).map(u =>
    `<img src="${u}" alt="${esc(p.full)}" loading="lazy" decoding="async">`).join('');
  $('pGallery').scrollLeft = 0;
  $('pLabel').textContent = p.lbl || '';
  $('pName').textContent = p.full;
  $('pPrice').innerHTML = p.price
    ? `<span class="now">${fmt(p.price)}</span>` + (p.old ? `<span class="was">${fmt(p.old)}</span>` : '')
    : '<span class="fill">[уточнить цену]</span>';
  $('pDesc').textContent = p.desc || '';
  renderPAction();
  $('overlay').hidden = false;
  $('psheet').classList.add('open');
  requestAnimationFrame(() => $('overlay').classList.add('show'));
  tgBack(true);
}

function onPActionClick(e) {
  const b = e.target.closest('button');
  if (!b || !currentP) return;
  if (b.id === 'pAdd' || b.id === 'pInc') changeQty(currentP.id, 1);
  else if (b.id === 'pDec') changeQty(currentP.id, -1);
  else return;
  save();
  updateBars();
  renderGrid();
  renderPAction();
}

/* ---------- запуск ---------- */

$('grid').addEventListener('click', onGridClick);
$('sheetBody').addEventListener('click', onSheetClick);
$('cartBtn').addEventListener('click', openSheet);
$('cartBar').addEventListener('click', openSheet);
$('sheetClose').addEventListener('click', closeSheet);
$('overlay').addEventListener('click', closeSheet);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

/* лента чипов: на десктопе колесо мыши крутит её горизонтально */
$('chips').addEventListener('wheel', e => {
  if (e.deltaY === 0) return;
  const el = $('chips');
  if (el.scrollWidth > el.clientWidth) { el.scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false });

/* товарная страница */
$('pAction').addEventListener('click', onPActionClick);
$('pClose').addEventListener('click', closeSheet);
$('tgLink').addEventListener('click', e => {
  if (tg && tg.openTelegramLink) { e.preventDefault(); tg.openTelegramLink('https://t.me/taira_lis'); }
});
$('pGallery').addEventListener('wheel', e => {
  if (e.deltaY === 0) return;
  const el = $('pGallery');
  if (el.scrollWidth > el.clientWidth) { el.scrollLeft += e.deltaY; e.preventDefault(); }
}, { passive: false });

/* ---------- полосы прокрутки: рисуем сами поверх контента ----------
   Нативные спрятаны (класс .nsb и правило для html) — места не занимают
   ни пикселя. Индикатор появляется у правого края при прокрутке и гаснет
   через 0,7 с тишины, как на телефоне. Только визуальный: события не ловит. */

function attachBar(scroller) {
  const bar = document.createElement('div');
  bar.className = 'sb';
  const thumb = document.createElement('div');
  thumb.className = 'sb-thumb';
  bar.appendChild(thumb);
  document.body.appendChild(bar);
  scroller.classList && scroller.classList.add('nsb');

  let hideTimer = null;
  const isRoot = scroller === document.documentElement;
  function update(silent) {
    const total = scroller.scrollHeight, view = scroller.clientHeight;
    if (total <= view + 1) { bar.classList.remove('sb-on'); return; }
    /* у корня getBoundingClientRect — размером со весь документ,
       поэтому вертикаль берём от окна, горизонталь — от колонки страницы */
    let right, top, height;
    if (isRoot) {
      right = document.querySelector('.wrap').getBoundingClientRect().right;
      top = 0;
      height = window.innerHeight;
    } else {
      const rect = scroller.getBoundingClientRect();
      right = rect.right;
      top = rect.top;
      height = rect.height;
    }
    bar.style.left = Math.round(right - 9) + 'px';
    bar.style.top = Math.round(top + 5) + 'px';
    bar.style.height = Math.round(height - 10) + 'px';
    const trackH = height - 10;
    const th = Math.max(28, trackH * view / total);
    const ty = (scroller.scrollTop / (total - view)) * (trackH - th);
    thumb.style.height = th + 'px';
    thumb.style.transform = `translateY(${ty}px)`;
    if (silent) return;
    bar.classList.add('sb-on');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => bar.classList.remove('sb-on'), 700);
  }

  /* события scroll в этой среде ненадёжны (программная прокрутка их не
     поднимает), поэтому следим за позицией по таймеру — три свойства
     на проверку, копейки */
  update(true);
  let lastTop = scroller.scrollTop, lastTotal = scroller.scrollHeight, lastView = scroller.clientHeight;
  setInterval(() => {
    const t = scroller.scrollTop, tot = scroller.scrollHeight, v = scroller.clientHeight;
    if (t !== lastTop || tot !== lastTotal || v !== lastView) {
      lastTop = t; lastTotal = tot; lastView = v;
      update();
    }
  }, 150);
  window.addEventListener('resize', () => update());
}

/* индикатор — только там, где есть мышь: на сенсорных экранах система
   сама рисует исчезающие полосы поверх контента */
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  attachBar(document.documentElement);
  attachBar($('sheetBody'));
  attachBar($('pScroll'));
}

/* ---------- запуск ----------
   Каталог — первый и в собственном контуре: что бы ни случилось дальше,
   витрина без каталога не остаётся. Вместо пустой сетки — явная ошибка */

function catalogFail(msg) {
  const grid = $('grid'), chips = $('chips');
  if (chips) chips.remove();
  grid.innerHTML = `
    <div class="catfail">
      <p><b>Каталог не загрузился.</b> ${msg}</p>
      <button class="ghost-btn" type="button" onclick="location.reload()">Обновить страницу</button>
      <p>Если не помогло — напишите нам: <a class="tg-link" href="https://t.me/taira_lis">@taira_lis</a></p>
    </div>`;
}

try {
  if (!CATALOG_OK) throw new Error('каталог пуст');
  renderChips();
  renderGrid();
} catch (e) {
  catalogFail('Обновите страницу — если не поможет, это сбой сети или хостинга.');
  console.error('каталог:', e);
}

try { updateBars(); } catch (e) { console.error('служебное:', e); }
