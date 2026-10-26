import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money } from '../utils/format';
import Modal from '../components/Modal';

export default function Products() {
  const { categories, toast, fail, isAdmin, loadCategories } = useApp();
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ name: '', category_id: '', price: '', cost: '', stock: 0, min_stock: 3, barcode: '', supplier: '', origin: 'fabrica' });

  const load = () => api('/products?all=1').then(setProducts).catch(fail);
  useEffect(() => { load(); }, []);

  const filtered = products.filter(p => {
    if (!q) return true;
    const ql = q.toLowerCase();
    return p.name.toLowerCase().includes(ql) || p.sku?.toLowerCase().includes(ql);
  });

  const openNew = () => {
    setEdit(null);
    setForm({ name: '', category_id: categories[0]?.id || '', price: '', cost: '', stock: 0, min_stock: 3, barcode: '', supplier: '', origin: 'fabrica' });
    setShowForm(true);
  };

  const openEdit = p => {
    setEdit(p);
    setForm({
      name: p.name, category_id: p.category_id, price: p.price, cost: p.cost ?? '', stock: p.stock,
      min_stock: p.min_stock, barcode: p.barcode || '', supplier: p.supplier || '', origin: p.origin || 'fabrica'
    });
    setShowForm(true);
  };

  const save = async () => {
    try {
      const body = {
        ...form,
        price: Number(form.price),
        cost: form.cost !== '' ? Number(form.cost) : null,
        stock: Number(form.stock),
        min_stock: Number(form.min_stock),
        category_id: Number(form.category_id),
      };
      if (edit) {
        await api(`/products/${edit.id}`, { method: 'PUT', body });
        toast('Producto actualizado');
      } else {
        await api('/products', { method: 'POST', body });
        toast('Producto creado');
      }
      setShowForm(false);
      load();
    } catch (e) { fail(e); }
  };

  const toggle = async p => {
    try {
      await api(`/products/${p.id}`, { method: 'PUT', body: { active: !p.active } });
      load();
    } catch (e) { fail(e); }
  };

  return (
    <>
      <div className="spread mb">
        <div className="search" style={{ maxWidth: 320 }}>
          <input className="input" placeholder="Buscar producto…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {isAdmin() && <button className="btn primary" onClick={openNew}>+ Nuevo producto</button>}
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>SKU</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Precio</th>
              {isAdmin() && <th>Costo</th>}
              <th>Stock</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className={!p.active ? 'muted' : ''}>
                <td><div className="thumb sm">{p.image ? <img src={p.image} alt="" /> : (p.emoji || '🛍️')}</div></td>
                <td><code>{p.sku}</code></td>
                <td><b>{p.name}</b></td>
                <td>{p.category}</td>
                <td>{money(p.price)}</td>
                {isAdmin() && <td>{p.cost != null ? money(p.cost) : '—'}</td>}
                <td><span className={`badge ${p.low ? 'red' : ''}`}>{p.stock}</span></td>
                <td>
                  {isAdmin() && (
                    <div className="gap">
                      <button className="btn sm" onClick={() => openEdit(p)}>Editar</button>
                      <button className="btn sm ghost" onClick={() => toggle(p)}>{p.active ? 'Desactivar' : 'Activar'}</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <div className="empty"><div className="big">🧴</div><p>Sin productos</p></div>}
      </div>

      {showForm && (
        <Modal title={edit ? 'Editar producto' : 'Nuevo producto'} onClose={() => setShowForm(false)} wide>
          <div className="grid g2">
            <div className="field">
              <label>Nombre</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="field">
              <label>Categoría</label>
              <select className="input" value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Precio venta</label>
              <input className="input" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div className="field">
              <label>Costo</label>
              <input className="input" type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
            </div>
            <div className="field">
              <label>Stock inicial</label>
              <input className="input" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
            </div>
            <div className="field">
              <label>Stock mínimo</label>
              <input className="input" type="number" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))} />
            </div>
            <div className="field">
              <label>Código de barras fábrica</label>
              <input className="input" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
            </div>
            <div className="field">
              <label>Proveedor</label>
              <input className="input" value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} />
            </div>
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn primary" onClick={save}>Guardar</button>
          </div>
        </Modal>
      )}
    </>
  );
}
