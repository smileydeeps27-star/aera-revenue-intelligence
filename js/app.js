(function () {
  RI.Router.register('#/dashboard', () => RI.Dashboard.render());
  RI.Router.register('#/warmup', () => RI.Warmup.renderList());
  RI.Router.register('#/warmup/:id', (params) => RI.WarmupDetail.render(params));
  RI.Router.register('#/account-assist/:id', (params) => RI.AccountAssist.render(params));
  RI.Router.register('#/opps', () => RI.Opportunities.renderBoard());
  RI.Router.register('#/opps/:id', (params) => RI.Opportunities.renderDetail(params));
  RI.Router.register('#/market-intel', () => RI.MarketIntel.render());
  RI.Router.register('#/leads', () => RI.Leads.render());
  RI.Router.register('#/territory', () => RI.Territory.render());

  const roleSelect = document.getElementById('role-select');
  const userSelect = document.getElementById('user-select');

  const ROLE_LABELS = { cp: 'CP', rvp: 'RVP', cro: 'CRO', ceo: 'CEO', bdr: 'BDR' };

  function renderUserOptions(role) {
    const users = RI.Role.usersForRole(role);
    userSelect.innerHTML = users.map(u => '<option value="' + u.id + '">' + u.name + '</option>').join('')
      || '<option value="">—</option>';
    const first = users[0];
    if (first) RI.AppStore.set('user_id', first.id);
    userSelect.style.display = users.length > 1 ? '' : 'none';
  }

  function renderRoleOptions() {
    roleSelect.innerHTML = ['cp', 'bdr', 'rvp', 'cro', 'ceo']
      .map(r => '<option value="' + r + '">' + ROLE_LABELS[r] + '</option>').join('');
  }

  function currentView() {
    const hash = window.location.hash || '#/dashboard';
    return hash.split('/')[1] || 'dashboard';
  }

  function rerenderCurrent() {
    const v = currentView();
    if (v === 'dashboard') RI.Dashboard.render();
    else if (v === 'warmup' && !window.location.hash.includes('/warmup/')) RI.Warmup.renderList();
    else if (v === 'opps' && !window.location.hash.includes('/opps/')) RI.Opportunities.renderBoard();
    else if (v === 'leads') RI.Leads.render();
  }

  roleSelect.addEventListener('change', () => {
    const role = roleSelect.value;
    renderUserOptions(role);
    RI.Role.set(role, RI.AppStore.get('user_id'));
    rerenderCurrent();
  });
  userSelect.addEventListener('change', () => {
    RI.Role.set(roleSelect.value, userSelect.value);
    rerenderCurrent();
  });

  async function initAiMode() {
    const dot = document.getElementById('ai-dot');
    const label = document.getElementById('ai-mode-label');
    try {
      const r = await fetch('/api/key-status').then(r => r.json());
      if (r.configured) {
        RI.AppStore.set('aiMode', 'gemini');
        dot.classList.add('ok');
        label.textContent = 'Gemini live';
      } else {
        dot.classList.add('demo');
        label.textContent = 'Demo';
      }
    } catch (e) {
      dot.classList.add('demo');
      label.textContent = 'Demo';
    }
  }

  (async () => {
    await initAiMode();
    await RI.Role.loadUsers();
    renderRoleOptions();
    renderUserOptions('cp');
    RI.Role.set('cp', RI.Role.firstUserForRole('cp')?.id);
    RI.Router.start();
  })();
})();
