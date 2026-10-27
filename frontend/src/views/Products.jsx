import { useEffect, useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api, getToken } from '../utils/api';
import { money } from '../utils/format';
import Modal from '../components/Modal';
import { Droplets, ShoppingBag, FileSpreadsheet } from '../utils/icons';

const emptyForm = {
  name: '', category_id: '', supplier_id: '', price: '', cost: '', stock: 0, min_stock: 5,
  barcode: '', origin: 'fabrica', active: true,
};

/** Select con buscador (categoría / proveedor) */
function SearchSelect({ label, options, value, onChange, placeholder = 'Buscar…', getLabel, getValue }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const valOf = getValue || (o => o.id);
  const labOf = getLabel || (o => o.name);

  useEffect(() => {
    const close = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const selected = options.find(o => String(valOf(o)) === String(value));
  const filtered = options.filter(o => {
    if (!q.trim()) return true;
    return labOf(o).toLowerCase().includes(q.toLowerCase());
  });

  return (
    <div className="field" ref={ref} style={{ position: 'relative' }}>
      <label>{label}</label>
      <button
        type="button"
        className="input"
        style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => { setOpen(v => !v); setQ(''); }}
      >
        <span>{selected ? labOf(selected) : (placeholder || 'Seleccionar…')}</span>
        <span style={{ opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute', zIndex: 50, left: 0, right: 0, top: '100%',
            background: '#fff', border: '1px solid var(--line)', borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 260, overflow: 'auto', marginTop: 4,
          }}
        >
          <div style={{ padding: 8, position: 'sticky', top: 0, background: '#fff' }}>
            <input
              className="input"
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder={placeholder}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <button
            type="button"
            className="btn ghost"
            style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0 }}
            onClick={() => { onChange(''); setOpen(false); }}
          >
            — Sin seleccionar —
          </button>
          {filtered.map(o => (
            <button
              key={valOf(o)}
              type="button"
              className="btn ghost"
              style={{
                width: '100%', justifyContent: 'flex-start', borderRadius: 0,
                background: String(valOf(o)) === String(value) ? 'var(--rose-50)' : undefined,
                fontWeight: String(valOf(o)) === String(value) ? 700 : 500,
              }}
              onClick={() => { onChange(valOf(o)); setOpen(false); }}
            >
              {labOf(o)}
            </button>
          ))}
          {!filtered.length && <p className="muted" style={{ padding: 12, margin: 0 }}>Sin resultados</p>}
        </div>
      )}
    </div>
  );
}

export default function Products() {
  const { categories, toast, fail, isAdmin, loadCategories } = useApp();
  const [products, setProducts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [q, setQ] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const [impFile, setImpFile] = useState(null);
  const [impCat, setImpCat] = useState('');
  const [impMin, setImpMin] = useState(5);
  const [impResult, setImpResult] = useState(null);
  const [impBusy, setImpBusy] = useState(false);

  const load = () => api('/products?all=1').then(setProducts).catch(fail);
  const loadSuppliers = () => api('/suppliers').then(rows => setSuppliers((rows || []).filter(s => s.active !== false))).catch(fail);

  useEffect(() => {
    load();
    loadCategories?.();
    loadSuppliers();
  }, []);

  const filtered = products.filter(p => {
    if (!showInactive && !p.active) return false;
    if (!q) return true;
    const ql = q.toLowerCase();
    return (
      p.name.toLowerCase().includes(ql) ||
      p.sku?.toLowerCase().includes(ql) ||
      (p.barcode || '').toLowerCase().includes(ql) ||
      (p.supplier || '').toLowerCase().includes(ql) ||
      (p.category || '').toLowerCase().includes(ql)
    );
  });

  const openNew = () => {
    setEdit(null);
    setForm({ ...emptyForm, category_id: categories[0]?.id || '' });
    setPreview(null);
    setFile(null);
    setShowForm(true);
  };

  const openEdit = p => {
    setEdit(p);
    setForm({
      name: p.name,
      category_id: p.category_id || '',
      supplier_id: p.supplier_id || '',
      price: p.price,
      cost: p.cost ?? '',
      stock: p.stock,
      min_stock: p.min_stock,
      barcode: p.barcode || '',
      origin: p.origin || 'fabrica',
      active: p.active !== false,
    });
    setPreview(p.image || null);
    setFile(null);
    setShowForm(true);
  };

  const onPickFile = e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast('Solo imágenes', 'err');
    if (f.size > 5 * 1024 * 1024) return toast('Máximo 5 MB', 'err');
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const uploadImage = async (productId) => {
    if (!file) return null;
    const fd = new FormData();
    fd.append('file', file);
    const token = getToken();
    const res = await fetch(`/api/products/${productId}/image`, {
      method: 'POST',
      headers: token ? { Authorization: 'Bearer ' + token } : {},
      body: fd,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.detail || 'No se pudo subir la foto');
    return data.image;
  };

  const save = async () => {
    if (!form.name.trim()) return toast('Escribe el nombre', 'err');
    if (!form.category_id) return toast('Elige categoría', 'err');
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        category_id: Number(form.category_id),
        supplier_id: form.supplier_id ? Number(form.supplier_id) : null,
        supplier: '',
        price: Number(form.price) || 0,
        cost: form.cost !== '' ? Number(form.cost) : 0,
        stock: Number(form.stock) || 0,
        min_stock: Number(form.min_stock) || 5,
        barcode: form.barcode || null,
        origin: form.origin || 'fabrica',
        active: true,
      };
      let productId = edit?.id;
      if (edit) {
        await api(`/products/${edit.id}`, { method: 'PUT', body: { ...body, stock: edit.stock } });
        toast('Producto actualizado');
      } else {
        const created = await api('/products', { method: 'POST', body });
        productId = created.id;
        toast('Producto creado');
      }
      if (file && productId) await uploadImage(productId);
      setShowForm(false);
      setFile(null);
      load();
      loadSuppliers();
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  };

  const toggle = async p => {
    try {
      await api(`/products/${p.id}/set-active`, { method: 'POST', body: { active: !p.active } });
      toast(p.active ? 'Desactivado' : 'Activado');
      load();
    } catch (e) { fail(e); }
  };

  const doImport = async () => {
    if (!impFile) return toast('Selecciona un Excel', 'err');
    if (!impCat) return toast('Elige la categoría del lote', 'err');
    setImpBusy(true);
    setImpResult(null);
    try {
      const fd = new FormData();
      fd.append('file', impFile);
      fd.append('category_id', String(impCat));
      fd.append('min_stock', String(impMin || 5));
      const token = getToken();
      const res = await fetch('/api/products/import', {
        method: 'POST',
        headers: token ? { Authorization: 'Bearer ' + token } : {},
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Error al importar');
      setImpResult(data);
      toast(data.message || `Cargados ${data.ok}`);
      load();
      loadSuppliers();
    } catch (e) { fail(e); }
    finally { setImpBusy(false); }
  };

  return (
    <>
      <div className="spread mb">
        <div className="gap" style={{ flexWrap: 'wrap' }}>
          <div className="search" style={{ maxWidth: 280 }}>
            <input className="input" placeholder="Buscar producto, SKU, proveedor…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <button type="button" className={`chip ${showInactive ? 'on' : ''}`} onClick={() => setShowInactive(v => !v)}>
            {showInactive ? 'Incluye inactivos' : 'Solo activos'}
          </button>
        </div>
        {isAdmin() && (
          <div className="gap">
            <button className="btn" onClick={() => { setImpResult(null); setImpFile(null); setImpCat(categories[0]?.id || ''); setShowImport(true); }}>
              <FileSpreadsheet size={16} style={{ marginRight: 6 }} /> Importar Excel
            </button>
            <button className="btn primary" onClick={openNew}>+ Nuevo producto</button>
          </div>
        )}
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th></th>
              <th>SKU</th>
              <th>Nombre</th>
              <th>Categoría</th>
              <th>Proveedor</th>
              <th>Precio</th>
              {isAdmin() && <th>Costo</th>}
              <th>Stock</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className={!p.active ? 'muted' : ''}>
                <td>
                  <div className="thumb" style={{ width: 56, height: 56 }}>
                    {p.image ? <img src={p.image} alt="" /> : (p.emoji || <ShoppingBag size={18} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} />)}
                  </div>
                </td>
                <td><code>{p.sku}</code></td>
                <td>
                  <b>{p.name}</b>
                  {p.low && p.active && <div><span className="badge red">Por surtir</span></div>}
                </td>
                <td>{p.category}</td>
                <td>{p.supplier || '—'}</td>
                <td>{money(p.price)}</td>
                {isAdmin() && <td>{p.cost != null ? money(p.cost) : '—'}</td>}
                <td><span className={`badge ${p.low ? 'red' : ''}`}>{p.stock}</span></td>
                <td>{p.active ? <span className="badge ok">Activo</span> : <span className="badge">Inactivo</span>}</td>
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
        {!filtered.length && (
          <div className="empty">
            <div className="big"><Droplets size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div>
            <p>Sin productos</p>
          </div>
        )}
      </div>

      {showForm && (
        <Modal title={edit ? 'Editar producto' : 'Nuevo producto'} onClose={() => !busy && setShowForm(false)} wide>
          <div className="grid g2">
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Foto</label>
              <div className="gap" style={{ alignItems: 'center' }}>
                <div className="thumb" style={{ width: 96, height: 96, borderRadius: 16 }}>
                  {preview ? <img src={preview} alt="" /> : <ShoppingBag size={28} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} />}
                </div>
                <div>
                  <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onPickFile} />
                  <button type="button" className="btn" onClick={() => fileRef.current?.click()}>{preview ? 'Cambiar foto' : 'Subir foto'}</button>
                </div>
              </div>
            </div>
            <div className="field">
              <label>Nombre</label>
              <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <SearchSelect
              label="Categoría"
              options={categories}
              value={form.category_id}
              onChange={id => setForm(f => ({ ...f, category_id: id }))}
              placeholder="Buscar categoría…"
              getLabel={c => `${c.emoji || ''} ${c.code} — ${c.name}`}
            />
            <div className="field">
              <label>Precio venta</label>
              <input className="input" type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
            </div>
            <div className="field">
              <label>Precio proveedor (costo)</label>
              <input className="input" type="number" value={form.cost} onChange={e => setForm(f => ({ ...f, cost: e.target.value }))} />
            </div>
            <SearchSelect
              label="Proveedor"
              options={suppliers}
              value={form.supplier_id}
              onChange={id => setForm(f => ({ ...f, supplier_id: id }))}
              placeholder="Buscar proveedor…"
              getLabel={s => s.name}
            />
            {!edit && (
              <div className="field">
                <label>Stock actual</label>
                <input className="input" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
              </div>
            )}
            <div className="field">
              <label>Stock mínimo (alerta surtir)</label>
              <input className="input" type="number" value={form.min_stock} onChange={e => setForm(f => ({ ...f, min_stock: e.target.value }))} />
            </div>
            <div className="field">
              <label>Código barras fábrica</label>
              <input className="input" value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} />
            </div>
          </div>
          {edit && (
            <p className="muted" style={{ fontSize: 13 }}>
              Si cambias la <b>categoría</b>, el SKU se regenera (ej. 300-001). Para subir stock usa <b>Inventario → Entrada</b>.
              Los proveedores se gestionan en el menú <b>Proveedores</b>.
            </p>
          )}
          <div className="foot">
            <button className="btn" disabled={busy} onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </Modal>
      )}

      {showImport && (
        <Modal title="Importar productos desde Excel" onClose={() => !impBusy && setShowImport(false)} wide>
          <p className="muted">
            Eliges la <b>categoría del lote</b>. El nombre de proveedor del Excel se vincula o crea en Proveedores.
            Luego puedes editar categoría, proveedor, foto y el resto; al cambiar categoría se actualiza el SKU.
          </p>
          <SearchSelect
            label="Categoría de este lote"
            options={categories}
            value={impCat}
            onChange={setImpCat}
            placeholder="Buscar categoría…"
            getLabel={c => `${c.emoji || ''} ${c.code} — ${c.name}`}
          />
          <div className="field">
            <label>Stock mínimo por defecto</label>
            <input className="input" type="number" min={0} value={impMin} onChange={e => setImpMin(e.target.value)} />
          </div>
          <div className="field">
            <label>Archivo .xlsx</label>
            <input type="file" accept=".xlsx,.xlsm" onChange={e => setImpFile(e.target.files?.[0] || null)} />
          </div>
          <div className="foot">
            <button className="btn" disabled={impBusy} onClick={() => setShowImport(false)}>Cerrar</button>
            <button className="btn primary" disabled={impBusy} onClick={doImport}>{impBusy ? 'Importando…' : 'Importar'}</button>
          </div>
          {impResult && (
            <div style={{ marginTop: 16 }}>
              <p><b>{impResult.message}</b></p>
              {impResult.low_count > 0 && (
                <div className="card">
                  <b>Por surtir ({impResult.low_count})</b>
                  <ul>{(impResult.low || []).map((x, i) => <li key={i}><code>{x.sku}</code> {x.name}: {x.stock}</li>)}</ul>
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
