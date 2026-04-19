var RI = window.RI || {};
window.RI = RI;

RI.Config = {
  APP_NAME: 'Revenue Intelligence',
  GATE_FIRE: 60,
  GATE_MEDPICSS: 5
};

RI.EventBus = (function () {
  const listeners = {};
  return {
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    off(ev, fn) { if (listeners[ev]) listeners[ev] = listeners[ev].filter(f => f !== fn); },
    emit(ev, data) { (listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } }); }
  };
})();

RI.AppStore = (function () {
  const state = { role: 'cp', aiMode: 'demo' };
  return {
    get(k) { return state[k]; },
    set(k, v) { state[k] = v; RI.EventBus.emit('store:' + k, v); }
  };
})();

RI.escapeHTML = function (s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
};

RI.formatCurrency = function (n) {
  if (n == null) return '—';
  if (typeof n === 'string') return n;
  if (n >= 1000000000) return '$' + (n / 1000000000).toFixed(1) + 'B';
  if (n >= 1000000) return '$' + (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return '$' + Math.round(n / 1000) + 'K';
  return '$' + n;
};

RI.formatNumber = function (n) { return (n || 0).toLocaleString(); };

RI.showToast = function (msg, type) {
  const container = document.getElementById('toasts');
  if (!container) return;
  const t = document.createElement('div');
  t.className = 'toast ' + (type || 'success');
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transform = 'translateX(100%)';
    setTimeout(() => t.remove(), 300);
  }, 3000);
};

RI.daysAgo = function (iso) {
  if (!iso) return '—';
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return '1 day ago';
  return diff + ' days ago';
};
