const TOKEN_KEY = 'bp_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const opt = { method, headers: {} };
  const token = getToken();
  if (token) opt.headers.Authorization = 'Bearer ' + token;
  if (body) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  if (form) opt.body = form;
  let res;
  try {
    res = await fetch('/api' + path, opt);
  } catch {
    throw new Error('Sin conexión con el servidor');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    if (path === '/auth/login' || path.startsWith('/auth/login')) {
      throw new Error(typeof data.detail === 'string' ? data.detail : 'Usuario o contraseña incorrectos');
    }
    setToken(null);
    throw new Error('Sesión vencida');
  }
  if (!res.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Revisa los datos ingresados');
  }
  return data;
}
