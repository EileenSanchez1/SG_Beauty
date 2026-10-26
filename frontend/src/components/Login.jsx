import { useState } from 'react';
import { useApp } from '../context/AppContext';

export default function Login() {
  const { login, fail } = useApp();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(username, password);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-card">
        {/* Nombre corregido a logosg.jpg y display block para centrar */}
        <img 
          src="/logosg.jpg" 
          alt="SG Beauty Logo" 
          style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', display: 'block', margin: '0 auto 12px' }} 
        />
        <h1>SG BEAUTY</h1>
        <p className="muted">Sistema de gestión, caja y punto de venta</p>
        <form onSubmit={submit}>
          <div className="field">
            <label>Usuario</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoFocus />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button className="btn primary big" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <div className="hint">
          <b>Demo:</b> <code>admin</code> / <code>admin123</code> (administrador) · <code>vendedor</code> / <code>vendedor123</code>
        </div>
      </div>
    </div>
  );
}