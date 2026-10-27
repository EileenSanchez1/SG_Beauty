import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { Lock, Plus, Layers } from '../utils/icons';
import Modal from '../components/Modal';

const EMOJIS = ['🛍️', '💅', '🌸', '💇‍♀️', '✨', '🧴', '💄', '🎀', '👁️', '🧼'];

export default function Categories() {
  const { fail, toast, isAdmin, loadCategories, categories } = useApp();
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);

  const load = () => api('/categories').then(setList).catch(fail);
  useEffect(() => { load(); }, []);

  if (!isAdmin()) {
    return (
      <div className="empty">
        <div className="big"><Lock size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div>
        <p>Solo el admin gestiona categorías</p>
      </div>
    );
  }

  const openNew = () => {
    const used = new Set(list.map(c => c.code));
    let code = 100;
    while (used.has(code)) code += 100;
    if (code > 9999) code = 400;
    setForm({ id: null, code, name: '', emoji: '🛍️' });
  };

  const openEdit = c => setForm({ id: c.id, code: c.code, name: c.name, emoji: c.emoji || '🛍️' });

  const save = async () => {
    if (!form.name.trim()) return toast('Escribe el nombre de la categoría', 'err');
    try {
      if (form.id) {
        await api(`/categories/${form.id}`, {
          method: 'PUT',
          body: { code: form.code, name: form.name.trim(), emoji: form.emoji },
        });
        toast('Categoría actualizada');
      } else {
        await api('/categories', {
          method: 'POST',
          body: { code: Number(form.code), name: form.name.trim(), emoji: form.emoji },
        });
        toast('Categoría creada');
      }
      setForm(null);
      load();
      loadCategories?.();
    } catch (e) { fail(e); }
  };

  return (
    <>
      <div className="spread mb">
        <p className="muted">
          Cada categoría tiene un código (100, 200, 300…) que forma el SKU automático (ej. 100-001).
          Al importar Excel eliges la categoría y todos los productos de ese archivo quedan en ella.
        </p>
        <button className="btn primary" onClick={openNew}><Plus size={16} style={{ marginRight: 6 }} /> Nueva categoría</button>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Próximo SKU</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => (
              <tr key={c.id}>
                <td><b>{c.emoji} {c.code}</b></td>
                <td>{c.name}</td>
                <td><code>{c.next_sku}</code></td>
                <td><button className="btn sm" onClick={() => openEdit(c)}>Editar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && (
          <div className="empty">
            <div className="big"><Layers size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div>
            <p>Sin categorías</p>
          </div>
        )}
      </div>

      {form && (
        <Modal title={form.id ? 'Editar categoría' : 'Nueva categoría'} onClose={() => setForm(null)}>
          <div className="field">
            <label>Código (100–9999)</label>
            <input
              className="input"
              type="number"
              min={100}
              max={9999}
              value={form.code}
              disabled={!!form.id}
              onChange={e => setForm(f => ({ ...f, code: Number(e.target.value) }))}
            />
            {form.id && <p className="muted" style={{ fontSize: 12 }}>El código no se cambia porque ya hay SKUs creados.</p>}
          </div>
          <div className="field">
            <label>Nombre</label>
            <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej. Maquillaje" />
          </div>
          <div className="field">
            <label>Emoji</label>
            <div className="gap" style={{ flexWrap: 'wrap' }}>
              {EMOJIS.map(e => (
                <button
                  key={e}
                  type="button"
                  className={`chip ${form.emoji === e ? 'on' : ''}`}
                  onClick={() => setForm(f => ({ ...f, emoji: e }))}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setForm(null)}>Cancelar</button>
            <button className="btn primary" onClick={save}>Guardar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
