/* ADC — 通用 UI 组件：弹窗、提示、格式化、表格等 */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function money(x) { return '¥' + (Number(x) || 0).toFixed(2); }
function dt(s) { return (s || '').slice(0, 16); }
function d(s) { return (s || '').slice(0, 10); }

function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toast-root').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function modal(html, { wide = false, onMount } = {}) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `<div class="modal-mask">
    <div class="modal${wide ? ' wide' : ''}">
      <div class="modal-head"><h3 id="modal-title"></h3><button class="x" data-close>✕</button></div>
      <div class="modal-body">${html}</div>
    </div></div>`;
  const mask = root.firstElementChild;
  mask.addEventListener('click', e => { if (e.target === mask || e.target.closest('[data-close]')) closeModal(); });
  if (onMount) onMount(mask);
  return {
    setTitle(t) { mask.querySelector('#modal-title').textContent = t; },
    setFoot(html) {
      const foot = document.createElement('div');
      foot.className = 'modal-foot';
      foot.innerHTML = html;
      mask.querySelector('.modal').appendChild(foot);
    },
    close() { closeModal(); },
    el: mask,
  };
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

/* 状态徽章 */
function badge(status, extra = {}) {
  const cls = extra[status] || `b-${status}`;
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}

/* 表单收集 */
function formData(form) {
  const out = {};
  new FormData(form).forEach((v, k) => {
    if (out[k] === undefined) out[k] = v;
    else out[k] = Array.isArray(out[k]) ? [...out[k], v] : [out[k], v];
  });
  return out;
}

/* 页面通用渲染：标题 + 内容 */
function page(title, html) {
  document.getElementById('page-title').textContent = title;
  document.getElementById('content').innerHTML = html;
}

function empty(text) { return `<div class="empty">${esc(text)}</div>`; }

async function safe(fn) {
  try { await fn(); }
  catch (e) { await handleAuthError(e); toast(e.message, 'err'); throw e; }
}

/* 缓存字典 */
let _meta = null;
async function meta() {
  if (!_meta) _meta = await API.get('/meta');
  return _meta;
}
