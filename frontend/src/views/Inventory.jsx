import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { AlertTriangle, ClipboardList, Package } from '../utils/icons';
import { money } from '../utils/format';

export default function Inventory() {
  const { fail, toast } = useApp();
  const [products, setProducts] = useState([]);
  const [lowOnly, setLowOnly] = useState(false);

  useEffect(() => {
    api('/products?all=1').then(setProducts).catch(fail);
  }, [fail]);

  const list = lowOnly ? products.filter(p => p.low && p.active) : products.filter(p => p.active);
  const orderList = products.filter(p => p.low && p.active);

  const printOrder = () => {
    const text = orderList.map(p => `${p.sku} · ${p.name} · stock ${p.stock} (mín ${p.min_stock}) · pedir ~${Math.max(p.min_stock * 2 - p.stock, p.min_stock)}`).join('\n');
    navigator.clipboard?.writeText(text).then(() => toast('Lista copiada al portapapeles'));
  };

  return (
    <>
      <div className="spread mb">
        <div className="gap">
          <button className={`chip ${!lowOnly ? 'on' : ''}`} onClick={() => setLowOnly(false)}>Todos</button>
          <button className={`chip ${lowOnly ? 'on' : ''}`} onClick={() => setLowOnly(true)}><AlertTriangle size={14} strokeWidth={2} style={{marginRight:4}} /> Por agotarse</button>
        </div>
        <button className="btn primary" onClick={printOrder} disabled={!orderList.length}><ClipboardList size={16} strokeWidth={2} style={{marginRight:6}} /> Lista de pedido a proveedores</button>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              <th>Categoría</th>
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
                <td>{p.stock}</td>
                <td>{p.min_stock}</td>
                <td>{p.low ? <span className="badge red">Por surtir</span> : <span className="badge ok">OK</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="empty"><div className="big"><Package size={42} strokeWidth={1.5} style={{color:"var(--plum-soft)"}} /></div><p>Sin productos en esta vista</p></div>}
      </div>
    </>
  );
}
