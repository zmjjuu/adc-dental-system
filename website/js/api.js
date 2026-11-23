/* ADC — API 客户端与登录态 */
const API = {
  token: localStorage.getItem('adc_token') || null,
  user: JSON.parse(localStorage.getItem('adc_user') || 'null'),

  async call(method, path, body) {
    const resp = await fetch('/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (this.token || '') },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = {};
    try { data = await resp.json(); } catch (e) { /* 空响应 */ }
    if (!resp.ok) {
      const err = new Error(data.error || ('请求失败 ' + resp.status));
      err.status = resp.status;
      throw err;
    }
    return data;
  },

  get(p) { return this.call('GET', p); },
  post(p, b) { return this.call('POST', p, b || {}); },
  put(p, b) { return this.call('PUT', p, b || {}); },

  async login(login_name, password) {
    const data = await this.call('POST', '/login', { login_name, password });
    this.token = data.token;
    this.user = data.user;
    localStorage.setItem('adc_token', data.token);
    localStorage.setItem('adc_user', JSON.stringify(data.user));
    return data.user;
  },

  logout() {
    if (this.token) this.post('/logout').catch(() => {});
    this.token = null; this.user = null;
    localStorage.removeItem('adc_token'); localStorage.removeItem('adc_user');
  },

  hasRole(...codes) {
    if (!this.user) return false;
    const held = new Set(this.user.roles.map(r => r.role_code));
    return codes.some(c => held.has(c));
  },

  roleNames() { return this.user ? this.user.roles.map(r => r.role_name).join(' / ') : ''; },
};

async function handleAuthError(err) {
  if (err.status === 401) {
    API.logout();
    window.dispatchEvent(new CustomEvent('adc:unauthorized'));
  }
  return err;
}
