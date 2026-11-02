import React, { useState, useMemo, useEffect } from 'react';
import { 
  Table, 
  Order, 
  OrderItem, 
  ServiceCall, 
  MenuItem, 
  RestaurantConfig 
} from '../types';
import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { playReadyAlertSound, playServiceCallAlertSound } from '../lib/sound';
import { 
  BellRing, 
  Receipt, 
  CheckCircle2, 
  Plus, 
  Users, 
  Clock, 
  X, 
  Check, 
  Trash2, 
  DollarSign, 
  CreditCard, 
  QrCode, 
  UtensilsCrossed, 
  AlertCircle,
  Sparkles,
  Printer
} from 'lucide-react';
import { printTableBill } from '../utils/printer';

interface WaiterAppProps {
  tables: Table[];
  orders: Order[];
  serviceCalls: ServiceCall[];
  menuItems: MenuItem[];
  config: RestaurantConfig | null;
}

export const WaiterApp: React.FC<WaiterAppProps> = ({
  tables,
  orders,
  serviceCalls,
  menuItems,
  config,
}) => {
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [activeTab, setActiveTab] = useState<'tables' | 'alerts' | 'ready'>('tables');

  // Modal for Closing Bill & Clearing Table
  const [showCheckoutModal, setShowCheckoutModal] = useState<boolean>(false);
  const [checkoutPaymentMethod, setCheckoutPaymentMethod] = useState<string>('Cartão de Crédito');
  const [includeServiceTax, setIncludeServiceTax] = useState<boolean>(true);
  const [cashGiven, setCashGiven] = useState<string>('');

  // Modal for Adding Items directly by Waiter
  const [showAddItemModal, setShowAddItemModal] = useState<boolean>(false);
  const [selectedItemToAdd, setSelectedItemToAdd] = useState<MenuItem | null>(null);
  const [addItemQty, setAddItemQty] = useState<number>(1);
  const [addItemNotes, setAddItemNotes] = useState<string>('');

  // Track previous counts to trigger sound alerts when new calls/ready orders appear
  const pendingCalls = useMemo(() => {
    return serviceCalls.filter((c) => c.status === 'pending');
  }, [serviceCalls]);

  const readyOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'ready');
  }, [orders]);

  // Audio trigger on changes
  useEffect(() => {
    if (readyOrders.length > 0) {
      playReadyAlertSound();
    }
  }, [readyOrders.length]);

  useEffect(() => {
    if (pendingCalls.length > 0) {
      playServiceCallAlertSound();
    }
  }, [pendingCalls.length]);

  // Active orders for the selected table
  const selectedTableOrders = useMemo(() => {
    if (!selectedTable) return [];
    return orders.filter(
      (o) => o.tableNumber === selectedTable.tableNumber && o.status !== 'paid' && o.status !== 'cancelled'
    );
  }, [orders, selectedTable]);

  // All items consumed by selected table
  const selectedTableItems = useMemo(() => {
    const list: { item: OrderItem; orderId: string; status: Order['status'] }[] = [];
    selectedTableOrders.forEach((o) => {
      try {
        const parsed: OrderItem[] = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
        parsed.forEach((it) => list.push({ item: it, orderId: o.id, status: o.status }));
      } catch (e) {}
    });
    return list;
  }, [selectedTableOrders]);

  // Totals for selected table
  const tableSubtotal = useMemo(() => {
    return selectedTableItems.reduce((acc, curr) => acc + curr.item.price * curr.item.quantity, 0);
  }, [selectedTableItems]);

  const serviceFee = includeServiceTax ? tableSubtotal * ((config?.serviceTaxPercent || 10) / 100) : 0;
  const tableTotal = tableSubtotal + serviceFee;

  // Change calculation for cash payment
  const cashGivenNum = parseFloat(cashGiven.replace(',', '.')) || 0;
  const changeDue = cashGivenNum > tableTotal ? cashGivenNum - tableTotal : 0;

  // Print Handlers
  const handlePrintConference = () => {
    if (!selectedTable) return;
    printTableBill({
      tableNumber: selectedTable.tableNumber,
      items: selectedTableItems,
      subtotal: tableSubtotal,
      serviceFee,
      serviceTaxPercent: config?.serviceTaxPercent || 10,
      total: tableTotal,
      type: 'conference',
      config,
    });
  };

  const handlePrintReceipt = () => {
    if (!selectedTable) return;
    printTableBill({
      tableNumber: selectedTable.tableNumber,
      items: selectedTableItems,
      subtotal: tableSubtotal,
      serviceFee,
      serviceTaxPercent: config?.serviceTaxPercent || 10,
      total: tableTotal,
      paymentMethod: checkoutPaymentMethod,
      cashGiven: cashGivenNum > 0 ? cashGivenNum : undefined,
      changeDue: changeDue > 0 ? changeDue : undefined,
      type: 'receipt',
      config,
    });
  };

  // Actions
  const handleAttendCall = async (callId: string, tableNumber: string) => {
    try {
      await updateDoc(doc(db, 'service_calls', callId), {
        status: 'attended',
        attendedAt: new Date().toISOString(),
      });

      // Reset table status if was calling_waiter
      try {
        await updateDoc(doc(db, 'tables', `mesa_${tableNumber}`), {
          status: 'occupied',
          callReason: '',
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {}
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `service_calls/${callId}`);
    }
  };

  const handleDeliverReadyOrder = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'delivered',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  // Add Item to table directly by waiter
  const handleConfirmAddItem = async () => {
    if (!selectedTable || !selectedItemToAdd) return;

    try {
      const orderItem: OrderItem = {
        itemId: selectedItemToAdd.id,
        name: selectedItemToAdd.name,
        price: selectedItemToAdd.price,
        quantity: addItemQty,
        notes: addItemNotes.trim() || undefined,
      };

      const subtotal = orderItem.price * orderItem.quantity;
      const tax = subtotal * ((config?.serviceTaxPercent || 10) / 100);

      await addDoc(collection(db, 'orders'), {
        tableNumber: selectedTable.tableNumber,
        customerName: `Garçom (Mesa ${selectedTable.tableNumber})`,
        status: 'received',
        items: JSON.stringify([orderItem]),
        subtotal: Number(subtotal.toFixed(2)),
        serviceFee: Number(tax.toFixed(2)),
        totalAmount: Number((subtotal + tax).toFixed(2)),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Set table as occupied
      await updateDoc(doc(db, 'tables', selectedTable.id), {
        status: 'occupied',
        updatedAt: new Date().toISOString(),
      });

      setShowAddItemModal(false);
      setSelectedItemToAdd(null);
      setAddItemNotes('');
      setAddItemQty(1);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'orders');
    }
  };

  // Close Bill & Free Table
  const handleFinalizeBillAndClearTable = async () => {
    if (!selectedTable) return;

    try {
      // 1. Mark all active orders for this table as paid
      for (const order of selectedTableOrders) {
        await updateDoc(doc(db, 'orders', order.id), {
          status: 'paid',
          paymentMethod: checkoutPaymentMethod,
          closedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }

      // 2. Mark any pending service calls for this table as attended
      const relatedCalls = serviceCalls.filter(
        (c) => c.tableNumber === selectedTable.tableNumber && c.status === 'pending'
      );
      for (const call of relatedCalls) {
        await updateDoc(doc(db, 'service_calls', call.id), {
          status: 'attended',
          attendedAt: new Date().toISOString(),
        });
      }

      // 3. Reset table status to 'available'
      await updateDoc(doc(db, 'tables', selectedTable.id), {
        status: 'available',
        callReason: '',
        paymentMethod: '',
        activeOrderId: '',
        updatedAt: new Date().toISOString(),
      });

      setShowCheckoutModal(false);
      setSelectedTable(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tables/${selectedTable.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-3 sm:p-5 pb-24">
      {/* Top Banner Alert Bar if there are Ready Dishes or Waiter Calls */}
      {(readyOrders.length > 0 || pendingCalls.length > 0) && (
        <div className="space-y-2 mb-4 animate-fadeIn">
          {/* Ready Dishes Alert */}
          {readyOrders.map((ro) => (
            <div
              key={ro.id}
              className="bg-purple-950/80 border border-purple-500/50 p-3 sm:p-4 rounded-2xl flex items-center justify-between gap-3 shadow-lg shadow-purple-950/40"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-600 text-white flex items-center justify-center font-black animate-bounce">
                  🍽️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-bold text-purple-400">Prato Pronto na Cozinha</span>
                    <span className="text-[10px] bg-purple-900/60 px-2 py-0.5 rounded text-purple-200">
                      #{ro.id.slice(-4)}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    MESA {ro.tableNumber} — Pronto para Entrega!
                  </h3>
                </div>
              </div>

              <button
                onClick={() => handleDeliverReadyOrder(ro.id)}
                className="py-2 px-3.5 bg-purple-500 hover:bg-purple-400 text-white font-bold text-xs rounded-xl shadow-md transition cursor-pointer whitespace-nowrap active:scale-95"
              >
                Entregar à Mesa
              </button>
            </div>
          ))}

          {/* Pending Waiter Calls or Bill Requests */}
          {pendingCalls.map((call) => (
            <div
              key={call.id}
              className={`p-3 sm:p-4 rounded-2xl flex items-center justify-between gap-3 shadow-lg ${
                call.type === 'bill_requested'
                  ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-100'
                  : 'bg-amber-950/80 border border-amber-500/50 text-amber-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl font-bold ${
                    call.type === 'bill_requested' ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-stone-950'
                  }`}
                >
                  {call.type === 'bill_requested' ? '💳' : '🛎️'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-bold tracking-wider">
                      {call.type === 'bill_requested' ? 'Solicitou Conta' : 'Chamou Garçom'}
                    </span>
                    <span className="text-[10px] opacity-75">
                      {new Date(call.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white">
                    MESA {call.tableNumber}: {call.reason || (call.paymentMethod ? `Forma: ${call.paymentMethod}` : 'Atendimento')}
                  </h3>
                </div>
              </div>

              <button
                onClick={() => handleAttendCall(call.id, call.tableNumber)}
                className={`py-2 px-3.5 font-bold text-xs rounded-xl shadow-md transition cursor-pointer whitespace-nowrap active:scale-95 ${
                  call.type === 'bill_requested'
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-stone-950'
                    : 'bg-amber-500 hover:bg-amber-400 text-stone-950'
                }`}
              >
                Atender Chamado
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Header */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-white flex items-center gap-2">
            <span>Terminal Garçom & Salão</span>
            <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">
              Smart POS
            </span>
          </h1>
          <p className="text-xs text-stone-400">
            Mapa de mesas em tempo real, pedidos prontos e fechamento de conta
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-[11px] font-medium flex-wrap">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Livre
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Ocupada
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Chamando
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span> Prato Pronto
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400"></span> Pede Conta
          </span>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {tables.map((table) => {
          // Check if this table has pending calls or ready orders
          const tableReadyOrder = orders.find(
            (o) => o.tableNumber === table.tableNumber && o.status === 'ready'
          );
          const tableCall = serviceCalls.find(
            (c) => c.tableNumber === table.tableNumber && c.status === 'pending'
          );
          const activeTableOrders = orders.filter(
            (o) => o.tableNumber === table.tableNumber && ['received', 'preparing', 'ready', 'delivered'].includes(o.status)
          );

          let statusTheme = 'bg-stone-900 border-stone-800 text-stone-300';
          let statusBadge = 'Livre';
          let badgeColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';

          if (tableReadyOrder) {
            statusTheme = 'bg-purple-950/70 border-purple-500 text-purple-100 ring-2 ring-purple-500/40 animate-pulse';
            statusBadge = 'Prato Pronto!';
            badgeColor = 'bg-purple-500 text-white';
          } else if (tableCall?.type === 'bill_requested' || table.status === 'bill_requested') {
            statusTheme = 'bg-emerald-950/70 border-emerald-500 text-emerald-100 ring-2 ring-emerald-500/40';
            statusBadge = 'Pede Conta';
            badgeColor = 'bg-emerald-500 text-stone-950 font-bold';
          } else if (tableCall || table.status === 'calling_waiter') {
            statusTheme = 'bg-amber-950/70 border-amber-500 text-amber-100 ring-2 ring-amber-500/40 animate-bounce';
            statusBadge = 'Chamando Garçom';
            badgeColor = 'bg-amber-500 text-stone-950 font-bold';
          } else if (activeTableOrders.length > 0 || table.status === 'occupied') {
            statusTheme = 'bg-stone-900 border-blue-600/70 text-stone-200';
            statusBadge = 'Ocupada';
            badgeColor = 'bg-blue-500/20 text-blue-300 border-blue-500/30';
          }

          return (
            <div
              key={table.id}
              onClick={() => setSelectedTable(table)}
              className={`p-3.5 rounded-2xl border transition duration-200 flex flex-col justify-between cursor-pointer hover:scale-[1.02] shadow-md ${statusTheme}`}
            >
              <div>
                <div className="flex items-center justify-between gap-1 mb-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                    {statusBadge}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] text-stone-400">
                    <Users className="w-3 h-3" />
                    <span>{table.capacity}</span>
                  </div>
                </div>

                <h3 className="text-xl font-black tracking-tight text-white">
                  MESA {table.tableNumber}
                </h3>

                {tableCall && (
                  <p className="text-[11px] text-amber-300 font-semibold mt-1 truncate">
                    ⚠️ {tableCall.reason || 'Atendimento'}
                  </p>
                )}
              </div>

              <div className="mt-4 pt-2 border-t border-stone-800/80 flex items-center justify-between text-xs">
                <span className="text-stone-400">
                  {activeTableOrders.length > 0 ? `${activeTableOrders.length} pedido(s)` : 'Sem pedidos'}
                </span>
                <span className="text-amber-400 font-bold">Ver &rarr;</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Table Detail Drawer / Modal */}
      {selectedTable && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-xl rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col p-5 sm:p-6 shadow-2xl">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-stone-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase font-bold text-amber-400 tracking-wider">
                    Comanda Digital
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded bg-stone-800 text-stone-300">
                    Capacidade: {selectedTable.capacity} pessoas
                  </span>
                </div>
                <h2 className="text-2xl font-black text-white mt-0.5">
                  MESA {selectedTable.tableNumber}
                </h2>
              </div>
              <button
                onClick={() => setSelectedTable(null)}
                className="p-1.5 rounded-full text-stone-400 hover:text-white hover:bg-stone-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Consumed items list */}
            <div className="flex-1 overflow-y-auto py-3 space-y-3">
              {selectedTableItems.length === 0 ? (
                <div className="text-center py-8 text-stone-500">
                  <UtensilsCrossed className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-semibold text-stone-400">Nenhum item lançado para esta mesa</p>
                  <p className="text-xs text-stone-500 mt-1">
                    Você pode lançar pedidos extras usando o botão abaixo.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block">
                    Extrato de Consumo:
                  </span>
                  <div className="bg-stone-950/80 rounded-2xl p-3 border border-stone-850 divide-y divide-stone-800">
                    {selectedTableItems.map((entry, idx) => (
                      <div key={idx} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between text-xs">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-stone-100">
                              {entry.item.quantity}x {entry.item.name}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                                entry.status === 'ready'
                                  ? 'bg-purple-500/20 text-purple-300'
                                  : entry.status === 'preparing'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : entry.status === 'delivered'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-blue-500/20 text-blue-300'
                              }`}
                            >
                              {entry.status}
                            </span>
                          </div>
                          {entry.item.selectedOptions && entry.item.selectedOptions.length > 0 && (
                            <p className="text-[11px] text-amber-400/90 mt-0.5">
                              + {entry.item.selectedOptions.join(', ')}
                            </p>
                          )}
                          {entry.item.notes && (
                            <p className="text-[11px] text-stone-400 italic mt-0.5">
                              Obs: {entry.item.notes}
                            </p>
                          )}
                        </div>

                        <span className="text-stone-200 font-mono font-bold">
                          R$ {(entry.item.price * entry.item.quantity).toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Add item by Waiter Button */}
              <button
                onClick={() => setShowAddItemModal(true)}
                className="w-full py-2.5 px-3 bg-stone-800 hover:bg-stone-750 text-amber-400 border border-stone-700 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Lançar Prato / Bebida Extra na Mesa</span>
              </button>
            </div>

            {/* Drawer Footer with Totals and Action Buttons */}
            <div className="pt-3 border-t border-stone-800 space-y-3">
              <div className="bg-stone-950/60 p-3 rounded-xl space-y-1.5 text-xs">
                <div className="flex justify-between text-stone-400">
                  <span>Subtotal:</span>
                  <span className="font-mono text-stone-200">
                    R$ {tableSubtotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div className="flex justify-between items-center text-stone-400">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeServiceTax}
                      onChange={(e) => setIncludeServiceTax(e.target.checked)}
                      className="rounded accent-amber-500"
                    />
                    <span>Taxa de serviço ({config?.serviceTaxPercent || 10}%)</span>
                  </label>
                  <span className="font-mono text-stone-200">
                    R$ {serviceFee.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-stone-800">
                  <span>Total da Comanda:</span>
                  <span className="text-amber-400 font-mono text-base">
                    R$ {tableTotal.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={selectedTableItems.length === 0}
                  onClick={handlePrintConference}
                  className="py-3 px-3.5 bg-stone-850 hover:bg-stone-800 text-amber-300 border border-stone-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40"
                  title="Imprimir extrato de conferência para o cliente na mesa"
                >
                  <Printer className="w-4 h-4 text-amber-400" />
                  <span>Imprimir Conta</span>
                </button>
                <button
                  disabled={selectedTableItems.length === 0}
                  onClick={() => setShowCheckoutModal(true)}
                  className="flex-1 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-stone-950 font-black text-sm rounded-xl transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Receipt className="w-4 h-4" />
                  <span>Fechar Conta</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Adding Items directly by Waiter */}
      {showAddItemModal && selectedTable && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-md rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white">
                Lançar Item — Mesa {selectedTable.tableNumber}
              </h3>
              <button onClick={() => setShowAddItemModal(false)} className="text-stone-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Select Dish */}
            <div>
              <label className="text-xs font-bold text-stone-400 block mb-1">Escolher Item do Cardápio</label>
              <select
                value={selectedItemToAdd?.id || ''}
                onChange={(e) => {
                  const it = menuItems.find((m) => m.id === e.target.value);
                  setSelectedItemToAdd(it || null);
                }}
                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
              >
                <option value="">Selecione um prato ou bebida...</option>
                {menuItems.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — R$ {m.price.toFixed(2).replace('.', ',')}
                  </option>
                ))}
              </select>
            </div>

            {selectedItemToAdd && (
              <>
                <div className="flex items-center justify-between bg-stone-950 p-3 rounded-xl border border-stone-800">
                  <span className="text-xs font-semibold text-stone-300">Quantidade:</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAddItemQty((q) => Math.max(1, q - 1))}
                      className="w-7 h-7 rounded bg-stone-800 flex items-center justify-center text-xs font-bold"
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-bold text-sm">{addItemQty}</span>
                    <button
                      onClick={() => setAddItemQty((q) => q + 1)}
                      className="w-7 h-7 rounded bg-stone-800 flex items-center justify-center text-xs font-bold"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-400 block mb-1">Observações do Item</label>
                  <input
                    type="text"
                    value={addItemNotes}
                    onChange={(e) => setAddItemNotes(e.target.value)}
                    placeholder="Ex: Sem gelo, carne bem passada..."
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowAddItemModal(false)}
                className="flex-1 py-2.5 bg-stone-800 text-stone-300 rounded-xl text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                disabled={!selectedItemToAdd}
                onClick={handleConfirmAddItem}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-stone-950 rounded-xl text-xs font-bold"
              >
                Enviar p/ Cozinha
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Checkout / Fechamento de Mesa */}
      {showCheckoutModal && selectedTable && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-md rounded-3xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">
                  Fechamento — Mesa {selectedTable.tableNumber}
                </h3>
              </div>
              <button onClick={() => setShowCheckoutModal(false)} className="text-stone-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Total Highlight */}
            <div className="bg-stone-950 p-4 rounded-2xl border border-stone-800 text-center">
              <span className="text-xs text-stone-400 block">Total a Cobrar</span>
              <span className="text-3xl font-black text-emerald-400 font-mono">
                R$ {tableTotal.toFixed(2).replace('.', ',')}
              </span>
              <p className="text-[11px] text-stone-500 mt-1">
                {includeServiceTax ? `Inclui taxa de serviço de ${config?.serviceTaxPercent || 10}%` : 'Sem taxa de serviço'}
              </p>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-400 block">Forma de Pagamento Registrada:</label>
              <div className="grid grid-cols-2 gap-2">
                {['Cartão de Crédito', 'Cartão de Débito', 'PIX', 'Dinheiro'].map((method) => (
                  <button
                    key={method}
                    onClick={() => setCheckoutPaymentMethod(method)}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition text-center cursor-pointer ${
                      checkoutPaymentMethod === method
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                        : 'bg-stone-950 border-stone-800 text-stone-400 hover:border-stone-700'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
            </div>

            {/* Cash Calculator if Dinheiro */}
            {checkoutPaymentMethod === 'Dinheiro' && (
              <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-stone-400">Valor Recebido:</span>
                  <div className="relative w-32">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-stone-500">R$</span>
                    <input
                      type="text"
                      value={cashGiven}
                      onChange={(e) => setCashGiven(e.target.value)}
                      placeholder="0,00"
                      className="w-full bg-stone-900 border border-stone-700 rounded-lg pl-8 pr-2 py-1.5 text-xs text-right font-mono text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>
                {changeDue > 0 && (
                  <div className="flex justify-between items-center text-xs font-bold text-amber-400 pt-1 border-t border-stone-850">
                    <span>Troco a Devolver:</span>
                    <span className="font-mono text-sm">R$ {changeDue.toFixed(2).replace('.', ',')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="py-3 px-3 bg-stone-800 hover:bg-stone-750 text-stone-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="py-3 px-3 bg-stone-800 hover:bg-stone-750 text-amber-300 border border-stone-700 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                title="Imprimir comprovante fiscal/recibo da mesa"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Imprimir Recibo</span>
              </button>
              <button
                type="button"
                onClick={handleFinalizeBillAndClearTable}
                className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-stone-950 rounded-xl text-xs font-black shadow-lg cursor-pointer"
              >
                Confirmar & Liberar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
