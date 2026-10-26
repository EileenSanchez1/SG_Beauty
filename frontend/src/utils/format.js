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
  efectivo: ['efectivo', 'Efectivo'],
  nequi: ['nequi', 'Nequi'],
  daviplata: ['daviplata', 'Daviplata'],
  tarjeta: ['tarjeta', 'Tarjeta'],
};

export const KINDS = {
  cadena: ['cadena', 'Cadena diaria'],
  ahorro: ['ahorro', 'Ahorro del jefe'],
  aseo: ['aseo', 'Aseo / tinto'],
  gasto: ['gasto', 'Gasto'],
  otro: ['otro', 'Otro'],
};

export const NAV = [
  ['dashboard', 'dashboard', 'Inicio', true],
  ['pos', 'pos', 'Punto de venta', false],
  ['sep', 'Inventario'],
  ['products', 'products', 'Productos', true],
  ['inventory', 'inventory', 'Inventario y pedidos', false],
  ['labels', 'labels', 'Etiquetas', true],
  ['sep', 'Dinero'],
  ['cash', 'cash', 'Caja chica y gastos', true],
  ['close', 'close', 'Cierre de caja', true],
  ['sales', 'sales', 'Comprobantes', false],
  ['reports', 'reports', 'Reportes', true],
  ['sep', 'Sistema', true],
  ['users', 'users', 'Usuarios y roles', true],
  ['settings', 'settings', 'Configuración', true],
];

export const TITLES = {
  dashboard: 'Inicio',
  pos: 'Punto de venta',
  products: 'Productos',
  inventory: 'Inventario y pedidos',
  labels: 'Etiquetas',
  cash: 'Caja chica y gastos',
  close: 'Cierre de caja',
  sales: 'Comprobantes',
  reports: 'Reportes',
  users: 'Usuarios y roles',
  settings: 'Configuración',
};
