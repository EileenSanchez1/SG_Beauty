import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, getToken } from '../utils/api';
import { money, today, addDays, METHODS, KINDS } from '../utils/format';
import { Heart, Lock, FileDown } from '../utils/icons';

export default function Reports() {
  const { fail, isAdmin, toast } = useApp();
  const [from, setFrom] = useState(addDays(today(), -7));
  const [to, setTo] = useState(today());
  const [data, setData] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const load = () => {
    setData(null);
    api(`/reports/period?from=${from}&to=${to}`).then(setData).catch(fail);
  };
  useEffect(() => { if (isAdmin()) load(); }, [from, to]);


  const downloadExcel = async () => {
    try {
      const token = getToken();
      const res = await fetch(`/api/export/sales.xlsx?date_from=${from}&date_to=${to}`, {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      if (!res.ok) throw new Error('No se pudo generar el Excel');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ventas_${from}_${to}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Excel descargado');
    } catch (e) { fail(e); }
  };

  const downloadPdf = async () => {
    setLoadingPdf(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/reports/pdf?from=${from}&to=${to}`, {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'No se pudo generar el PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte_${from}_${to}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast('PDF descargado');
    } catch (e) {
      fail(e);
    } finally {
      setLoadingPdf(false);
    }
  };

  if (!isAdmin()) {
    return (
      <div className="empty">
        <div className="big"><Lock size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div>
        <p>Solo el admin puede ver reportes</p>
      </div>
    );
  }

  const count = data?.count ?? data?.n_sales ?? 0;
  const top = data?.top || [];
  const byMethod = data?.by_method || {};
  const byCat = data?.by_category || [];
  const expByKind = data?.expenses_by_kind || {};

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
        <div className="gap">
          <button className="btn" onClick={load}>Actualizar</button>
          <button className="btn" onClick={downloadExcel} disabled={!data}>Excel</button>
          <button className="btn primary" onClick={downloadPdf} disabled={!data || loadingPdf}>
            <FileDown size={16} strokeWidth={2} style={{ marginRight: 6 }} />
            {loadingPdf ? 'Generando…' : 'Descargar PDF'}
          </button>
        </div>
      </div>

      {!data ? (
        <div className="empty">
          <div className="big"><Heart size={42} strokeWidth={1.5} style={{ color: 'var(--rose-400)' }} /></div>
          <p>Cargando…</p>
        </div>
      ) : (
        <>
          <div className="grid g3 mb">
            <div className="card stat hot">
              <div className="lbl">Ventas del periodo</div>
              <div className="val">{money(data.total)}</div>
              <div className="sub">{count} comprobantes</div>
            </div>
            <div className="card stat">
              <div className="lbl">Descuentos</div>
              <div className="val">{money(data.discounts)}</div>
            </div>
            <div className="card stat">
              <div className="lbl">Ticket promedio</div>
              <div className="val">{money(count ? data.total / count : 0)}</div>
            </div>
          </div>

          <div className="grid g3 mb">
            <div className="card stat">
              <div className="lbl">Ganancia estimada</div>
              <div className="val">{money(data.profit)}</div>
              <div className="sub">Margen {data.margin ?? 0}%</div>
            </div>
            <div className="card stat">
              <div className="lbl">Gastos / salidas</div>
              <div className="val">{money(data.expenses)}</div>
            </div>
            <div className="card stat">
              <div className="lbl">Neto (ventas − gastos)</div>
              <div className="val">{money((data.total || 0) - (data.expenses || 0))}</div>
            </div>
          </div>

          <div className="card mb">
            <h3>Por método de pago</h3>
            <div className="grid g4">
              {Object.entries(METHODS).map(([k, [, name]]) => (
                <div key={k} className="stat">
                  <div className="lbl">{name}</div>
                  <div className="val" style={{ fontSize: 18 }}>{money(byMethod[k] || 0)}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card mb">
            <h3>Productos más vendidos</h3>
            {top.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Unidades</th>
                    <th>Total</th>
                    <th>Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {top.map((p, i) => (
                    <tr key={i}>
                      <td><code>{p.sku}</code></td>
                      <td>{p.name}</td>
                      <td>{p.qty}</td>
                      <td>{money(p.total ?? p.sales)}</td>
                      <td>{money(p.profit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">Sin datos en este periodo</p>
            )}
          </div>

          {byCat.length > 0 && (
            <div className="card mb">
              <h3>Ventas por categoría</h3>
              <table className="table">
                <thead><tr><th>Categoría</th><th>Total</th></tr></thead>
                <tbody>
                  {byCat.map((c, i) => (
                    <tr key={i}>
                      <td>{c.name}</td>
                      <td>{money(c.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {Object.keys(expByKind).length > 0 && (
            <div className="card">
              <h3>Salidas de caja (cadenas, ahorros, gastos)</h3>
              <table className="table">
                <thead><tr><th>Tipo</th><th>Monto</th></tr></thead>
                <tbody>
                  {Object.entries(expByKind).map(([k, v]) => (
                    <tr key={k}>
                      <td>{KINDS[k]?.[1] || k}</td>
                      <td>{money(v)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
