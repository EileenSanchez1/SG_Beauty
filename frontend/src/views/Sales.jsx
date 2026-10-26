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
  if (sale.discount) lines.push(`Descuento: -${money(sale.discount)}`);
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
  const [detail, setDetail] = useState(null);
  const [filter, setFilter] = useState('all'); // all | sent | not_sent

  const load = () => api('/sales').then(setSales).catch(fail);
  useEffect(() => { load(); }, []);

  const visible = sales.filter(s => {
    if (filter === 'sent') return !!s.whatsapp_sent_at;
    if (filter === 'not_sent') return !s.whatsapp_sent_at && s.status === 'ok';
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
      a.download = `comprobante_${String(s.number).padStart(5, '0')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Comprobante PDF descargado');
    } catch (e) { fail(e); }
  };

  const sendWhatsApp = async (s) => {
    const biz = settings?.business_name || 'Distribuidora de Belleza';
    const text = buildWhatsAppText(s, biz);
    let phone = s.customer_phone;
    if (!phone) phone = prompt('Número de WhatsApp del cliente (ej. 3001234567):') || '';
    if (!phone) return;
    openWhatsApp(phone, text);
    try {
      const updated = await api(`/sales/${s.id}/whatsapp-sent`, { method: 'POST', body: { phone } });
      toast('Marcado como enviado por WhatsApp');
      setSales(list => list.map(x => x.id === s.id ? { ...x, ...updated } : x));
      if (detail?.id === s.id) setDetail(updated);
    } catch (e) { fail(e); }
  };

  const statusBadge = (st) => {
    if (st === 'anulada') return <span className="badge red">Anulada</span>;
    if (st === 'devuelta') return <span className="badge">Devuelta</span>;
    return <span className="badge ok">OK</span>;
  };

  return (
    <>
      <div className="spread mb">
        <div className="gap">
          <button className={`chip ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>Todos</button>
          <button className={`chip ${filter === 'sent' ? 'on' : ''}`} onClick={() => setFilter('sent')}>Enviados WA</button>
          <button className={`chip ${filter === 'not_sent' ? 'on' : ''}`} onClick={() => setFilter('not_sent')}>Sin enviar</button>
        </div>
        <p className="muted" style={{ fontSize: 12 }}>Usa el WhatsApp Business del local en este equipo para control centralizado.</p>
      </div>
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
              <th>WhatsApp</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(s => (
              <tr key={s.id} className={s.status !== 'ok' ? 'muted' : ''}>
                <td><b>{String(s.number).padStart(5, '0')}</b></td>
                <td>{fdt(s.created_at)}</td>
                <td>{s.seller}</td>
                <td>{METHODS[s.method]?.[1] || s.method}</td>
                <td>{money(s.total)}</td>
                <td>{statusBadge(s.status)}</td>
                <td>
                  {s.whatsapp_sent_at
                    ? <span className="badge ok" title={fdt(s.whatsapp_sent_at)}>Enviado</span>
                    : <span className="muted">—</span>}
                </td>
                <td>
                  <div className="gap" style={{ flexWrap: 'wrap' }}>
                    <button className="btn sm" title="Ver" onClick={() => openDetail(s)}><Eye size={14} /></button>
                    <button className="btn sm" title="PDF" onClick={() => downloadReceiptPdf(s)}><FileDown size={14} /></button>
                    {s.status === 'ok' && (
                      <button className="btn sm" title="WhatsApp" onClick={() => sendWhatsApp(s)}><MessageCircle size={14} /></button>
                    )}
                    {s.status === 'ok' && isAdmin() && (
                      <>
                        <button className="btn sm" onClick={() => returnSale(s)}>Devolver</button>
                        <button className="btn sm danger" onClick={() => voidSale(s)}>Anular</button>
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
            <p>Sin comprobantes</p>
          </div>
        )}
      </div>

      {detail && (
        <Modal title={`Comprobante Nº ${String(detail.number).padStart(5, '0')}`} onClose={() => setDetail(null)} wide>
          <p className="muted">{fdt(detail.created_at)} · {detail.seller || '—'}</p>
          {detail.customer_name && <p>Cliente: <b>{detail.customer_name}</b>{detail.customer_phone ? ` · ${detail.customer_phone}` : ''}</p>}
          {detail.whatsapp_sent_at && <p className="ok">WhatsApp enviado: {fdt(detail.whatsapp_sent_at)} → {detail.whatsapp_phone}</p>}
          <table className="table">
            <thead><tr><th>Producto</th><th>Cant</th><th>P. unit</th><th>Total</th></tr></thead>
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
              <p><b>Total: {money(detail.total)}</b> · {METHODS[detail.method]?.[1] || detail.method}</p>
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
