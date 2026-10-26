import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { fdt, today, addDays, MOVE_KINDS } from '../utils/format';
import { History, Lock } from '../utils/icons';

export default function Movements() {
  const { fail, isAdmin } = useApp();
  const [from, setFrom] = useState(addDays(today(), -30));
  const [to, setTo] = useState(today());
  const [kind, setKind] = useState('');
  const [rows, setRows] = useState([]);

  const load = () => {
    const q = new URLSearchParams({ date_from: from, date_to: to, limit: '200' });
    if (kind) q.set('kind', kind);
    api(`/inventory/movements?${q}`).then(setRows).catch(fail);
  };
  useEffect(() => { if (isAdmin()) load(); }, [from, to, kind]);

  if (!isAdmin()) {
    return <div className="empty"><div className="big"><Lock size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div><p>Solo el admin ve movimientos</p></div>;
  }

  return (
    <>
      <div className="spread mb">
        <div className="gap">
          <div className="field" style={{ margin: 0 }}><label>Desde</label><input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}><label>Hasta</label><input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <div className="field" style={{ margin: 0 }}>
            <label>Tipo</label>
            <select className="input" value={kind} onChange={e => setKind(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(MOVE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <button className="btn primary" onClick={load}>Actualizar</button>
      </div>
      <div className="card">
        <table className="table">
          <thead><tr><th>Fecha</th><th>SKU</th><th>Producto</th><th>Tipo</th><th>Cant.</th><th>Stock tras</th><th>Usuario</th><th>Nota</th></tr></thead>
          <tbody>
            {rows.map(m => (
              <tr key={m.id}>
                <td>{fdt(m.created_at)}</td>
                <td><code>{m.sku}</code></td>
                <td>{m.name}</td>
                <td>{MOVE_KINDS[m.kind] || m.kind}</td>
                <td style={{ color: m.qty < 0 ? 'var(--danger)' : 'inherit' }}>{m.qty > 0 ? `+${m.qty}` : m.qty}</td>
                <td>{m.stock_after}</td>
                <td>{m.user}</td>
                <td className="muted">{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="empty"><div className="big"><History size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div><p>Sin movimientos en el periodo</p></div>}
      </div>
    </>
  );
}
