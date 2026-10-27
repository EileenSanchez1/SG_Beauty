import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money, METHODS, fdt } from '../utils/format';
import { Calculator, Heart } from '../utils/icons';
import Modal from '../components/Modal';

const KINDS = [
  ['cadena', 'Cadena / gasto operativo'],
  ['propina', 'Propina (se sacó)'],
  ['aseo', 'Aseo / bombillo / local'],
  ['proveedor', 'Pago a proveedor'],
  ['gasto', 'Otro gasto'],
  ['otro', 'Otro'],
];

export default function Close() {
  const { cash, refreshCash, toast, fail } = useApp();
  const [summary, setSummary] = useState(null);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [nextBase, setNextBase] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [moveForm, setMoveForm] = useState({ kind: 'aseo', amount: '', concept: '' });
  const [history, setHistory] = useState([]);
  const [viewDetail, setViewDetail] = useState(null);

  const loadCurrent = () => api('/cash/current').then(setSummary).catch(fail);
  const loadHistory = () => api('/cash/sessions?limit=40').then(setHistory).catch(() => setHistory([]));

  useEffect(() => {
    loadCurrent();
    loadHistory();
  }, [cash]);

  if (cash && !summary) {
    return (
      <div className="empty">
        <div className="big"><Heart size={42} strokeWidth={1.5} style={{ color: 'var(--rose-400)' }} /></div>
        <p>Cargando cierre de caja…</p>
      </div>
    );
  }

  const expected = summary?.efectivo_esperado ?? 0;
  const base = summary?.base ?? 0;
  const cashSales = summary?.by_method?.efectivo ?? 0;
  const gastos = summary?.gastos ?? 0;
  const countedN = counted === '' ? null : Number(counted) || 0;
  const diff = countedN == null ? null : countedN - expected;
  const nextBaseN = nextBase === '' ? null : Number(nextBase) || 0;

  const addMove = async () => {
    if (!Number(moveForm.amount)) return toast('Indica el monto', 'err');
    try {
      await api('/cash/movements', {
        method: 'POST',
        body: {
          kind: moveForm.kind,
          amount: Number(moveForm.amount),
          concept: moveForm.concept || '',
        },
      });
      toast('Gasto registrado (como en el cuaderno)');
      setShowMove(false);
      setMoveForm({ kind: 'aseo', amount: '', concept: '' });
      await refreshCash();
      loadCurrent();
    } catch (e) { fail(e); }
  };

  const doClose = async () => {
    try {
      const noteParts = [];
      if (nextBaseN != null) noteParts.push(`Base para mañana: ${money(nextBaseN)}`);
      if (notes.trim()) noteParts.push(notes.trim());
      await api('/cash/close', {
        method: 'POST',
        body: {
          counted_cash: countedN ?? 0,
          notes: noteParts.join(' · '),
        },
      });
      toast('Caja cerrada · registro guardado');
      await refreshCash();
      setShowConfirm(false);
      setCounted('');
      setNotes('');
      setNextBase('');
      loadHistory();
      loadCurrent();
    } catch (e) { fail(e); }
  };

  const openDetail = async (id) => {
    try {
      setViewDetail(await api(`/cash/sessions/${id}`));
    } catch (e) { fail(e); }
  };

  return (
    <>
      <div className="spread mb">
        {cash && (
          <button type="button" className="btn" onClick={() => setShowMove(true)}>
            + Registrar gasto / cadena
          </button>
        )}
      </div>

      {!cash || !summary ? (
        <div className="card mb">
          <div className="empty" style={{ padding: 24 }}>
            <div className="big"><Calculator size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div>
            <p>No hay caja abierta. Ve a <b>Caja chica y gastos</b> y ábrela con la base del día.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid g3 mb">
            <div className="card stat">
              <div className="lbl">Ventas de esta caja</div>
              <div className="val">{money(summary.ventas_total)}</div>
              <div className="sub">{summary.n_sales} comprobantes · {fdt(summary.opened_at)}</div>
            </div>
            <div className="card stat">
              <div className="lbl">Gastos / salidas</div>
              <div className="val">{money(gastos)}</div>
              <div className="sub">Aseo, cadena, propina…</div>
            </div>
            <div className="card stat hot">
              <div className="lbl">Efectivo que debería haber</div>
              <div className="val">{money(expected)}</div>
              <div className="sub">Solo billetes/monedas</div>
            </div>
          </div>

          <div className="card mb">
            <h3 style={{ marginTop: 0 }}>Cómo se calcula el efectivo esperado</h3>
            <table className="table">
              <tbody>
                <tr><td>Base con la que abrieron</td><td><b>{money(base)}</b></td></tr>
                <tr><td>+ Ventas en efectivo</td><td><b>{money(cashSales)}</b></td></tr>
                <tr><td>− Gastos / salidas registradas</td><td><b>{money(gastos)}</b></td></tr>
                <tr><td><b>Efectivo esperado en caja</b></td><td><b>{money(expected)}</b></td></tr>
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 13 }}>
              Las ventas por <b>Nequi / Daviplata / Tarjeta</b> no entran al efectivo físico
              (hoy digital: {money(summary.digital || 0)}). Si no registraste un gasto (trapero, bombillo, cadena),
              el sistema no lo resta: usa <b>+ Registrar gasto / cadena</b>.
            </p>
          </div>

          <div className="card mb">
            <h3>Por método de pago</h3>
            <div className="grid g4">
              {Object.entries(METHODS).map(([k, [, name]]) => (
                <div key={k} className="stat">
                  <div className="lbl">{name}</div>
                  <div className="val" style={{ fontSize: 20 }}>{money(summary.by_method?.[k] || 0)}</div>
                </div>
              ))}
            </div>
          </div>

          {!!summary.movements?.length && (
            <div className="card mb">
              <h3>Gastos del día (cuaderno)</h3>
              <table className="table">
                <thead>
                  <tr><th>Tipo</th><th>Monto</th><th>Nota</th><th>Hora</th></tr>
                </thead>
                <tbody>
                  {summary.movements.map(m => (
                    <tr key={m.id}>
                      <td>{m.kind}</td>
                      <td>{money(m.amount)}</td>
                      <td>{m.concept || '—'}</td>
                      <td>{fdt(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card mb">
            <h3>Arqueo al cerrar</h3>
            <div className="grid g2">
              <div className="field">
                <label>Efectivo contado ahora</label>
                <input className="input" type="number" value={counted} onChange={e => setCounted(e.target.value)} placeholder={String(expected)} />
              </div>
              <div className="field">
                <label>Base que dejas para mañana</label>
                <input className="input" type="number" value={nextBase} onChange={e => setNextBase(e.target.value)} placeholder="Ej. 80000" />
              </div>
            </div>
            <div className="field">
              <label>Notas (entrega de cuentas)</label>
              <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ej. entregué a… / faltó…" />
            </div>

            {countedN != null && (
              <div className="card" style={{ background: 'var(--rose-50)', marginTop: 8 }}>
                <p style={{ margin: 0 }}>
                  Contaste <b>{money(countedN)}</b>. El sistema esperaba <b>{money(expected)}</b>.
                  {diff === 0 && ' ✓ Cuadra perfecto.'}
                  {diff > 0 && ` Sobra ${money(diff)} (revisa si metiste algo de más o no registraste una venta en efectivo).`}
                  {diff < 0 && ` Falta ${money(Math.abs(diff))} (revisa si sacaste algo sin registrar gasto).`}
                </p>
                {nextBaseN != null && (
                  <p style={{ margin: '8px 0 0' }}>
                    <b>Base sugerida para mañana:</b> {money(nextBaseN)}.
                    Al abrir la caja el próximo día, usa esa misma cifra como base inicial.
                  </p>
                )}
                {nextBaseN == null && countedN != null && (
                  <p className="muted" style={{ margin: '8px 0 0', fontSize: 13 }}>
                    Tip: si dejas todo el efectivo contado, la base de mañana suele ser {money(countedN)}.
                  </p>
                )}
              </div>
            )}

            <button className="btn primary big mt" onClick={() => setShowConfirm(true)} disabled={counted === ''}>
              Cerrar caja del día
            </button>
          </div>
        </>
      )}

      <div className="card">
        <h3>Historial de cajas (otros días)</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Estado</th><th>Apertura</th><th>Cierre</th><th>Ventas</th>
              <th>Esperado</th><th>Contado</th><th>Dif.</th><th></th>
            </tr>
          </thead>
          <tbody>
            {(history || []).map(s => (
              <tr key={s.id}>
                <td>{s.status === 'abierta' ? <span className="badge ok">Abierta</span> : <span className="badge">Cerrada</span>}</td>
                <td>{fdt(s.opened_at)}</td>
                <td>{s.closed_at ? fdt(s.closed_at) : '—'}</td>
                <td>{money(s.ventas_total)}</td>
                <td>{money(s.efectivo_esperado)}</td>
                <td>{s.counted_cash != null ? money(s.counted_cash) : '—'}</td>
                <td>{s.diferencia != null ? money(s.diferencia) : '—'}</td>
                <td><button type="button" className="btn sm" onClick={() => openDetail(s.id)}>Ver</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!history?.length && <p className="muted">Sin historial aún</p>}
      </div>

      {showMove && (
        <Modal title="Registrar gasto (cuaderno)" onClose={() => setShowMove(false)}>
          <p className="muted">Bombillo, aseo, cadena, trapero, propina… todo lo que sale de la caja.</p>
          <div className="field">
            <label>Tipo</label>
            <select className="input" value={moveForm.kind} onChange={e => setMoveForm(f => ({ ...f, kind: e.target.value }))}>
              {KINDS.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Monto</label>
            <input className="input" type="number" value={moveForm.amount} onChange={e => setMoveForm(f => ({ ...f, amount: e.target.value }))} />
          </div>
          <div className="field">
            <label>Detalle</label>
            <input className="input" value={moveForm.concept} onChange={e => setMoveForm(f => ({ ...f, concept: e.target.value }))} placeholder="Ej. trapero, bombillo baño…" />
          </div>
          <div className="foot">
            <button className="btn" onClick={() => setShowMove(false)}>Cancelar</button>
            <button className="btn primary" onClick={addMove}>Guardar gasto</button>
          </div>
        </Modal>
      )}

      {showConfirm && (
        <Modal title="¿Cerrar la caja?" onClose={() => setShowConfirm(false)}>
          <p>Contado: <b>{money(countedN || 0)}</b> · Esperado: <b>{money(expected)}</b></p>
          {nextBaseN != null && <p>Base anotada para mañana: <b>{money(nextBaseN)}</b></p>}
          <div className="foot">
            <button className="btn" onClick={() => setShowConfirm(false)}>Cancelar</button>
            <button className="btn primary" onClick={doClose}>Confirmar cierre</button>
          </div>
        </Modal>
      )}

      {viewDetail && (
        <Modal title={`Caja #${viewDetail.id}`} onClose={() => setViewDetail(null)} wide>
          <p className="muted">{fdt(viewDetail.opened_at)} → {viewDetail.closed_at ? fdt(viewDetail.closed_at) : 'abierta'}</p>
          <p>Ventas: <b>{money(viewDetail.ventas_total)}</b> · Contado: <b>{viewDetail.counted_cash != null ? money(viewDetail.counted_cash) : '—'}</b></p>
          {viewDetail.notes && <p><b>Notas:</b> {viewDetail.notes}</p>}
          {!!viewDetail.movements?.length && (
            <table className="table">
              <thead><tr><th>Tipo</th><th>Monto</th><th>Nota</th></tr></thead>
              <tbody>
                {viewDetail.movements.map(m => (
                  <tr key={m.id}><td>{m.kind}</td><td>{money(m.amount)}</td><td>{m.concept || '—'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
    </>
  );
}
