import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, getToken } from '../utils/api';
import { AlertTriangle, ClipboardList, Package, Download, MessageCircle } from '../utils/icons';
import { money } from '../utils/format';

export default function Inventory() {
  const { fail, toast, isAdmin } = useApp();
  const [products, setProducts] = useState([]);
  const [lowOnly, setLowOnly] = useState(false);

  useEffect(() => {
    api('/products?all=1').then(setProducts).catch(fail);
  }, [fail]);

  const list = lowOnly ? products.filter(p => p.low && p.active) : products.filter(p => p.active);
  const orderList = products.filter(p => p.low && p.active);

  const printOrder = () => {
    const text = orderList.map(p => `${p.sku} · ${p.name} · stock ${p.stock} (mín ${p.min_stock}) · pedir ~${Math.max(p.min_stock * 2 - p.stock, p.min_stock)} · ${p.supplier || ''}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => toast('Lista copiada al portapapeles'));
  };

  const download = async (path, name) => {
    try {
      const token = getToken();
      const res = await fetch('/api' + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
      if (!res.ok) throw new Error('No se pudo exportar');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      toast('Archivo descargado');
    } catch (e) { fail(e); }
  };

  const alertBoss = async () => {
    try {
      const r = await api('/alerts/low-stock-whatsapp');
      if (!r.count) return toast('No hay productos por agotarse');
      if (!r.url) return toast('Configura el celular del jefe en Ajustes', 'err');
      window.open(r.url, '_blank');
    } catch (e) { fail(e); }
  };

  return (
    <>
      <div className="spread mb">
        <div className="gap">
          <button className={`chip ${!lowOnly ? 'on' : ''}`} onClick={() => setLowOnly(false)}>Todos</button>
          <button className={`chip ${lowOnly ? 'on' : ''}`} onClick={() => setLowOnly(true)}><AlertTriangle size={14} strokeWidth={2} style={{ marginRight: 4 }} /> Por agotarse</button>
        </div>
        <div className="gap" style={{ flexWrap: 'wrap' }}>
          {isAdmin() && (
            <>
              <button className="btn" onClick={() => download('/export/inventory.xlsx', 'inventario.xlsx')}><Download size={14} style={{ marginRight: 4 }} /> Excel inventario</button>
              <button className="btn" onClick={() => download('/export/order.xlsx', 'pedido_proveedores.xlsx')} disabled={!orderList.length}><Download size={14} style={{ marginRight: 4 }} /> Excel pedido</button>
              <button className="btn" onClick={alertBoss} disabled={!orderList.length}><MessageCircle size={14} style={{ marginRight: 4 }} /> Avisar al jefe</button>
            </>
          )}
          <button className="btn primary" onClick={printOrder} disabled={!orderList.length}><ClipboardList size={16} strokeWidth={2} style={{ marginRight: 6 }} /> Lista de pedido</button>
        </div>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              <th>Categoría</th>
              <th>Proveedor</th>
              <th>Stock</th>
              <th>Mínimo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => (
              <tr key={p.id}>
                <td><code>{p.sku}</code></td>
                <td><b>{p.name}</b></td>
                <td>{p.category}</td>
                <td>{p.supplier || '—'}</td>
                <td>{p.stock}</td>
                <td>{p.min_stock}</td>
                <td>{p.low ? <span className="badge red">Por surtir</span> : <span className="badge ok">OK</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="empty"><div className="big"><Package size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div><p>Sin productos</p></div>}
      </div>
    </>
  );
}
