import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { api, getToken } from '../utils/api';
import { money, METHODS, fdt, today } from '../utils/format';
import { FileText, FileDown, MessageCircle, Eye } from '../utils/icons';
import Modal from '../components/Modal';

function buildWhatsAppText(sale, businessName = 'Distribuidora de Belleza') {
  const lines = [
    `*${businessName}*`,
    `Comprobante Nº ${String(sale.number).padStart(5, '0')}`,
    `Fecha: ${fdt(sale.created_at)}`,
    '',
  ];
  (sale.items || []).forEach(i => {
    lines.push(`• ${i.name} x${i.qty} = ${money(i.line_total ?? i.qty * i.unit_price)}`);
  });
  lines.push('');
  if (sale.discount) lines.push(`Descuento: -${money(sale.discount)}${sale.discount_reason ? ` (${sale.discount_reason})` : ''}`);
  if (sale.finance_fee) lines.push(`Recargo ${METHODS[sale.method]?.[1] || sale.method} 8%: +${money(sale.finance_fee)}`);
  lines.push(`*TOTAL: ${money(sale.total)}*`);
  lines.push(`Pago: ${METHODS[sale.method]?.[1] || sale.method}`);
  lines.push('');
  lines.push('_Documento interno · Gracias por tu compra 💖_');
  return lines.join('\n');
}

function openWhatsApp(phone, text) {
  let p = String(phone || '').replace(/\D/g, '');
  if (!p) return false;
  if (p.length === 10) p = '57' + p;
  window.open(`https://wa.me/${p}?text=${encodeURIComponent(text)}`, '_blank');
  return true;
}

export default function Sales() {
  const { fail, toast, isAdmin, settings } = useApp();
  const [sales, setSales] = useState([]);
  const [summary, setSummary] = useState(null);
  const [detail, setDetail] = useState(null);
  const [waFilter, setWaFilter] = useState('all');
  const [day, setDay] = useState(today());
  const [dayTo, setDayTo] = useState(today());
  const [method, setMethod] = useState('');

  const load = () => {
    const q = new URLSearchParams();
    if (isAdmin()) {
      q.set('date_from', day);
      q.set('date_to', dayTo || day);
    }
    if (method) q.set('method', method);
    const qs = q.toString() ? `?${q}` : '';
    api('/sales' + qs)
      .then(data => {
        // compat: array antiguo o { sales, summary }
        if (Array.isArray(data)) {
          setSales(data);
          setSummary(null);
        } else {
          setSales(data.sales || []);
          setSummary(data.summary || null);
        }
      })
      .catch(fail);
  };

  useEffect(() => { load(); }, [day, dayTo, method]);

  const visible = sales.filter(s => {
    if (waFilter === 'sent') return !!s.whatsapp_sent_at;
    if (waFilter === 'not_sent') return !s.whatsapp_sent_at && s.status === 'ok';
    return true;
  });

  const voidSale = async (s) => {
    if (!confirm(`¿Anular comprobante Nº ${s.number}? Se devolverá el stock.`)) return;
    try {
      await api(`/sales/${s.id}/void`, { method: 'POST' });
      toast('Venta anulada');
      load();
      if (detail?.id === s.id) setDetail(null);
    } catch (e) { fail(e); }
  };

  const returnSale = async (s) => {
    if (!confirm(`¿Registrar devolución del comprobante Nº ${s.number}? Se reingresa el stock.`)) return;
    try {
      await api(`/sales/${s.id}/return`, { method: 'POST' });
      toast('Devolución registrada');
      load();
      if (detail?.id === s.id) setDetail(null);
    } catch (e) { fail(e); }
  };

  const openDetail = async (s) => {
    try {
      const full = await api(`/sales/${s.id}`);
      setDetail(full);
    } catch (e) { fail(e); }
  };

  const downloadReceiptPdf = async (s) => {
    try {
      const token = getToken();
      const res = await fetch(`/api/sales/${s.id}/receipt.pdf`, {
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      });
      if (!res.ok) throw new Error('No se pudo generar el PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `comprobante-${s.number}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { fail(e); }
  };

  const sendWhatsApp = async (s) => {
    const phone = s.customer_phone || prompt('Celular del cliente (WhatsApp)');
    if (!phone) return;
    const text = buildWhatsAppText(s, settings?.business_name || 'SG Beauty');
    if (!openWhatsApp(phone, text)) return toast('Celular inválido', 'err');
    try {
      const updated = await api(`/sales/${s.id}/whatsapp-sent`, { method: 'POST', body: { phone } });
      toast('Marcado como enviado por WhatsApp');
      setSales(list => list.map(x => x.id === s.id ? { ...x, ...updated } : x));
      if (detail?.id === s.id) setDetail(updated);
    } catch (e) { fail(e); }
  };

  return (
    <>
      <div className="card mb">
        <h3 style={{ marginTop: 0 }}>Ventas (como el cuaderno del día)</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          Cada venta en el POS descuenta stock sola. Aquí ves el registro por día y forma de pago.
          {isAdmin() ? ' Como admin puedes consultar cualquier fecha.' : ' Como vendedora ves tus ventas de hoy.'}
        </p>
        <div className="gap" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {isAdmin() && (
            <>
              <div className="field" style={{ margin: 0 }}>
                <label>Desde</label>
                <input className="input" type="date" value={day} onChange={e => setDay(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <label>Hasta</label>
                <input className="input" type="date" value={dayTo} onChange={e => setDayTo(e.target.value)} />
              </div>
            </>
          )}
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label>Método de pago</label>
            <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(METHODS).map(([k, [, name]]) => (
                <option key={k} value={k}>{name}</option>
              ))}
            </select>
          </div>
          <button type="button" className={`chip ${waFilter === 'all' ? 'on' : ''}`} onClick={() => setWaFilter('all')}>Todos</button>
          <button type="button" className={`chip ${waFilter === 'sent' ? 'on' : ''}`} onClick={() => setWaFilter('sent')}>Enviados WA</button>
          <button type="button" className={`chip ${waFilter === 'not_sent' ? 'on' : ''}`} onClick={() => setWaFilter('not_sent')}>Sin enviar</button>
        </div>

        {summary && (
          <div className="grid g4" style={{ marginTop: 14 }}>
            <div className="stat">
              <div className="lbl">Ventas OK</div>
              <div className="val">{summary.count}</div>
            </div>
            <div className="stat">
              <div className="lbl">Total del periodo</div>
              <div className="val">{money(summary.total)}</div>
            </div>
            {Object.entries(summary.by_method || {}).filter(([, v]) => v > 0).map(([k, v]) => (
              <div className="stat" key={k}>
                <div className="lbl">{METHODS[k]?.[1] || k}</div>
                <div className="val" style={{ fontSize: 20 }}>{money(v)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Fecha</th>
              {isAdmin() && <th>Vendedora</th>}
              <th>Pago</th>
              <th>Total</th>
              <th>Estado</th>
              <th>WA</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(s => (
              <tr key={s.id}>
                <td><code>{String(s.number).padStart(5, '0')}</code></td>
                <td>{fdt(s.created_at)}</td>
                {isAdmin() && <td>{s.user || '—'}</td>}
                <td>{METHODS[s.method]?.[1] || s.method}</td>
                <td><b>{money(s.total)}</b></td>
                <td>
                  {s.status === 'ok' && <span className="badge ok">OK</span>}
                  {s.status === 'anulada' && <span className="badge red">Anulada</span>}
                  {s.status === 'devuelta' && <span className="badge">Devuelta</span>}
                </td>
                <td>{s.whatsapp_sent_at ? <span className="badge ok">Enviado</span> : <span className="badge">—</span>}</td>
                <td>
                  <div className="gap">
                    <button className="btn sm" onClick={() => openDetail(s)}><Eye size={14} /></button>
                    {s.status === 'ok' && isAdmin() && (
                      <>
                        <button className="btn sm ghost" onClick={() => voidSale(s)}>Anular</button>
                        <button className="btn sm ghost" onClick={() => returnSale(s)}>Devolver</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <div className="empty">
            <div className="big"><FileText size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div>
            <p>No hay ventas en este filtro</p>
          </div>
        )}
      </div>

      {detail && (
        <Modal title={`Comprobante Nº ${String(detail.number).padStart(5, '0')}`} onClose={() => setDetail(null)} wide>
          <p className="muted">{fdt(detail.created_at)} · {METHODS[detail.method]?.[1] || detail.method}</p>
          <table className="table">
            <thead>
              <tr><th>Producto</th><th>Cant.</th><th>Precio</th><th>Subtotal</th></tr>
            </thead>
            <tbody>
              {(detail.items || []).map((i, idx) => (
                <tr key={idx}>
                  <td>{i.name}</td>
                  <td>{i.qty}</td>
                  <td>{money(i.unit_price)}</td>
                  <td>{money(i.line_total ?? i.qty * i.unit_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="spread mt">
            <div>
              {detail.discount > 0 && <p>Descuento: -{money(detail.discount)}</p>}
              <p><b>Total: {money(detail.total)}</b></p>
            </div>
            <div className="gap">
              <button className="btn" onClick={() => downloadReceiptPdf(detail)}><FileDown size={14} style={{ marginRight: 4 }} /> PDF</button>
              {detail.status === 'ok' && (
                <button className="btn primary" onClick={() => sendWhatsApp(detail)}><MessageCircle size={14} style={{ marginRight: 4 }} /> WhatsApp</button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
