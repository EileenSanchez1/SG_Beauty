export const money = n => {
  n = Math.round(Number(n || 0));
  return (n < 0 ? '-' : '') + '$' + Math.abs(n).toLocaleString('es-CO');
};

export const fdate = s =>
  s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

export const ftime = s =>
  s ? new Date(s).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';

export const fdt = s => (s ? `${fdate(s)} ${ftime(s)}` : '');

export const today = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export const num = v => parseInt(String(v).replace(/[^\d-]/g, '')) || 0;

export const METHODS = {
  efectivo: ['💵', 'Efectivo'],
  nequi: ['💜', 'Nequi'],
  daviplata: ['🔴', 'Daviplata'],
  tarjeta: ['💳', 'Tarjeta'],
  qr: ['📱', 'QR'],
  addi: ['➕', 'Addi'],
  sistecredito: ['🏦', 'Sistecrédito'],
};

/** Métodos con recargo 8% sobre el neto (después de descuentos). */
export const FINANCE_METHODS = ['addi', 'sistecredito'];
export const FINANCE_RATE = 0.08;


export const KINDS = {
  cadena: ['cadena', 'Cadena diaria'],
  ahorro: ['ahorro', 'Ahorro del jefe'],
  aseo: ['aseo', 'Aseo / tinto'],
  gasto: ['gasto', 'Gasto'],
  otro: ['otro', 'Otro'],
};

export const MOVE_KINDS = {
  entrada: 'Entrada',
  venta: 'Venta',
  ajuste: 'Ajuste',
  anulacion: 'Anulación',
  devolucion: 'Devolución',
};

export const NAV = [
  ['dashboard', 'dashboard', 'Inicio', true],
  ['pos', 'pos', 'Punto de venta', false],
  ['sep', 'Inventario'],
  ['products', 'products', 'Productos', true],
  ['categories', 'categories', 'Categorías', true],
  ['inventory', 'inventory', 'Inventario y pedidos', false],
  ['movements', 'movements', 'Movimientos stock', true],
  ['suppliers', 'suppliers', 'Proveedores', true],
  ['labels', 'labels', 'Etiquetas', true],
  ['sep', 'Dinero'],
  ['cash', 'cash', 'Caja chica y gastos', false],
  ['close', 'close', 'Cierre de caja', false],
  ['sales', 'sales', 'Comprobantes', false],
  ['reports', 'reports', 'Reportes', true],
  ['sep', 'Sistema', true],
  ['audit', 'audit', 'Auditoría', true],
  ['users', 'users', 'Usuarios y roles', true],
  ['settings', 'settings', 'Configuración', true],
];

export const TITLES = {
  dashboard: 'Inicio',
  pos: 'Punto de venta',
  products: 'Productos',
  categories: 'Categorías',
  inventory: 'Inventario y pedidos',
  movements: 'Movimientos de inventario',
  suppliers: 'Proveedores',
  labels: 'Etiquetas',
  cash: 'Caja chica y gastos',
  close: 'Cierre de caja',
  sales: 'Comprobantes',
  reports: 'Reportes',
  audit: 'Auditoría',
  users: 'Usuarios y roles',
  settings: 'Configuración',
};
