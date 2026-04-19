RI.Router = (function () {
  const routes = [];

  function register(pattern, handler) {
    // pattern like '#/account-assist/:id' -> regex
    const re = new RegExp('^' + pattern.replace(/:[a-z_]+/gi, '([^/]+)') + '$');
    const keys = (pattern.match(/:[a-z_]+/gi) || []).map(k => k.slice(1));
    routes.push({ re, keys, handler, pattern });
  }

  function dispatch() {
    const hash = window.location.hash || '#/dashboard';
    for (const r of routes) {
      const m = hash.match(r.re);
      if (m) {
        const params = {};
        r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
        highlightTab(r.pattern);
        r.handler(params);
        return;
      }
    }
    window.location.hash = '#/dashboard';
  }

  function highlightTab(pattern) {
    const tabKey = pattern.split('/')[1] || 'dashboard';
    document.querySelectorAll('#tabs a').forEach(a => {
      a.classList.toggle('active', a.dataset.tab === tabKey);
    });
  }

  function start() {
    window.addEventListener('hashchange', dispatch);
    dispatch();
  }

  function go(hash) {
    if (window.location.hash === hash) dispatch();
    else window.location.hash = hash;
  }

  return { register, start, go };
})();
