import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money, METHODS, fdt } from '../utils/format';

export default function Sales() {
  const { fail, toast, isAdmin } = useApp();
  const [sales, setSales] = useState([]);

  const load = () => api('/sales').then(setSales).catch(fail);
  useEffect(() => { load(); }, []);

  const voidSale = async (s) => {
    if (!confirm(`¿Anular comprobante Nº ${s.number}? Se devolverá el stock.`)) return;
    try {
      await api(`/sales/${s.id}/void`, { method: 'POST' });
      toast('Venta anulada');
      load();
    } catch (e) { fail(e); }
  };

  return (
    <div className="card">
      <table className="table">
        <thead>
          <tr>
            <th>Nº</th>
            <th>Fecha</th>
            <th>Vendedor</th>
            <th>Método</th>
            <th>Total</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sales.map(s => (
            <tr key={s.id} className={s.status === 'anulada' ? 'muted' : ''}>
              <td><b>{String(s.number).padStart(5, '0')}</b></td>
              <td>{fdt(s.created_at)}</td>
              <td>{s.seller}</td>
              <td>{METHODS[s.method]?.[1] || s.method}</td>
              <td>{money(s.total)}</td>
              <td>{s.status === 'anulada' ? <span className="badge red">Anulada</span> : <span className="badge ok">OK</span>}</td>
              <td>
                {s.status === 'ok' && isAdmin() && (
                  <button className="btn sm danger" onClick={() => voidSale(s)}>Anular</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!sales.length && <div className="empty"><div className="big">🧾</div><p>Sin comprobantes aún</p></div>}
    </div>
  );
}
