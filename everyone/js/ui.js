// Small DOM helpers: element builder, icons, bottom sheets, toasts, confirm.

const PROPS = new Set(['value', 'checked', 'disabled', 'selected', 'hidden', 'htmlFor', 'textContent', 'indeterminate']);

/** h('button', { class: 'btn', onclick }, 'Label', child, [more]) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (PROPS.has(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

/** Like el.replaceChildren(), but skips null/false/'' instead of printing them. */
export function replace(el, ...children) {
  el.replaceChildren();
  return append(el, children);
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const ICONS = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  today: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/>',
  lists: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17.5" r="1.2" fill="currentColor" stroke="none"/>',
  settings: '<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>',
  more: '<circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  paste: '<rect x="5" y="4.5" width="14" height="16" rx="2"/><path d="M9 4.5h6v2.5H9zM8.5 11h7M8.5 14.5h7M8.5 18h4"/>',
  spread: '<path d="M4 6h16M4 12h10M4 18h6"/><path d="M17 15l3 3-3 3"/>',
  link: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>',
  upload: '<path d="M12 15.5V4.5M7 9l5-5 5 5M5 19.5h14"/>',
  file: '<path d="M14 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V8z"/><path d="M14 3.5V8h4.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  trash: '<path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  candle: '<path d="M12 3c1.8 2.1 2.4 3.6 1.6 5-.5.8-1.2 1.2-1.6 1.2s-1.1-.4-1.6-1.2C9.6 6.6 10.2 5.1 12 3z"/><rect x="9" y="11.5" width="6" height="9" rx="1"/>',
  reach: '<path d="M5 5.5h14A1.5 1.5 0 0 1 20.5 7v8.5A1.5 1.5 0 0 1 19 17h-7.5L7 20.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5z"/><path d="M8 10h8M8 13h5"/>',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

// ---------- keyboard-aware layout ----------

/** Keep sheets above the on-screen keyboard (iOS overlays it instead of resizing). */
export function trackVisualViewport() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => {
    const bottom = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    document.documentElement.style.setProperty('--kb', `${Math.round(bottom)}px`);
    document.documentElement.style.setProperty('--vvh', `${Math.round(vv.height)}px`);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

// ---------- sheets ----------

const openSheets = [];

/**
 * A bottom sheet built on <dialog>. Returns { el, body, close }.
 * `content` may be a node, an array, or a function (sheet) => nodes.
 */
export function openSheet({ title, content, className = '', onClose, labelledBy } = {}) {
  const titleId = `sheet-title-${Math.random().toString(36).slice(2, 8)}`;
  const body = h('div', { class: 'sheet-body' });
  const closeBtn = h('button', { class: 'icon-btn sheet-close', type: 'button', 'aria-label': 'Close' }, icon('x'));
  const dlg = h('dialog', { class: `sheet ${className}`.trim(), 'aria-labelledby': labelledBy || titleId },
    h('div', { class: 'sheet-grip', 'aria-hidden': 'true' }),
    h('header', { class: 'sheet-head' }, h('h2', { id: titleId }, title), closeBtn),
    body);

  let closed = false;
  const sheet = {
    el: dlg,
    body,
    close(result) {
      if (closed) return;
      closed = true;
      dlg.classList.add('closing');
      // Keep a toast that is showing inside this sheet alive after it closes.
      const t = dlg.querySelector('.toast');
      if (t) (document.querySelector('dialog[open]:not(.closing)') || document.body).append(t);
      const done = () => {
        if (dlg.open) dlg.close();
        dlg.remove();
        openSheets.splice(openSheets.indexOf(sheet), 1);
        onClose?.(result);
      };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
      else setTimeout(done, 160);
    },
  };

  closeBtn.addEventListener('click', () => sheet.close());
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); sheet.close(); });
  // A tap on the dimmed backdrop lands on the <dialog> itself.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) sheet.close(); });

  append(body, [typeof content === 'function' ? content(sheet) : content]);
  document.body.append(dlg);
  openSheets.push(sheet);
  dlg.showModal();
  return sheet;
}

export function closeAllSheets() {
  for (const s of [...openSheets]) s.close();
}

/** Promise<boolean> confirmation in a small sheet. */
export function confirmSheet({ title, message, confirm = 'OK', danger = false }) {
  return new Promise((resolve) => {
    let answer = false;
    const sheet = openSheet({
      title,
      className: 'sheet-confirm',
      onClose: () => resolve(answer),
      content: (s) => [
        message && h('p', { class: 'sheet-text' }, message),
        h('div', { class: 'sheet-actions' },
          h('button', { class: 'btn', type: 'button', onclick: () => s.close() }, 'Cancel'),
          h('button', {
            class: danger ? 'btn btn-danger-fill' : 'btn btn-primary',
            type: 'button',
            onclick: () => { answer = true; s.close(); },
          }, confirm)),
      ],
    });
    sheet.el.querySelector('.btn-primary, .btn-danger-fill')?.focus();
  });
}

// ---------- toast ----------

let toastEl;
let toastTimer;

export function toast(message, { action, onAction, duration = 5000 } = {}) {
  if (!toastEl) toastEl = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' });
  // An open sheet is in the top layer, so the toast has to live inside it to be seen.
  const dialogs = document.querySelectorAll('dialog[open]:not(.closing)');
  const host = dialogs[dialogs.length - 1] || document.body;
  if (toastEl.parentNode !== host) host.append(toastEl);
  const hide = () => toastEl.classList.remove('show');
  replace(toastEl,
    h('span', { class: 'toast-msg' }, message),
    action && h('button', {
      class: 'toast-action',
      type: 'button',
      onclick: () => { hide(); onAction?.(); },
    }, action),
  );
  // Restart the entrance animation.
  toastEl.classList.remove('show');
  void toastEl.offsetWidth;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, duration);
}

// ---------- form bits ----------

/** A row of single-choice chips. options: [{ value, label, sub? }] */
export function chipGroup({ options, value, onChange, label, className = '', wrap = false }) {
  const group = h('div', {
    class: `chips ${wrap ? 'chips-wrap' : ''} ${className}`.trim(),
    role: 'radiogroup',
    'aria-label': label,
  });
  const render = (current) => {
    group.replaceChildren(...options.map((o) => h('button', {
      type: 'button',
      class: `chip ${String(o.value) === String(current) ? 'on' : ''}`,
      role: 'radio',
      'aria-checked': String(String(o.value) === String(current)),
      onclick: () => { render(o.value); onChange?.(o.value); },
    }, o.label, o.sub != null && h('span', { class: 'chip-sub' }, o.sub))));
  };
  render(value);
  group.setValue = render;
  return group;
}

export function toggle({ label, hint, checked, onChange }) {
  const id = `t-${Math.random().toString(36).slice(2, 8)}`;
  const input = h('input', { type: 'checkbox', id, role: 'switch', checked, onchange: (e) => onChange(e.target.checked) });
  return h('div', { class: 'toggle-row' },
    h('label', { for: id, class: 'toggle-text' }, h('span', { class: 'toggle-label' }, label), hint && h('span', { class: 'hint' }, hint)),
    h('span', { class: 'switch' }, input, h('span', { class: 'switch-track', 'aria-hidden': 'true' })));
}

/** Auto-grow a textarea to fit its content. */
export function autoGrow(textarea, max = 240) {
  const fit = () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight + 2, max)}px`;
  };
  textarea.addEventListener('input', fit);
  requestAnimationFrame(fit);
  return fit;
}

export function plural(n, one, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/**
 * A prayer's words as paragraphs. A line in *asterisks* is the people's
 * response, or a rubric such as "or this", and is set in italics.
 */
/**
 * An entry's details, with each part between " · " (one person, say) kept
 * together on a line where it fits, so a name isn't split across lines.
 */
export function noteParts(note) {
  const parts = String(note || '').split(' · ');
  return parts.flatMap((part, k) => [k ? ' · ' : null, h('span', { class: 'note-part' }, part)]).filter(Boolean);
}

export function prayerBody(text, className = 'prayer-text') {
  return h('div', { class: className },
    String(text || '').split('\n').filter((l) => l.trim()).map((line) => {
      const m = line.match(/^\*(.*)\*$/);
      return m ? h('p', { class: 'prayer-response' }, h('em', null, m[1])) : h('p', null, line);
    }));
}
