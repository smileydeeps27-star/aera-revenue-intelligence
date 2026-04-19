RI.Role = (function () {
  let users = [];
  function current() { return RI.AppStore.get('role') || 'cp'; }
  function currentUserId() { return RI.AppStore.get('user_id') || null; }
  function set(role, userId) {
    RI.AppStore.set('role', role);
    RI.AppStore.set('user_id', userId || null);
    RI.EventBus.emit('role:change', { role, userId });
  }
  function scopeParams(extra = '') {
    const r = current();
    const u = currentUserId();
    const qs = 'role=' + encodeURIComponent(r) + (u ? '&user_id=' + encodeURIComponent(u) : '');
    if (!extra) return '?' + qs;
    return extra.includes('?') ? (extra + '&' + qs) : (extra + '?' + qs);
  }
  async function loadUsers() {
    try { users = await RI.Api.get('/api/users'); } catch (e) { users = []; }
    return users;
  }
  function allUsers() { return users; }
  function usersForRole(role) { return users.filter(u => u.role === role); }
  function firstUserForRole(role) { return users.find(u => u.role === role); }
  return { current, currentUserId, set, scopeParams, loadUsers, allUsers, usersForRole, firstUserForRole };
})();
