import {
  Home,
  ShoppingCart,
  Package,
  Tag,
  Wallet,
  Calculator,
  Receipt,
  BarChart3,
  Users,
  Settings,
  Heart,
  Gift,
  Banknote,
  AlertTriangle,
  Droplets,
  Sparkles,
  FileText,
  ClipboardList,
  Flower2,
  Smartphone,
  CreditCard,
  Link2,
  PiggyBank,
  Coffee,
  FileSpreadsheet,
  LogOut,
  Plus,
  X,
  CheckCircle2,
  ShoppingBag,
  Box,
  Layers,
  TrendingUp,
  AlertCircle,
  Lock,
  FileDown,
  MessageCircle,
  Printer,
  Eye,
  Truck,
  History,
  Shield,
  Download,
} from 'lucide-react';

export const NavIcons = {
  dashboard: Home,
  pos: ShoppingCart,
  products: Droplets,
  inventory: Package,
  movements: History,
  suppliers: Truck,
  labels: Tag,
  cash: Wallet,
  close: Calculator,
  sales: Receipt,
  reports: BarChart3,
  audit: Shield,
  users: Users,
  settings: Settings,
};

export const MethodIcons = {
  efectivo: Banknote,
  nequi: Smartphone,
  daviplata: CreditCard,
  tarjeta: CreditCard,
};

export const KindIcons = {
  cadena: Link2,
  ahorro: PiggyBank,
  aseo: Coffee,
  gasto: FileText,
  otro: Sparkles,
};

export function NavIcon({ name, className = '', size = 18 }) {
  const Icon = NavIcons[name] || Home;
  return <Icon size={size} strokeWidth={2} className={className} />;
}

export function MethodIcon({ name, size = 16 }) {
  const Icon = MethodIcons[name] || Banknote;
  return <Icon size={size} strokeWidth={2} />;
}

export function KindIcon({ name, size = 16 }) {
  const Icon = KindIcons[name] || Sparkles;
  return <Icon size={size} strokeWidth={2} />;
}

export {
  Home,
  ShoppingCart,
  Package,
  Tag,
  Wallet,
  Calculator,
  Receipt,
  BarChart3,
  Users,
  Settings,
  Heart,
  Gift,
  Banknote,
  AlertTriangle,
  Droplets,
  Sparkles,
  FileText,
  ClipboardList,
  Flower2,
  Smartphone,
  CreditCard,
  Link2,
  PiggyBank,
  Coffee,
  FileSpreadsheet,
  LogOut,
  Plus,
  X,
  CheckCircle2,
  ShoppingBag,
  Box,
  Layers,
  TrendingUp,
  AlertCircle,
  Lock,
  FileDown,
  MessageCircle,
  Printer,
  Eye,
  Truck,
  History,
  Shield,
  Download,
};
