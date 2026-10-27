import { useEffect, useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money } from '../utils/format';
import { Lock } from '../utils/icons';
import JsBarcode from 'jsbarcode';

const SIZES = {
  '30x20': {
    id: '30x20',
    label: '30 × 20 mm (esmaltes / chicos)',
    w: 30, h: 20,
    nameMax: 18, showPrice: false, showName: true,
    bc: { width: 1.1, height: 28, fontSize: 8, margin: 1 },
  },
  '50x30': {
    id: '50x30',
    label: '50 × 30 mm (shampoo / medianos)',
    w: 50, h: 30,
    nameMax: 28, showPrice: true, showName: true,
    bc: { width: 1.4, height: 40, fontSize: 10, margin: 2 },
  },
};

function codeValue(p) {
  const factory = (p.barcode || '').trim();
  if (factory) return factory;
  return (p.sku || '').trim();
}

function shortName(name, max) {
  const n = (name || '').trim();
  if (n.length <= max) return n;
  return n.slice(0, max - 1) + '…';
}

/** Genera el SVG del código de barras en memoria (sin ventana nueva). */
function barcodeSvg(code, bc) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, code, {
      format: 'CODE128',
      width: bc.width,
      height: bc.height,
      displayValue: true,
      fontSize: bc.fontSize,
      margin: bc.margin,
      textMargin: 1,
      fontOptions: 'bold',
      background: '#ffffff',
      lineColor: '#000000',
    });
  } catch {
    svg.innerHTML = '';
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', '0');
    t.setAttribute('y', '14');
    t.textContent = code;
    svg.appendChild(t);
  }
  return svg.outerHTML;
}

export default function Labels() {
  const { fail, isAdmin, toast } = useApp();
  const [products, setProducts] = useState([]);
  const [qtyById, setQtyById] = useState({});
  const [sizeId, setSizeId] = useState('50x30');
  const [q, setQ] = useState('');
  const iframeRef = useRef(null);
  const size = SIZES[sizeId];

  useEffect(() => {
    api('/products?all=1').then(setProducts).catch(fail);
  }, [fail]);

  if (!isAdmin()) {
    return (
      <div className="empty">
        <div className="big"><Lock size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div>
        <p>Solo el admin puede imprimir etiquetas</p>
      </div>
    );
  }

  const setQty = (id, n) => {
    const v = Math.max(0, Math.min(9999, Number(n) || 0));
    setQtyById(prev => {
      const next = { ...prev };
      if (v <= 0) delete next[id];
      else next[id] = v;
      return next;
    });
  };

  const totalLabels = Object.values(qtyById).reduce((a, b) => a + b, 0);
  const selectedCount = Object.keys(qtyById).length;

  const filtered = products.filter(p => {
    if (!p.active) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(s) ||
      (p.sku || '').toLowerCase().includes(s) ||
      (p.barcode || '').toLowerCase().includes(s)
    );
  });

  const useStockFor = p => setQty(p.id, Math.max(1, Number(p.stock) || 1));
  const useStockAllFiltered = () => {
    const next = { ...qtyById };
    filtered.forEach(p => {
      next[p.id] = Math.max(1, Number(p.stock) || 1);
    });
    setQtyById(next);
    toast?.(`Cantidades = stock de ${filtered.length} producto(s)`);
  };

  const print = () => {
    if (!totalLabels) return toast?.('Indica cuántas etiquetas de cada producto', 'err');
    if (totalLabels > 2000 && !confirm(`Vas a imprimir ${totalLabels} etiquetas. ¿Continuar?`)) return;

    const items = [];
    Object.entries(qtyById).forEach(([id, qty]) => {
      const p = products.find(x => String(x.id) === String(id));
      if (!p || qty < 1) return;
      for (let i = 0; i < qty; i++) items.push(p);
    });
    if (!items.length) return;

    // Códigos ya dibujados aquí (no depende de CDN ni de ventana emergente)
    const labelsHtml = items.map(p => {
      const code = codeValue(p);
      const svg = barcodeSvg(code, size.bc);
      return `
        <div class="label">
          ${size.showName ? `<div class="name">${shortName(p.name, size.nameMax).replace(/</g, '')}</div>` : ''}
          ${svg}
          ${size.showPrice ? `<div class="price">${money(p.price)}</div>` : ''}
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<title>Etiquetas ${size.w}×${size.h} mm (${items.length})</title>
<style>
  @page { size: ${size.w}mm ${size.h}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: ${size.w}mm; background: #fff; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .label {
    width: ${size.w}mm; height: ${size.h}mm;
    page-break-after: always; break-after: page;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 0.8mm 1mm; overflow: hidden;
  }
  .name { font-size: ${sizeId === '30x20' ? '5.5pt' : '7.5pt'}; font-weight: 700; max-width: 100%;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .price { font-size: ${sizeId === '30x20' ? '5pt' : '7pt'}; font-weight: 700; }
  svg { max-width: 100%; height: auto; display: block; }
</style></head><body>${labelsHtml}</body></html>`;

    // Impresión por iframe oculto → NO abre about:blank ni pide permisos de emergentes
    let iframe = iframeRef.current;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);
      iframeRef.current = iframe;
    }

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    // Esperar a que el navegador pinte el SVG
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        toast?.(`${items.length} etiqueta(s) enviadas a imprimir`);
      } catch (e) {
        toast?.('No se pudo abrir el diálogo de impresión. Revisa la impresora.', 'err');
      }
    }, 350);
  };

  return (
    <>
      <div className="card mb">
        <h3 style={{ marginTop: 0 }}>Etiquetas / códigos de barras</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          En cada producto indica <b>cuántas etiquetas</b> (ej. 100). O usa <b>Usar stock</b>.
          La impresión ya <b>no abre ventana en blanco</b>: usa el diálogo de imprimir del navegador.
        </p>
        <div className="gap" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          {Object.values(SIZES).map(s => (
            <button key={s.id} type="button" className={`chip ${sizeId === s.id ? 'on' : ''}`} onClick={() => setSizeId(s.id)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="gap" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, minWidth: 200 }}>
            <label>Buscar producto</label>
            <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre o SKU…" />
          </div>
          <button type="button" className="btn" onClick={useStockAllFiltered}>Usar stock (filtrados)</button>
          <button type="button" className="btn" onClick={() => setQtyById({})} disabled={!selectedCount}>Limpiar cantidades</button>
          <button type="button" className="btn primary" disabled={!totalLabels} onClick={print}>
            Imprimir {totalLabels || 0} etiqueta(s)
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          En el diálogo de impresión: impresora de etiquetas (o PDF), márgenes <b>ninguno</b>, escala <b>100%</b>.
        </p>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              <th>Stock</th>
              <th>Etiquetas a imprimir</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id}>
                <td><code>{p.sku}</code></td>
                <td>
                  <b>{p.name}</b>
                  {p.barcode && <div className="muted small">{p.barcode}</div>}
                </td>
                <td>{p.stock}</td>
                <td style={{ width: 140 }}>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={9999}
                    value={qtyById[p.id] ?? ''}
                    placeholder="0"
                    onChange={e => setQty(p.id, e.target.value)}
                  />
                </td>
                <td>
                  <button type="button" className="btn sm" onClick={() => useStockFor(p)}>
                    Usar stock ({p.stock})
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <p className="muted">No hay productos</p>}
      </div>
    </>
  );
}
