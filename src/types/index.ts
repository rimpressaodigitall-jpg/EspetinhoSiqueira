export interface RestaurantConfig {
  id?: string;
  name: string;
  tagline: string;
  logoUrl: string;
  address: string;
  phone: string;
  pixKey: string;
  publicAppUrl?: string;
  serviceTaxPercent: number;
  estimatedKdsAlertMinutes: number;
  businessHours: string;
  wifiSsid?: string;
  wifiPassword?: string;
  adminDeletePassword?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  order: number;
  icon?: string;
  active: boolean;
  updatedAt?: string;
}

export interface MenuItemOption {
  name: string;
  price: number;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  available: boolean;
  prepTimeMinutes: number;
  featured?: boolean;
  options?: MenuItemOption[];
  updatedAt?: string;
}

export type TableStatus = 'available' | 'occupied' | 'calling_waiter' | 'bill_requested';

export interface Table {
  id: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  activeOrderId?: string;
  callReason?: string;
  paymentMethod?: string;
  updatedAt?: string;
}

export type OrderStatus = 'received' | 'preparing' | 'ready' | 'delivered' | 'paid' | 'cancelled';

export interface OrderItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  selectedOptions?: string[];
}

export interface Order {
  id: string;
  tableNumber: string;
  customerName?: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  serviceFee: number;
  totalAmount: number;
  paymentMethod?: string;
  generalNotes?: string;
  createdAt: string;
  updatedAt: string;
  readyAt?: string;
  closedAt?: string;
}

export type ServiceCallType = 'call_waiter' | 'bill_requested';
export type ServiceCallStatus = 'pending' | 'attended';

export interface ServiceCall {
  id: string;
  tableNumber: string;
  type: ServiceCallType;
  reason?: string;
  paymentMethod?: string;
  status: ServiceCallStatus;
  createdAt: string;
  attendedAt?: string;
  attendedBy?: string;
}

export type StaffRole = 'admin' | 'waiter' | 'cook';

export interface StaffMember {
  id: string;
  name: string;
  role: StaffRole;
  email?: string;
  pin?: string;
  active: boolean;
  createdAt: string;
}

export type AppViewMode = 'client' | 'kitchen' | 'waiter' | 'admin';
