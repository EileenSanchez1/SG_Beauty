import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import Modal from '../components/Modal';
import { Lock } from '../utils/icons';

export default function Users() {
  const { fail, toast, isAdmin } = useApp();
  const [users, setUsers] = useState([]);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ username: '', full_name: '', password: '', role: 'seller' });

  const load = () => api('/users').then(setUsers).catch(fail);
  useEffect(() => { if (isAdmin()) load(); }, []);

  if (!isAdmin()) {
    return <div className="empty"><div className="big"><Lock size={42} strokeWidth={1.5} style={{color:"var(--plum-soft)"}} /></div><p>Solo el admin puede gestionar usuarios</p></div>;
  }

  const save = async () => {
    try {
      await api('/users', { method: 'POST', body: form });
      toast('Usuario creado');
      setShow(false);
      setForm({ username: '', full_name: '', password: '', role: 'seller' });
      load();
    } catch (e) { fail(e); }
  };

  return (
    <>
      <div className="spread mb">
        <h3>Usuarios del sistema</h3>
        <button className="btn primary" onClick={() => setShow(true)}>+ Nuevo usuario</button>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr><th>Usuario</th><th>Nombre</th><th>Rol</th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><code>{u.username}</code></td>
                <td>{u.full_name}</td>
                <td>{u.role === 'admin' ? 'Administradora' : 'Vendedora'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {show && (
        <Modal title="Nuevo usuario" onClose={() => setShow(false)}>
          <div className="field">
            <label>Usuario</label>
            <input className="input" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
          </div>
          <div className="field">
            <label>Nombre completo</label>
            <input className="input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div className="field">
            <label>Contraseña</label>
            <input className="input" type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          </div>
          <div className="field">
            <label>Rol</label>
            <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="seller">Vendedora</option>
              <option value="admin">Administradora</option>
            </select>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setShow(false)}>Cancelar</button>
            <button className="btn primary" onClick={save}>Crear</button>
          </div>
        </Modal>
      )}
    </>
  );
}