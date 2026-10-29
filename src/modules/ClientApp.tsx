import React, { useState, useMemo } from 'react';
import { 
  RestaurantConfig, 
  Category, 
  MenuItem, 
  Order, 
  OrderItem, 
  ServiceCall 
} from '../types';
import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { playOrderSentSound } from '../lib/sound';
import { 
  Search, 
  Clock, 
  Plus, 
  Minus, 
  ShoppingBag, 
  BellRing, 
  Receipt, 
  CheckCircle2, 
  ChefHat, 
  Sparkles, 
  X, 
  Utensils, 
  HelpCircle,
  Copy,
  Info,
  Check
} from 'lucide-react';

interface ClientAppProps {
  tableNumber: string;
  config: RestaurantConfig | null;
  categories: Category[];
  menuItems: MenuItem[];
  orders: Order[];
  onCallWaiterSent?: () => void;
  onOrderPlaced?: () => void;
}

export const ClientApp: React.FC<ClientAppProps> = ({
  tableNumber,
  config,
  categories,
  menuItems,
  orders,
}) => {
  // Active selected category filter
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Cart / Sacola State
  const [cartItems, setCartItems] = useState<OrderItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [generalNotes, setGeneralNotes] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('');

  // Customization Modal for a selected dish
  const [customizingItem, setCustomizingItem] = useState<MenuItem | null>(null);
  const [customQuantity, setCustomQuantity] = useState<number>(1);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);

  // Modals for Calling Waiter / Requesting Bill
  const [showCallWaiterModal, setShowCallWaiterModal] = useState<boolean>(false);
  const [callReason, setCallReason] = useState<string>('Preciso de atendimento na mesa');
  const [showBillModal, setShowBillModal] = useState<boolean>(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('Cartão de Crédito');
  const [copiedPix, setCopiedPix] = useState<boolean>(false);

  // Success Notification banner
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active view tab: 'menu' or 'status'
  const [activeTab, setActiveTab] = useState<'menu' | 'status'>('menu');

  // Filtered orders for this specific table
  const tableOrders = useMemo(() => {
    return orders
      .filter((o) => o.tableNumber === tableNumber && o.status !== 'paid' && o.status !== 'cancelled')
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [orders, tableNumber]);

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchCat = selectedCategory === 'all' || item.categoryId === selectedCategory;
      const matchQuery =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery && item.available;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  // Cart Totals
  const cartSubtotal = useMemo(() => {
    return cartItems.reduce((acc, curr) => acc + curr.price * curr.quantity, 0);
  }, [cartItems]);

  const cartCount = useMemo(() => {
    return cartItems.reduce((acc, curr) => acc + curr.quantity, 0);
  }, [cartItems]);

  // Open item customization
  const handleOpenCustomization = (item: MenuItem) => {
    setCustomizingItem(item);
    setCustomQuantity(1);
    setCustomNotes('');
    setSelectedOptions([]);
  };

  const handleAddToCart = () => {
    if (!customizingItem) return;

    // Calculate options additional price
    let additionalPrice = 0;
    if (customizingItem.options) {
      customizingItem.options.forEach((opt) => {
        if (selectedOptions.includes(opt.name)) {
          additionalPrice += opt.price;
        }
      });
    }

    const newItem: OrderItem = {
      itemId: customizingItem.id,
      name: customizingItem.name,
      price: customizingItem.price + additionalPrice,
      quantity: customQuantity,
      notes: customNotes.trim() || undefined,
      selectedOptions: selectedOptions.length > 0 ? selectedOptions : undefined,
    };

    setCartItems((prev) => [...prev, newItem]);
    setCustomizingItem(null);
    playOrderSentSound();
    showFeedback('Item adicionado à sua comanda!');
  };

  const handleRemoveCartItem = (index: number) => {
    setCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateCartQuantity = (index: number, delta: number) => {
    setCartItems((prev) =>
      prev
        .map((item, i) => {
          if (i === index) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as OrderItem[]
    );
  };

  const showFeedback = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => {
      setActionSuccessMsg(null);
    }, 4000);
  };

  // Send Order to Kitchen
  const handleSendOrder = async () => {
    if (cartItems.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const serviceTaxRate = (config?.serviceTaxPercent || 10) / 100;
      const serviceFee = cartSubtotal * serviceTaxRate;
      const totalAmount = cartSubtotal + serviceFee;

      const newOrderPayload = {
        tableNumber,
        customerName: customerName.trim() || `Mesa ${tableNumber}`,
        status: 'received',
        items: JSON.stringify(cartItems),
        subtotal: Number(cartSubtotal.toFixed(2)),
        serviceFee: Number(serviceFee.toFixed(2)),
        totalAmount: Number(totalAmount.toFixed(2)),
        generalNotes: generalNotes.trim() || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'orders'), newOrderPayload);

      // Update table status to occupied
      try {
        await updateDoc(doc(db, 'tables', `mesa_${tableNumber}`), {
          status: 'occupied',
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        // Table doc might not use mesa_XX prefix, try direct or fallback
      }

      playOrderSentSound();
      setCartItems([]);
      setGeneralNotes('');
      setIsCartOpen(false);
      setActiveTab('status');
      showFeedback('Pedido enviado com sucesso para a cozinha!');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'orders');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Call Waiter Request
  const handleSendCallWaiter = async () => {
    try {
      setIsSubmitting(true);
      await addDoc(collection(db, 'service_calls'), {
        tableNumber,
        type: 'call_waiter',
        reason: callReason,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      // Update table status to calling_waiter
      try {
        await updateDoc(doc(db, 'tables', `mesa_${tableNumber}`), {
          status: 'calling_waiter',
          callReason: callReason,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {}

      setShowCallWaiterModal(false);
      showFeedback('Garçom chamado! A equipe foi notificada.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'service_calls');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Request Bill
  const handleSendBillRequest = async () => {
    try {
      setIsSubmitting(true);
      await addDoc(collection(db, 'service_calls'), {
        tableNumber,
        type: 'bill_requested',
        paymentMethod: selectedPaymentMethod,
        reason: `Fechamento de Conta (${selectedPaymentMethod})`,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });

      // Update table status to bill_requested
      try {
        await updateDoc(doc(db, 'tables', `mesa_${tableNumber}`), {
          status: 'bill_requested',
          paymentMethod: selectedPaymentMethod,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {}

      setShowBillModal(false);
      showFeedback('Conta solicitada! O garçom trará a máquina/comprovante.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'service_calls');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPixKey = () => {
    if (!config?.pixKey) return;
    navigator.clipboard.writeText(config.pixKey);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 2500);
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 pb-28">
      {/* Top Banner with Restaurant Info & Table Pill */}
      <div className="bg-stone-900 border-b border-stone-800">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {config?.logoUrl && (
                <img
                  src={config.logoUrl}
                  alt={config.name}
                  className="w-12 h-12 rounded-xl object-cover ring-2 ring-amber-500/30"
                />
              )}
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {config?.name || 'ComandaSmart'}
                </h1>
                <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">
                  {config?.address || 'Cardápio Digital na Mesa'}
                </p>
                <div className="flex items-center gap-2 mt-1 text-[11px] text-amber-400/90 font-medium">
                  <Clock className="w-3 h-3" />
                  <span>{config?.businessHours || 'Aberto agora'}</span>
                </div>
              </div>
            </div>

            {/* Mesa Highlight Badge */}
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 text-right">
              <span className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider block">
                Você está na
              </span>
              <span className="text-xl font-black text-amber-400 leading-none">
                MESA {tableNumber}
              </span>
            </div>
          </div>

          {/* Quick Action Buttons for Dining Room Service */}
          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-stone-800/80">
            <button
              onClick={() => setShowCallWaiterModal(true)}
              className="flex items-center justify-center gap-2 py-2.5 px-3 bg-stone-800 hover:bg-stone-750 text-stone-200 hover:text-white rounded-xl border border-stone-700 text-xs font-semibold transition cursor-pointer active:scale-98"
            >
              <BellRing className="w-4 h-4 text-amber-400" />
              <span>Chamar Garçom</span>
            </button>
            <button
              onClick={() => setShowBillModal(true)}
              className="flex items-center justify-center gap-2 py-2.5 px-3 bg-stone-800 hover:bg-stone-750 text-stone-200 hover:text-white rounded-xl border border-stone-700 text-xs font-semibold transition cursor-pointer active:scale-98"
            >
              <Receipt className="w-4 h-4 text-emerald-400" />
              <span>Pedir a Conta</span>
            </button>
          </div>

          {/* Navigation Sub-Tabs: Cardápio vs Acompanhar Pedidos */}
          <div className="flex gap-2 mt-4 border-b border-stone-800">
            <button
              onClick={() => setActiveTab('menu')}
              className={`flex-1 py-2 text-xs font-bold border-b-2 transition cursor-pointer ${
                activeTab === 'menu'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              Cardápio Completo
            </button>
            <button
              onClick={() => setActiveTab('status')}
              className={`flex-1 py-2 text-xs font-bold border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'status'
                  ? 'border-amber-500 text-amber-400'
                  : 'border-transparent text-stone-400 hover:text-stone-200'
              }`}
            >
              <span>Acompanhar Meus Pedidos</span>
              {tableOrders.length > 0 && (
                <span className="w-5 h-5 rounded-full bg-amber-500 text-stone-950 font-bold text-[10px] flex items-center justify-center">
                  {tableOrders.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        {/* Success Banner */}
        {actionSuccessMsg && (
          <div className="mb-4 p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center gap-2.5 animate-fadeIn">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-medium">{actionSuccessMsg}</span>
          </div>
        )}

        {activeTab === 'menu' ? (
          <>
            {/* Search Input */}
            <div className="relative mb-4">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por prato, carne, bebida, ingrediente..."
                className="w-full bg-stone-900 border border-stone-800 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Category Tabs / Pills */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none mb-6">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/10'
                    : 'bg-stone-900 text-stone-400 hover:text-white border border-stone-800'
                }`}
              >
                Todos os Pratos
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    selectedCategory === cat.id
                      ? 'bg-amber-500 text-stone-950 shadow-md shadow-amber-500/10'
                      : 'bg-stone-900 text-stone-400 hover:text-white border border-stone-800'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Food Items List */}
            {filteredItems.length === 0 ? (
              <div className="text-center py-12 bg-stone-900/50 rounded-2xl border border-stone-800/80">
                <Utensils className="w-8 h-8 text-stone-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-stone-400">Nenhum prato encontrado</p>
                <p className="text-xs text-stone-600 mt-1">Tente buscar por outro termo ou categoria.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className="bg-stone-900/90 hover:bg-stone-850 border border-stone-800 rounded-2xl p-3 sm:p-4 flex gap-3 transition group"
                  >
                    {/* Dish Photo */}
                    <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-stone-950">
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                        loading="lazy"
                      />
                      {item.featured && (
                        <div className="absolute top-1 left-1 bg-amber-500 text-stone-950 p-1 rounded-md text-[9px] font-black uppercase flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>

                    {/* Dish Info */}
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <h3 className="font-bold text-sm sm:text-base text-stone-100 group-hover:text-amber-400 transition leading-snug">
                            {item.name}
                          </h3>
                        </div>
                        <p className="text-xs text-stone-400 line-clamp-2 mt-1 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-stone-800/60">
                        <div>
                          <span className="text-xs text-stone-400">R$ </span>
                          <span className="text-base sm:text-lg font-bold text-amber-400">
                            {item.price.toFixed(2).replace('.', ',')}
                          </span>
                        </div>

                        <button
                          onClick={() => handleOpenCustomization(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl transition shadow-sm cursor-pointer active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Adicionar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          /* Tab: Acompanhar Pedidos da Mesa */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-stone-200 flex items-center gap-2">
                <ChefHat className="w-5 h-5 text-amber-400" />
                <span>Status da Comanda — Mesa {tableNumber}</span>
              </h2>
              <span className="text-xs text-stone-400">Atualização em tempo real</span>
            </div>

            {tableOrders.length === 0 ? (
              <div className="text-center py-12 bg-stone-900/50 rounded-2xl border border-stone-800">
                <Utensils className="w-10 h-10 text-stone-600 mx-auto mb-2" />
                <p className="text-sm font-semibold text-stone-400">Nenhum pedido enviado ainda</p>
                <p className="text-xs text-stone-500 mt-1 max-w-xs mx-auto">
                  Escolha os itens no cardápio e toque em "Enviar Pedido para a Cozinha".
                </p>
                <button
                  onClick={() => setActiveTab('menu')}
                  className="mt-4 px-4 py-2 bg-amber-500 text-stone-950 text-xs font-bold rounded-xl"
                >
                  Ver Cardápio
                </button>
              </div>
            ) : (
              tableOrders.map((order) => {
                let parsedItems: OrderItem[] = [];
                try {
                  parsedItems = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
                } catch (e) {
                  parsedItems = [];
                }

                // Determine progress step index
                const steps: { key: Order['status']; label: string; desc: string }[] = [
                  { key: 'received', label: 'Recebido', desc: 'Na fila da cozinha' },
                  { key: 'preparing', label: 'Em Preparo', desc: 'Sendo preparado pelo chef' },
                  { key: 'ready', label: 'Pronto!', desc: 'A caminho da sua mesa' },
                  { key: 'delivered', label: 'Entregue', desc: 'Bom apetite!' },
                ];

                const currentStepIdx = steps.findIndex((s) => s.key === order.status);

                return (
                  <div
                    key={order.id}
                    className="bg-stone-900 border border-stone-800 rounded-2xl p-4 shadow-lg space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-stone-800 pb-3">
                      <div>
                        <span className="text-xs text-stone-400">Pedido #{order.id.slice(-6)}</span>
                        <p className="text-[11px] text-stone-500">
                          {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                          order.status === 'received'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : order.status === 'preparing'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                            : order.status === 'ready'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-stone-800 text-stone-300'
                        }`}
                      >
                        {order.status === 'received' && 'Na Fila da Cozinha'}
                        {order.status === 'preparing' && 'Em Preparo no Fogão'}
                        {order.status === 'ready' && 'Pronto para Entrega!'}
                        {order.status === 'delivered' && 'Entregue à Mesa'}
                      </span>
                    </div>

                    {/* Stepper Progress Bar */}
                    <div className="grid grid-cols-4 gap-1.5 pt-1">
                      {steps.map((st, idx) => {
                        const isDone = currentStepIdx >= idx;
                        const isCurrent = currentStepIdx === idx;
                        return (
                          <div key={st.key} className="text-center">
                            <div
                              className={`h-1.5 rounded-full mb-1.5 transition-all ${
                                isCurrent
                                  ? 'bg-amber-400 animate-pulse'
                                  : isDone
                                  ? 'bg-emerald-500'
                                  : 'bg-stone-800'
                              }`}
                            />
                            <p
                              className={`text-[10px] font-bold ${
                                isCurrent ? 'text-amber-400' : isDone ? 'text-stone-300' : 'text-stone-600'
                              }`}
                            >
                              {st.label}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Order Line Items */}
                    <div className="bg-stone-950/60 rounded-xl p-3 divide-y divide-stone-850">
                      {parsedItems.map((itm, i) => (
                        <div key={i} className="py-2 first:pt-0 last:pb-0 flex items-start justify-between text-xs">
                          <div>
                            <span className="font-bold text-stone-200">
                              {itm.quantity}x {itm.name}
                            </span>
                            {itm.selectedOptions && itm.selectedOptions.length > 0 && (
                              <p className="text-[11px] text-amber-400/90 mt-0.5">
                                + {itm.selectedOptions.join(', ')}
                              </p>
                            )}
                            {itm.notes && (
                              <p className="text-[11px] text-stone-400 italic mt-0.5">
                                Obs: {itm.notes}
                              </p>
                            )}
                          </div>
                          <span className="text-stone-300 font-mono font-medium">
                            R$ {(itm.price * itm.quantity).toFixed(2).replace('.', ',')}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Subtotal & Total */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-stone-800">
                      <span className="text-stone-400">Total com taxa de serviço ({config?.serviceTaxPercent || 10}%):</span>
                      <span className="text-sm font-bold text-amber-400 font-mono">
                        R$ {order.totalAmount.toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Floating Bottom Cart Bar */}
      {cartCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 p-4 bg-gradient-to-t from-stone-950 via-stone-950/90 to-transparent">
          <div className="max-w-md mx-auto">
            <button
              onClick={() => setIsCartOpen(true)}
              className="w-full py-3.5 px-5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold rounded-2xl shadow-xl flex items-center justify-between transition cursor-pointer active:scale-98"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-stone-950 text-amber-400 flex items-center justify-center font-black text-xs">
                  {cartCount}
                </div>
                <span className="text-sm font-bold">Ver Comanda / Sacola</span>
              </div>
              <div className="text-right">
                <span className="text-sm font-black font-mono">
                  R$ {cartSubtotal.toFixed(2).replace('.', ',')}
                </span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Dish Customization Modal */}
      {customizingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">{customizingItem.name}</h3>
                <p className="text-xs text-stone-400 mt-1">{customizingItem.description}</p>
              </div>
              <button
                onClick={() => setCustomizingItem(null)}
                className="p-1 rounded-full text-stone-400 hover:text-white hover:bg-stone-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Custom Options / Add-ons if any */}
            {customizingItem.options && customizingItem.options.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-stone-800">
                <label className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
                  Opções / Ponto / Adicionais
                </label>
                <div className="space-y-1.5">
                  {customizingItem.options.map((opt) => {
                    const isChecked = selectedOptions.includes(opt.name);
                    return (
                      <label
                        key={opt.name}
                        onClick={() => {
                          setSelectedOptions((prev) =>
                            isChecked ? prev.filter((o) => o !== opt.name) : [...prev, opt.name]
                          );
                        }}
                        className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                          isChecked
                            ? 'bg-amber-500/10 border-amber-500/50 text-stone-100 font-semibold'
                            : 'bg-stone-950/40 border-stone-800 text-stone-300 hover:border-stone-700'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center ${
                              isChecked ? 'bg-amber-500 border-amber-500 text-stone-950' : 'border-stone-600'
                            }`}
                          >
                            {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <span>{opt.name}</span>
                        </div>
                        {opt.price > 0 && (
                          <span className="font-mono text-amber-400">+ R$ {opt.price.toFixed(2).replace('.', ',')}</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Observações do prato (ex: sem cebola) */}
            <div className="space-y-2 pt-2 border-t border-stone-800">
              <label className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                <span>Observações para a cozinha</span>
                <span className="text-[10px] text-stone-500 font-normal">(ex: sem cebola, ponto da carne)</span>
              </label>
              <textarea
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="Ex: Por favor sem cebola e molho à parte..."
                rows={2}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-3 text-xs text-stone-200 placeholder-stone-600 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Quantity Selector & Add Button */}
            <div className="flex items-center justify-between pt-4 border-t border-stone-800 gap-3">
              <div className="flex items-center bg-stone-950 border border-stone-800 rounded-xl p-1">
                <button
                  onClick={() => setCustomQuantity((q) => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded-lg bg-stone-900 hover:bg-stone-800 flex items-center justify-center text-stone-200 transition"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-10 text-center font-bold text-sm text-stone-100">{customQuantity}</span>
                <button
                  onClick={() => setCustomQuantity((q) => q + 1)}
                  className="w-8 h-8 rounded-lg bg-stone-900 hover:bg-stone-800 flex items-center justify-center text-stone-200 transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <button
                onClick={handleAddToCart}
                className="flex-1 py-3 px-4 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-sm rounded-xl transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Adicionar à Comanda</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart / Comanda Drawer Modal */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col p-5 sm:p-6">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-white">Comanda — Mesa {tableNumber}</h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                className="p-1 rounded-full text-stone-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Line items list */}
            <div className="flex-1 overflow-y-auto py-3 space-y-3">
              {cartItems.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-stone-950/70 border border-stone-850 rounded-xl p-3 flex items-start justify-between gap-3"
                >
                  <div className="flex-1">
                    <h4 className="font-bold text-xs sm:text-sm text-stone-200">{item.name}</h4>
                    {item.selectedOptions && (
                      <p className="text-[11px] text-amber-400/90 mt-0.5">
                        + {item.selectedOptions.join(', ')}
                      </p>
                    )}
                    {item.notes && (
                      <p className="text-[11px] text-stone-400 italic mt-0.5">
                        Obs: {item.notes}
                      </p>
                    )}
                    <span className="text-xs text-amber-400 font-mono font-bold mt-1 block">
                      R$ {(item.price * item.quantity).toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-stone-900 border border-stone-800 rounded-lg p-0.5">
                      <button
                        onClick={() => handleUpdateCartQuantity(idx, -1)}
                        className="w-6 h-6 rounded bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-xs text-stone-300"
                      >
                        -
                      </button>
                      <span className="w-6 text-center text-xs font-bold text-stone-200">{item.quantity}</span>
                      <button
                        onClick={() => handleUpdateCartQuantity(idx, 1)}
                        className="w-6 h-6 rounded bg-stone-800 hover:bg-stone-700 flex items-center justify-center text-xs text-stone-300"
                      >
                        +
                      </button>
                    </div>

                    <button
                      onClick={() => handleRemoveCartItem(idx)}
                      className="text-stone-500 hover:text-red-400 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}

              {/* Customer Name and General Notes */}
              <div className="pt-2 space-y-2 border-t border-stone-850">
                <div>
                  <label className="text-[11px] font-semibold text-stone-400 block mb-1">
                    Seu Nome (opcional)
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ex: João Silva"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-stone-400 block mb-1">
                    Instruções gerais para o pedido
                  </label>
                  <input
                    type="text"
                    value={generalNotes}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                    placeholder="Ex: Trazer bebidas primeiro..."
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* Cart Footer */}
            <div className="pt-3 border-t border-stone-800 space-y-3">
              <div className="flex justify-between text-xs text-stone-400">
                <span>Subtotal dos itens:</span>
                <span className="font-mono text-stone-200">
                  R$ {cartSubtotal.toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div className="flex justify-between text-xs text-stone-400">
                <span>Taxa de serviço ({config?.serviceTaxPercent || 10}%):</span>
                <span className="font-mono text-stone-200">
                  R$ {((cartSubtotal * (config?.serviceTaxPercent || 10)) / 100).toFixed(2).replace('.', ',')}
                </span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white border-t border-stone-800/80 pt-2">
                <span>Total Estimado:</span>
                <span className="text-amber-400 font-mono text-base">
                  R$ {(cartSubtotal * (1 + (config?.serviceTaxPercent || 10) / 100)).toFixed(2).replace('.', ',')}
                </span>
              </div>

              <button
                disabled={isSubmitting}
                onClick={handleSendOrder}
                className="w-full py-3.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-stone-950 font-bold text-sm rounded-xl transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
              >
                <ChefHat className="w-5 h-5" />
                <span>{isSubmitting ? 'Enviando...' : 'Enviar Pedido para a Cozinha'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Waiter Modal */}
      {showCallWaiterModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base text-white">Chamar Garçom</h3>
              </div>
              <button onClick={() => setShowCallWaiterModal(false)} className="text-stone-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-400">
              Selecione o motivo para agilizar o atendimento na Mesa {tableNumber}:
            </p>

            <div className="space-y-1.5">
              {[
                'Preciso de atendimento na mesa',
                'Preciso de talheres / guardanapo',
                'Dúvida sobre o cardápio / prato',
                'Pedir bebidas adicionais',
                'Outro assunto',
              ].map((r) => (
                <button
                  key={r}
                  onClick={() => setCallReason(r)}
                  className={`w-full text-left p-2.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                    callReason === r
                      ? 'bg-amber-500/15 border-amber-500 text-amber-300'
                      : 'bg-stone-950 border-stone-800 text-stone-300 hover:border-stone-700'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowCallWaiterModal(false)}
                className="flex-1 py-2.5 bg-stone-800 text-stone-300 hover:bg-stone-750 text-xs font-semibold rounded-xl"
              >
                Cancelar
              </button>
              <button
                disabled={isSubmitting}
                onClick={handleSendCallWaiter}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 text-xs font-bold rounded-xl"
              >
                Chamar Agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Bill Modal */}
      {showBillModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-sm rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">Fechar a Conta — Mesa {tableNumber}</h3>
              </div>
              <button onClick={() => setShowBillModal(false)} className="text-stone-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-stone-400">
              Escolha a forma de pagamento pretendida para o garçom levar até sua mesa:
            </p>

            <div className="grid grid-cols-2 gap-2">
              {['Cartão de Crédito', 'Cartão de Débito', 'PIX', 'Dinheiro'].map((method) => (
                <button
                  key={method}
                  onClick={() => setSelectedPaymentMethod(method)}
                  className={`p-3 rounded-xl border text-xs font-bold transition text-center cursor-pointer ${
                    selectedPaymentMethod === method
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-stone-950 border-stone-800 text-stone-400 hover:border-stone-700'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>

            {selectedPaymentMethod === 'PIX' && config?.pixKey && (
              <div className="bg-stone-950 border border-emerald-500/30 rounded-xl p-3 space-y-2">
                <span className="text-[11px] text-stone-400 font-semibold block">Chave PIX do Estabelecimento:</span>
                <div className="flex items-center justify-between bg-stone-900 p-2 rounded-lg border border-stone-800">
                  <span className="text-xs text-stone-200 font-mono truncate mr-2">{config.pixKey}</span>
                  <button
                    onClick={copyPixKey}
                    className="p-1 text-emerald-400 hover:text-emerald-300 shrink-0 flex items-center gap-1 text-[11px] font-bold"
                  >
                    {copiedPix ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPix ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowBillModal(false)}
                className="flex-1 py-2.5 bg-stone-800 text-stone-300 hover:bg-stone-750 text-xs font-semibold rounded-xl"
              >
                Voltar
              </button>
              <button
                disabled={isSubmitting}
                onClick={handleSendBillRequest}
                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-stone-950 text-xs font-bold rounded-xl"
              >
                Solicitar Conta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
