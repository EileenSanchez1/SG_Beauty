import { useEffect, useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { money } from '../utils/format';
import { Lock } from '../utils/icons';
import JsBarcode from 'jsbarcode';

/**
 * Tamaños de rollo adhesivo del local:
 * - 30×20 mm → esmaltes y productos muy pequeños
 * - 50×30 mm → shampoo, cajas medianas, etc.
 *
 * El código impreso es el que el POS lee al escanear:
 * prioriza barcode de fábrica; si no hay, usa el SKU interno (ej. 100-001).
 */
const SIZES = {
  '30x20': {
    id: '30x20',
    label: '30 × 20 mm (esmaltes / chicos)',
    w: 30,
    h: 20,
    // JsBarcode: barras más densas pero legibles en etiqueta chica
    bc: { width: 1.1, height: 28, fontSize: 8, margin: 1, displayValue: true },
    nameMax: 18,
    showPrice: false,
    showName: true,
  },
  '50x30': {
    id: '50x30',
    label: '50 × 30 mm (shampoo / medianos)',
    w: 50,
    h: 30,
    bc: { width: 1.4, height: 40, fontSize: 10, margin: 2, displayValue: true },
    nameMax: 28,
    showPrice: true,
    showName: true,
  },
};

function codeValue(p) {
  // Lo que el escáner debe devolver y el POS busca en /products/code/{code}
  const factory = (p.barcode || '').trim();
  if (factory) return factory;
  return (p.sku || '').trim();
}

function shortName(name, max) {
  const n = (name || '').trim();
  if (n.length <= max) return n;
  return n.slice(0, max - 1) + '…';
}

export default function Labels() {
  const { fail, isAdmin, toast } = useApp();
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [sizeId, setSizeId] = useState('50x30');
  const [copies, setCopies] = useState(1);
  const [q, setQ] = useState('');
  const printRef = useRef(null);
  const size = SIZES[sizeId];

  useEffect(() => {
    api('/products?all=1').then(setProducts).catch(fail);
  }, [fail]);

  // Redibujar códigos al cambiar selección o tamaño
  useEffect(() => {
    if (!printRef.current) return;
    const nodes = printRef.current.querySelectorAll('svg[data-code]');
    nodes.forEach(el => {
      const code = el.getAttribute('data-code');
      if (!code) return;
      try {
        // Limpiar svg antes de volver a dibujar
        while (el.firstChild) el.removeChild(el.firstChild);
        JsBarcode(el, code, {
          format: 'CODE128',
          width: size.bc.width,
          height: size.bc.height,
          displayValue: size.bc.displayValue,
          fontSize: size.bc.fontSize,
          margin: size.bc.margin,
          textMargin: 1,
          fontOptions: 'bold',
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch (e) {
        console.warn('Barcode error', code, e);
      }
    });
  }, [selected, products, sizeId, copies]);

  if (!isAdmin()) {
    return (
      <div className="empty">
        <div className="big"><Lock size={42} strokeWidth={1.5} style={{ color: 'var(--plum-soft)' }} /></div>
        <p>Solo el admin puede imprimir etiquetas</p>
      </div>
    );
  }

  const toggle = id => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const next = new Set(selected);
    filtered.forEach(p => next.add(p.id));
    setSelected(next);
  };

  const clearSel = () => setSelected(new Set());

  const filtered = products.filter(p => {
    if (!p.active) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(s) ||
      (p.sku || '').toLowerCase().includes(s) ||
      (p.barcode || '').toLowerCase().includes(s) ||
      (p.category || '').toLowerCase().includes(s)
    );
  });

  const print = () => {
    if (!selected.size) return;
    const html = printRef.current?.innerHTML || '';
    if (!html.trim()) {
      toast?.('No hay etiquetas para imprimir', 'err');
      return;
    }
    const w = window.open('', '_blank', 'noopener,noreferrer');
    if (!w) {
      toast?.('Permite ventanas emergentes para imprimir', 'err');
      return;
    }
    // CSS en mm: el navegador respeta mejor con @page y tamaño fijo del label
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Etiquetas ${size.w}×${size.h} mm</title>
<style>
  @page { size: ${size.w}mm ${size.h}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${size.w}mm;
    margin: 0;
    padding: 0;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .sheet { width: ${size.w}mm; }
  .label {
    width: ${size.w}mm;
    height: ${size.h}mm;
    page-break-after: always;
    break-after: page;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 0.8mm 1mm;
    background: #fff;
    color: #000;
  }
  .label .name {
    font-size: ${sizeId === '30x20' ? '5.5pt' : '7.5pt'};
    font-weight: 700;
    line-height: 1.1;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .label .price {
    font-size: ${sizeId === '30x20' ? '5pt' : '7pt'};
    font-weight: 700;
  }
  .label svg {
    max-width: 100%;
    height: auto;
    display: block;
  }
  .label .hint {
    font-size: 4.5pt;
    color: #333;
  }
  @media print {
    .label { page-break-after: always; }
  }
</style></head><body><div class="sheet">${html}</div>
<script>
  window.onload = function() {
    setTimeout(function(){ window.print(); }, 250);
  };
</script>
</body></html>`);
    w.document.close();
  };

  // Lista de etiquetas a renderizar (producto × copias)
  const labelItems = [];
  [...selected].forEach(id => {
    const p = products.find(x => x.id === id);
    if (!p) return;
    const n = Math.max(1, Math.min(50, Number(copies) || 1));
    for (let i = 0; i < n; i++) labelItems.push({ p, key: `${id}-${i}` });
  });

  return (
    <>
      <div className="card mb">
        <h3 style={{ marginTop: 0 }}>Tamaño de etiqueta (rollos del local)</h3>
        <div className="gap" style={{ flexWrap: 'wrap', marginBottom: 12 }}>
          {Object.values(SIZES).map(s => (
            <button
              key={s.id}
              type="button"
              className={`chip ${sizeId === s.id ? 'on' : ''}`}
              onClick={() => setSizeId(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="gap" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ margin: 0, minWidth: 200 }}>
            <label>Buscar producto</label>
            <input className="input" value={q} onChange={e => setQ(e.target.value)} placeholder="Nombre, SKU o código…" />
          </div>
          <div className="field" style={{ margin: 0, width: 110 }}>
            <label>Copias c/u</label>
            <input className="input" type="number" min={1} max={50} value={copies} onChange={e => setCopies(e.target.value)} />
          </div>
          <button type="button" className="btn" onClick={selectAllFiltered}>Seleccionar filtrados</button>
          <button type="button" className="btn" onClick={clearSel} disabled={!selected.size}>Limpiar</button>
          <button type="button" className="btn primary" disabled={!selected.size} onClick={print}>
            Imprimir {selected.size ? selected.size * Math.max(1, Number(copies) || 1) : 0} etiqueta(s)
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
          El código de barras usa el <b>código de fábrica</b> si existe; si no, el <b>SKU</b> (ej. 100-001).
          Al escanear en el POS se busca por cualquiera de los dos. Usa el tamaño chico (30×20) en esmaltes;
          el mediano (50×30) en shampoo y cajas. En la impresora elige papel sin márgenes / tamaño personalizado si aparece la opción.
        </p>
      </div>

      <div className="card">
        <div className="catalog" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
          {filtered.map(p => (
            <button
              key={p.id}
              type="button"
              className={`pcard ${selected.has(p.id) ? 'selected' : ''}`}
              onClick={() => toggle(p.id)}
              style={selected.has(p.id) ? { outline: '2px solid var(--rose-500)' } : {}}
            >
              <div className="info">
                <b>{p.name}</b>
                <span className="muted small">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</span>
              </div>
            </button>
          ))}
        </div>
        {!filtered.length && <p className="muted">No hay productos con ese filtro</p>}
      </div>

      {/* Vista previa en pantalla (no se imprime esta zona) */}
      {!!labelItems.length && (
        <div className="card mt">
          <h3 style={{ marginTop: 0 }}>Vista previa ({size.w}×{size.h} mm)</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {labelItems.slice(0, 12).map(({ p, key }) => (
              <div
                key={`prev-${key}`}
                style={{
                  width: `${size.w * 3.2}px`,
                  height: `${size.h * 3.2}px`,
                  border: '1px dashed #ccc',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 4,
                  background: '#fff',
                  fontSize: sizeId === '30x20' ? 9 : 11,
                  textAlign: 'center',
                }}
              >
                {size.showName && <div style={{ fontWeight: 700 }}>{shortName(p.name, size.nameMax)}</div>}
                <div style={{ fontFamily: 'monospace', fontSize: 10 }}>{codeValue(p)}</div>
                {size.showPrice && <div style={{ fontWeight: 700 }}>{money(p.price)}</div>}
              </div>
            ))}
            {labelItems.length > 12 && <p className="muted">… y {labelItems.length - 12} más</p>}
          </div>
        </div>
      )}

      {/* HTML real de impresión (oculto) */}
      <div ref={printRef} style={{ position: 'absolute', left: -9999, top: 0, width: 1, height: 1, overflow: 'hidden' }} aria-hidden>
        {labelItems.map(({ p, key }) => {
          const code = codeValue(p);
          return (
            <div className="label" key={key}>
              {size.showName && <div className="name">{shortName(p.name, size.nameMax)}</div>}
              <svg data-code={code} />
              {size.showPrice && <div className="price">{money(p.price)}</div>}
            </div>
          );
        })}
      </div>
    </>
  );
}
