import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { Truck, Plus, Lock } from '../utils/icons';
import Modal from '../components/Modal';

const empty = { name: '', phone: '', email: '', notes: '', active: true };

export default function Suppliers() {
  const { fail, toast, isAdmin } = useApp();
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);

  const load = () => api('/suppliers').then(setList).catch(fail);
  useEffect(() => { load(); }, []);

  if (!isAdmin()) {
    return <div className="empty"><div className="big"><Lock size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div><p>Solo el admin gestiona proveedores</p></div>;
  }

  const save = async () => {
    if (!form.name.trim()) return toast('Nombre obligatorio', 'err');
    try {
      if (form.id) await api(`/suppliers/${form.id}`, { method: 'PUT', body: form });
      else await api('/suppliers', { method: 'POST', body: form });
      toast('Proveedor guardado');
      setForm(null);
      load();
    } catch (e) { fail(e); }
  };

  return (
    <>
      <div className="spread mb">
        <p className="muted">Proveedores para compras y lista de pedido automática.</p>
        <button className="btn primary" onClick={() => setForm({ ...empty })}><Plus size={16} style={{ marginRight: 6 }} /> Nuevo</button>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Nombre</th><th>Teléfono</th><th>Email</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {list.map(s => (
              <tr key={s.id} className={!s.active ? 'muted' : ''}>
                <td><b>{s.name}</b></td>
                <td>{s.phone || '—'}</td>
                <td>{s.email || '—'}</td>
                <td>{s.active ? <span className="badge ok">Activo</span> : <span className="badge">Inactivo</span>}</td>
                <td><button className="btn sm" onClick={() => setForm({ ...s })}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="empty"><div className="big"><Truck size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div><p>Sin proveedores aún</p></div>}
      </div>
      {form && (
        <Modal title={form.id ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={() => setForm(null)}>
          <div className="field"><label>Nombre</label><input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="field"><label>Teléfono / WhatsApp</label><input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="3001234567" /></div>
          <div className="field"><label>Email</label><input className="input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="field"><label>Notas</label><input className="input" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <label className="gap"><input type="checkbox" checked={form.active} onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} /> Activo</label>
          <div className="foot">
            <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
            <button className="btn primary" onClick={save}>Guardar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
