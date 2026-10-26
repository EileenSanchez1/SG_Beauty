import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money, today, addDays } from '../utils/format';

export default function Reports() {
  const { fail, isAdmin } = useApp();
  const [from, setFrom] = useState(addDays(today(), -7));
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);

  const load = () => {
    api(`/reports/period?from=${from}&to=${to}`).then(setData).catch(fail);
  };
  useEffect(() => { if (isAdmin()) load(); }, [from, to]);

  if (!isAdmin()) {
    return <div className="empty"><div className="big">🔒</div><p>Solo la administradora puede ver reportes</p></div>;
  }

  return (
    <>
      <div className="spread mb">
        <div className="gap">
          <div className="field" style={{ margin: 0 }}>
            <label>Desde</label>
            <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Hasta</label>
            <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
        </div>
        <button className="btn primary" onClick={load}>Actualizar</button>
      </div>
      {!data ? (
        <div className="empty"><div className="big">💗</div><p>Cargando…</p></div>
      ) : (
        <>
          <div className="grid g3 mb">
            <div className="card stat hot">
              <div className="lbl">Ventas del periodo</div>
              <div className="val">{money(data.total)}</div>
              <div className="sub">{data.count} ventas</div>
            </div>
            <div className="card stat">
              <div className="lbl">Descuentos</div>
              <div className="val">{money(data.discounts)}</div>
            </div>
            <div className="card stat">
              <div className="lbl">Ticket promedio</div>
              <div className="val">{money(data.count ? data.total / data.count : 0)}</div>
            </div>
          </div>
          <div className="card">
            <h3>Productos más vendidos</h3>
            {data.top?.length ? (
              <table className="table">
                <thead><tr><th>Producto</th><th>Unidades</th><th>Total</th></tr></thead>
                <tbody>
                  {data.top.map((p, i) => (
                    <tr key={i}>
                      <td>{p.name}</td>
                      <td>{p.qty}</td>
                      <td>{money(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">Sin datos en este periodo</p>
            )}
          </div>
        </>
      )}
    </>
  );
}
