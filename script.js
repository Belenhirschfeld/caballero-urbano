'use strict';

/* =========================================================
   CONFIGURACIÓN — datos de la barbería
   ========================================================= */
const h = (hh, mm = 0) => hh * 60 + mm; // hora → minutos desde las 00:00

const CONFIG = {
  instagram: 'caballerourbano.barbershop',  // usuario de Instagram (sin @)
  whatsapp: '5493434477998',                // número internacional sin "+". Vacío = se confirma por Instagram
  whatsappLabel: '343 447-7998',
  address: 'Monte Caseros 345',
  city: 'Paraná, Entre Ríos',
  mapsUrl: 'https://maps.app.goo.gl/YR8qZuXUQz9ypz2a6',
  slotStep: 30,                             // minutos entre turnos
  daysAhead: 14,                            // días que se pueden reservar por adelantado
  // horarios por día (0 = domingo). Cada día es una lista de franjas [apertura, cierre]; null = cerrado
  hours: {
    0: null,
    1: [[h(16), h(20)]],
    2: [[h(9), h(12, 30)], [h(16), h(20)]],
    3: [[h(9), h(12, 30)], [h(16), h(20)]],
    4: [[h(9), h(12, 30)], [h(16), h(20)]],
    5: [[h(9), h(12, 30)], [h(16), h(20)]],
    6: [[h(10), h(13)], [h(17), h(21)]],
  },
};

// duraciones estimadas: ajustarlas a lo que tarda cada servicio en la barbería
const SERVICES = [
  { id: 'corte',      name: 'Corte',         dur: 30, price: 13000, desc: 'Incluye diseño y perfilado básico de cejas.' },
  { id: 'corte-barba', name: 'Corte + Barba', dur: 45, price: 15000, desc: 'Incluye diseño y perfilado básico de cejas.', tag: 'Completo' },
  { id: 'barba',      name: 'Barba',         dur: 30, price: 10000, desc: 'Perfilado y arreglo de barba.' },
  { id: 'cejas',      name: 'Cejas',         dur: 15, price: 6000,  desc: 'Perfilado de cejas.' },
];

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const STORAGE_KEY = 'cu_bookings';

/* ---------- helpers ---------- */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const pad = (n) => String(n).padStart(2, '0');
const toHM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtLong = (s) => parseISO(s).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortLabel = (d, opt) => d.toLocaleDateString('es-AR', opt).replace('.', '');
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const getService = () => SERVICES.find((s) => s.id === state.service);
const serviceDur = () => Math.ceil(getService().dur / CONFIG.slotStep) * CONFIG.slotStep;
const fullAddress = () => `${CONFIG.address}, ${CONFIG.city}`;
const instagramUrl = () => `https://instagram.com/${CONFIG.instagram}`;

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3600);
}

/* ---------- almacenamiento (turnos guardados en este navegador) ---------- */
function loadBookings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function saveBooking(b) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadBookings(), b])); } catch { /* sin storage */ }
}

/* ---------- disponibilidad ----------
   Sin backend, simulamos una agenda ocupada de forma determinística
   (siempre los mismos huecos para un mismo día) y sumamos los turnos
   reservados desde este navegador. */
function hash(str) {
  let x = 2166136261;
  for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
  return x >>> 0;
}
function isFree(date, start, dur, bookings) {
  for (let m = start; m < start + dur; m += CONFIG.slotStep) {
    if (hash(`${date}|${m}`) % 100 < 30) return false;
    if (bookings.some((b) => b.date === date && m >= b.start && m < b.start + b.dur)) return false;
  }
  return true;
}
function daySlots(date, bookings) {
  const ranges = CONFIG.hours[parseISO(date).getDay()];
  if (!ranges || !state.service) return [];
  const dur = serviceDur();
  const now = new Date();
  const cutoff = isoDate(now) === date ? now.getHours() * 60 + now.getMinutes() + 30 : -1;
  const slots = [];
  for (const [open, close] of ranges) {
    for (let m = open; m + dur <= close; m += CONFIG.slotStep) {
      if (m < cutoff) continue;
      slots.push({ min: m, free: isFree(date, m, dur, bookings) });
    }
  }
  return slots;
}

/* ---------- estado ---------- */
const state = { step: 1, service: null, date: null, time: null };

/* ---------- catálogo ---------- */
function renderMenu() {
  $('#serviceMenu').innerHTML = SERVICES.map((s, i) => `
    <li class="menu-item" style="animation-delay:${i * 60}ms">
      <div class="menu-row">
        <h3>${s.name}</h3>
        ${s.tag ? `<span class="tag">${s.tag}</span>` : ''}
        <span class="leader"></span>
        <span class="price">${money.format(s.price)}</span>
      </div>
      <div class="menu-meta">
        <p>${s.desc}</p>
        <button type="button" class="link-btn" data-book="${s.id}">Reservar →</button>
      </div>
    </li>`).join('');
}

/* ---------- turnos: pasos ---------- */
function renderServiceOptions() {
  $('#serviceOptions').innerHTML = SERVICES.map((s) => `
    <button type="button" class="opt" data-service="${s.id}" aria-pressed="${s.id === state.service}">
      <span class="opt-name">${s.name}</span>
      <span class="opt-meta"><span>${s.desc.replace('.', '')}</span><strong>${money.format(s.price)}</strong></span>
    </button>`).join('');
}
function renderDays() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: CONFIG.daysAhead }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return d;
  });
  const bookings = loadBookings();

  // si no hay día elegido, seleccionamos el primero con lugar
  if (!state.date) {
    const first = days.find((d) => daySlots(isoDate(d), bookings).some((s) => s.free));
    state.date = first ? isoDate(first) : null;
  }

  $('#days').innerHTML = days.map((d, i) => {
    const iso = isoDate(d);
    const closed = !CONFIG.hours[d.getDay()];
    return `
      <button type="button" class="day" data-date="${iso}" aria-pressed="${iso === state.date}" ${closed ? 'disabled' : ''}
        aria-label="${fmtLong(iso)}${closed ? ', cerrado' : ''}">
        <span class="dw">${i === 0 ? 'Hoy' : shortLabel(d, { weekday: 'short' })}</span>
        <span class="dn">${d.getDate()}</span>
        <span class="dm">${shortLabel(d, { month: 'short' })}</span>
      </button>`;
  }).join('');

  $('.day[aria-pressed="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  renderSlots(bookings);
}
function renderSlots(bookings = loadBookings()) {
  const slots = state.date ? daySlots(state.date, bookings) : [];
  if (state.time != null && !slots.some((s) => s.min === state.time && s.free)) state.time = null;

  const groups = [['Mañana', (s) => s.min < h(14)], ['Tarde', (s) => s.min >= h(14)]];
  $('#slots').innerHTML = groups.map(([label, test]) => {
    const g = slots.filter(test);
    if (!g.length) return '';
    return `
      <div class="slot-group">
        <p class="slot-label">${label}</p>
        <div class="slots">${g.map((s) =>
          `<button type="button" class="slot" data-min="${s.min}" aria-pressed="${s.min === state.time}" ${s.free ? '' : 'disabled'}>${toHM(s.min)}</button>`
        ).join('')}</div>
      </div>`;
  }).join('');
  $('#slotsEmpty').hidden = slots.some((s) => s.free);
  updateUI();
}

function canAdvance() {
  switch (state.step) {
    case 1: return !!state.service;
    case 2: return !!state.date && state.time != null;
    case 3: return true;
    default: return false;
  }
}

function goTo(step) {
  state.step = step;
  const done = step === 4;
  $$('.panel').forEach((p) => { p.hidden = Number(p.dataset.panel) !== step; });
  $$('#steps li').forEach((li) => {
    const n = Number(li.dataset.step);
    li.classList.toggle('active', n === step);
    li.classList.toggle('done', n < step && !done);
  });
  $('#steps').hidden = done;
  $('#booking').classList.toggle('is-done', done);

  if (step === 2) renderDays();
  if (step === 3) setTimeout(() => $('#fName').focus({ preventScroll: true }), 50);

  // en pantallas chicas, mantener el paso a la vista
  const top = $('#booking').getBoundingClientRect().top;
  if (top < 0) $('#booking').scrollIntoView({ behavior: 'smooth', block: 'start' });

  updateUI();
}

function updateUI() {
  const s = state.service && getService();
  const set = (id, val) => { const el = $(id); el.textContent = val || '—'; el.classList.toggle('empty', !val); };

  set('#sumService', s && s.name);
  set('#sumDate', state.date && state.step >= 2 && fmtLong(state.date));
  set('#sumTime', state.time != null && `${toHM(state.time)} hs`);
  $('#sumTotal').textContent = s ? money.format(s.price) : '—';

  $('#bookingNav').hidden = state.step === 4;
  $('#backBtn').hidden = state.step === 1;
  $('#nextBtn').textContent = state.step === 3 ? 'Confirmar turno' : 'Continuar';
  $('#nextBtn').disabled = !canAdvance();
}

/* ---------- formulario ---------- */
function validateForm() {
  const fields = { name: $('#fName'), phone: $('#fPhone') };
  const errors = {};
  if (fields.name.value.trim().length < 3) errors.name = 'Contanos tu nombre.';
  if (fields.phone.value.replace(/\D/g, '').length < 8) errors.phone = 'Ingresá un teléfono válido.';

  for (const [key, input] of Object.entries(fields)) {
    const field = input.closest('.field');
    field.classList.toggle('invalid', !!errors[key]);
    field.querySelector('.error').textContent = errors[key] || '';
  }
  const firstError = Object.keys(errors)[0];
  if (firstError) fields[firstError].focus();
  return !firstError;
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'CU-' + Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function confirmBooking() {
  if (!validateForm()) return;
  const dur = serviceDur();
  if (!isFree(state.date, state.time, dur, loadBookings())) {
    toast('Ese horario se acaba de ocupar. Elegí otro, por favor.');
    state.time = null;
    goTo(2);
    return;
  }
  const booking = {
    code: makeCode(),
    service: state.service,
    date: state.date,
    start: state.time,
    dur,
    name: $('#fName').value.trim(),
    phone: $('#fPhone').value.trim(),
    notes: $('#fNotes').value.trim(),
    createdAt: Date.now(),
  };
  saveBooking(booking);
  renderDone(booking);
  goTo(4);
}

let lastMessage = '';

function renderDone(b) {
  const s = SERVICES.find((x) => x.id === b.service);
  const firstName = escapeHtml(b.name.split(' ')[0]);

  lastMessage = [
    '¡Hola, Caballero Urbano! Quiero confirmar mi turno:',
    `• ${s.name} (${money.format(s.price)})`,
    `• ${fmtLong(b.date)} a las ${toHM(b.start)} hs`,
    `• A nombre de ${b.name} · ${b.phone}`,
    b.notes ? `• Nota: ${b.notes}` : '',
    `• Código: ${b.code}`,
  ].filter(Boolean).join('\n');

  const confirmBtn = CONFIG.whatsapp
    ? `<a class="btn" href="https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(lastMessage)}" target="_blank" rel="noopener">Confirmar por WhatsApp</a>`
    : `<button type="button" class="btn" id="sendInstagram">Confirmar por Instagram</button>`;
  const hint = CONFIG.whatsapp
    ? 'Envianos la confirmación por WhatsApp para que te lo agendemos.'
    : 'Tocá el botón: copiamos los datos del turno y abrimos nuestro chat de Instagram. Solo tenés que pegarlos y enviar.';

  const stamp = (min) => `${b.date.replace(/-/g, '')}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
  const calUrl = 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
    action: 'TEMPLATE',
    text: `${s.name} · Caballero Urbano`,
    dates: `${stamp(b.start)}/${stamp(b.start + b.dur)}`,
    details: `Turno en Caballero Urbano Barber Shop. Código ${b.code}.`,
    location: fullAddress(),
  });

  $('#done').innerHTML = `
    <div class="done-mark" aria-hidden="true">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
    </div>
    <p class="eyebrow">Último paso</p>
    <h3>¡Listo, ${firstName}! Confirmá tu turno</h3>
    <p class="done-code">Código de reserva <strong>${b.code}</strong></p>
    <dl class="done-details">
      <div><dt>Servicio</dt><dd>${s.name}</dd></div>
      <div><dt>Fecha</dt><dd>${fmtLong(b.date)}</dd></div>
      <div><dt>Hora</dt><dd>${toHM(b.start)} hs</dd></div>
      <div><dt>Total</dt><dd>${money.format(s.price)}</dd></div>
      <div><dt>Dónde</dt><dd>${CONFIG.address}</dd></div>
    </dl>
    <p class="done-hint">${hint}</p>
    <div class="done-actions">
      ${confirmBtn}
      <a class="btn btn-ghost" href="${calUrl}" target="_blank" rel="noopener">Agregar al calendario</a>
    </div>
    <button type="button" class="link-btn" id="newBooking">Sacar otro turno</button>`;
}

async function sendInstagram() {
  try {
    await navigator.clipboard.writeText(lastMessage);
    toast('Datos del turno copiados. Pegalos en el chat y enviá.');
  } catch {
    toast('Abrimos el chat: contanos el servicio, día y hora de tu turno.');
  }
  window.open(`https://ig.me/m/${CONFIG.instagram}`, '_blank', 'noopener');
}

function resetBooking() {
  Object.assign(state, { service: null, date: null, time: null });
  $('#contactForm').reset();
  $$('#contactForm .field').forEach((f) => { f.classList.remove('invalid'); const e = $('.error', f); if (e) e.textContent = ''; });
  renderServiceOptions();
  goTo(1);
}

/* ---------- horarios y contacto ---------- */
function openStatus(now) {
  const mins = now.getHours() * 60 + now.getMinutes();
  const today = CONFIG.hours[now.getDay()] || [];
  const current = today.find(([o, c]) => mins >= o && mins < c);
  if (current) return { open: true, text: `Abierto ahora · hasta las ${toHM(current[1])}` };

  const later = today.find(([o]) => o > mins);
  if (later) return { open: false, text: `Cerrado ahora · abrimos hoy a las ${toHM(later[0])}` };

  for (let i = 1; i <= 7; i++) {
    const day = (now.getDay() + i) % 7;
    const ranges = CONFIG.hours[day];
    if (ranges) {
      const when = i === 1 ? 'mañana' : `el ${DAY_NAMES[day].toLowerCase()}`;
      return { open: false, text: `Cerrado ahora · abrimos ${when} a las ${toHM(ranges[0][0])}` };
    }
  }
  return { open: false, text: 'Cerrado' };
}

function renderContact() {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const now = new Date();
  $('#hours').innerHTML = order.map((d) => {
    const ranges = CONFIG.hours[d];
    const text = ranges ? ranges.map(([o, c]) => `${toHM(o)} – ${toHM(c)}`).join('<br>') : 'Cerrado';
    return `<li class="${d === now.getDay() ? 'today' : ''}"><span>${DAY_NAMES[d]}</span><span>${text}</span></li>`;
  }).join('');

  const status = openStatus(now);
  $('#openStatus').textContent = status.text;
  $('#openStatus').classList.toggle('is-open', status.open);

  $('#address').textContent = CONFIG.address;
  $('#mapLink').href = CONFIG.mapsUrl;

  const links = [`<li><a href="${instagramUrl()}" target="_blank" rel="noopener">Instagram · @${CONFIG.instagram}</a></li>`];
  if (CONFIG.whatsapp) links.unshift(`<li><a href="https://wa.me/${CONFIG.whatsapp}" target="_blank" rel="noopener">WhatsApp · ${CONFIG.whatsappLabel}</a></li>`);
  $('#contactList').innerHTML = links.join('');
  $('#year').textContent = now.getFullYear();
}

/* ---------- eventos ---------- */
function bindEvents() {
  $('#serviceMenu').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-book]');
    if (!btn) return;
    state.service = btn.dataset.book;
    state.time = null;
    renderServiceOptions();
    goTo(2);
    $('#reservar').scrollIntoView({ behavior: 'smooth' });
  });

  $('#serviceOptions').addEventListener('click', (e) => {
    const opt = e.target.closest('[data-service]');
    if (!opt) return;
    state.service = opt.dataset.service;
    state.time = null;
    renderServiceOptions();
    updateUI();
    setTimeout(() => goTo(2), 220);
  });

  $('#days').addEventListener('click', (e) => {
    const day = e.target.closest('.day');
    if (!day || day.disabled) return;
    state.date = day.dataset.date;
    state.time = null;
    $$('.day').forEach((d) => d.setAttribute('aria-pressed', d === day));
    renderSlots();
  });

  $('#slots').addEventListener('click', (e) => {
    const slot = e.target.closest('.slot');
    if (!slot || slot.disabled) return;
    state.time = Number(slot.dataset.min);
    $$('.slot').forEach((s) => s.setAttribute('aria-pressed', s === slot));
    updateUI();
  });

  $('#steps').addEventListener('click', (e) => {
    const li = e.target.closest('li.done');
    if (li) goTo(Number(li.dataset.step));
  });

  $('#backBtn').addEventListener('click', () => goTo(state.step - 1));
  $('#nextBtn').addEventListener('click', () => {
    if (state.step === 3) confirmBooking();
    else if (canAdvance()) goTo(state.step + 1);
  });

  $('#contactForm').addEventListener('input', (e) => {
    const field = e.target.closest('.field');
    if (field?.classList.contains('invalid')) {
      field.classList.remove('invalid');
      $('.error', field).textContent = '';
    }
  });
  $('#contactForm').addEventListener('submit', (e) => { e.preventDefault(); confirmBooking(); });

  $('#done').addEventListener('click', (e) => {
    if (e.target.id === 'newBooking') resetBooking();
    if (e.target.id === 'sendInstagram') sendInstagram();
  });

  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

function initReveal() {
  const items = $$('.reveal');
  if (!('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
    });
  }, { threshold: .15 });
  items.forEach((el) => io.observe(el));
}

/* ---------- init ---------- */
renderMenu();
renderServiceOptions();
renderContact();
bindEvents();
initReveal();
goTo(1);
