import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderItem, RestaurantConfig } from '../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { playReadyAlertSound } from '../lib/sound';
import { 
  ChefHat, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  Flame, 
  Maximize2, 
  Minimize2, 
  Filter,
  Check,
  RotateCcw
} from 'lucide-react';

interface KitchenKDSProps {
  orders: Order[];
  config: RestaurantConfig | null;
}

export const KitchenKDS: React.FC<KitchenKDSProps> = ({ orders, config }) => {
  const [filterStatus, setFilterStatus] = useState<'all' | 'received' | 'preparing' | 'ready'>('all');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  // Keep live timer updating every 10 seconds for real-time age calculation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  // Filter orders relevant to kitchen
  const activeOrders = useMemo(() => {
    return orders
      .filter((o) => ['received', 'preparing', 'ready'].includes(o.status))
      .filter((o) => filterStatus === 'all' || o.status === filterStatus)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [orders, filterStatus]);

  // Statistics
  const counts = useMemo(() => {
    const received = orders.filter((o) => o.status === 'received').length;
    const preparing = orders.filter((o) => o.status === 'preparing').length;
    const ready = orders.filter((o) => o.status === 'ready').length;
    return { received, preparing, ready, total: received + preparing + ready };
  }, [orders]);

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Actions for Orders
  const handleStartPreparing = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'preparing',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleMarkAsReady = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'ready',
        readyAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      playReadyAlertSound();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleMarkAsDelivered = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'delivered',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleReopenToPreparing = async (orderId: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        status: 'preparing',
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  // Age calculation and urgency color styling
  const getOrderAge = (createdAt: string) => {
    const elapsedMinutes = Math.floor((currentTime - new Date(createdAt).getTime()) / 60000);
    return Math.max(0, elapsedMinutes);
  };

  const alertLimitMinutes = config?.estimatedKdsAlertMinutes || 15;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-3 sm:p-5">
      {/* Top KDS Control Panel */}
      <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 mb-4 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
              <span>KDS — Painel da Cozinha</span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Ao Vivo
              </span>
            </h1>
            <p className="text-xs text-stone-400">
              Otimizado para Tablets & TV Box da Cozinha
            </p>
          </div>
        </div>

        {/* Status Counters */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              filterStatus === 'all'
                ? 'bg-stone-700 text-white'
                : 'bg-stone-950 text-stone-400 hover:text-white border border-stone-800'
            }`}
          >
            <span>Todos</span>
            <span className="w-5 h-5 rounded-md bg-stone-800 text-stone-200 text-[10px] flex items-center justify-center">
              {counts.total}
            </span>
          </button>

          <button
            onClick={() => setFilterStatus('received')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              filterStatus === 'received'
                ? 'bg-blue-600 text-white'
                : 'bg-stone-950 text-blue-400 hover:bg-stone-800 border border-blue-900/40'
            }`}
          >
            <span>Novos</span>
            <span className="w-5 h-5 rounded-md bg-blue-500/20 text-blue-300 text-[10px] flex items-center justify-center">
              {counts.received}
            </span>
          </button>

          <button
            onClick={() => setFilterStatus('preparing')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              filterStatus === 'preparing'
                ? 'bg-amber-600 text-stone-950 font-black'
                : 'bg-stone-950 text-amber-400 hover:bg-stone-800 border border-amber-900/40'
            }`}
          >
            <span>Em Preparo</span>
            <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] flex items-center justify-center">
              {counts.preparing}
            </span>
          </button>

          <button
            onClick={() => setFilterStatus('ready')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
              filterStatus === 'ready'
                ? 'bg-purple-600 text-white'
                : 'bg-stone-950 text-purple-400 hover:bg-stone-800 border border-purple-900/40'
            }`}
          >
            <span>Prontos</span>
            <span className="w-5 h-5 rounded-md bg-purple-500/20 text-purple-300 text-[10px] flex items-center justify-center">
              {counts.ready}
            </span>
          </button>
        </div>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-xl bg-stone-800 hover:bg-stone-750 text-stone-300 border border-stone-700 transition cursor-pointer"
          title={isFullscreen ? 'Sair da tela cheia' : 'Modo tela cheia'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Ticket Grid */}
      {activeOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 bg-stone-900/40 border border-stone-800/80 rounded-3xl text-center">
          <ChefHat className="w-16 h-16 text-stone-700 mb-3 animate-pulse" />
          <h2 className="text-xl font-bold text-stone-300">Cozinha sem pedidos pendentes</h2>
          <p className="text-sm text-stone-500 mt-1 max-w-sm">
            Novos pedidos feitos pelas mesas ou garçons aparecerão instantaneamente aqui em tempo real.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {activeOrders.map((order) => {
            const ageMinutes = getOrderAge(order.createdAt);
            const isLate = ageMinutes >= alertLimitMinutes && order.status !== 'ready';
            const isMedium = ageMinutes >= 10 && !isLate && order.status !== 'ready';

            let items: OrderItem[] = [];
            try {
              items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
            } catch (e) {
              items = [];
            }

            // Ticket header color based on status and age
            let headerBg = 'bg-stone-800';
            let statusText = 'RECEBIDO';
            let borderColor = 'border-stone-800';

            if (order.status === 'ready') {
              headerBg = 'bg-purple-950/80 border-purple-500/40 text-purple-200';
              statusText = 'PRONTO P/ ENTREGA';
              borderColor = 'border-purple-600/60 ring-1 ring-purple-500/30';
            } else if (isLate) {
              headerBg = 'bg-red-950/90 border-red-500/50 text-red-200';
              statusText = 'ATRASADO!';
              borderColor = 'border-red-600 ring-2 ring-red-500/40 animate-pulse';
            } else if (order.status === 'preparing') {
              headerBg = 'bg-amber-950/80 border-amber-500/40 text-amber-200';
              statusText = 'EM PREPARO';
              borderColor = 'border-amber-600/50';
            } else {
              headerBg = 'bg-blue-950/80 border-blue-500/40 text-blue-200';
              statusText = 'NOVO PEDIDO';
              borderColor = 'border-blue-700/50';
            }

            return (
              <div
                key={order.id}
                className={`flex flex-col bg-stone-900 rounded-2xl overflow-hidden border shadow-xl transition duration-200 ${borderColor}`}
              >
                {/* Header Ticket Banner */}
                <div className={`p-3 border-b flex items-center justify-between ${headerBg}`}>
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider opacity-80 block">
                      {statusText}
                    </span>
                    <h2 className="text-xl font-black tracking-tight text-white">
                      MESA {order.tableNumber}
                    </h2>
                  </div>

                  {/* Age Timer */}
                  <div className="text-right">
                    <div
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black font-mono ${
                        isLate
                          ? 'bg-red-600 text-white'
                          : isMedium
                          ? 'bg-amber-500 text-stone-950'
                          : 'bg-stone-950/80 text-stone-200'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>{ageMinutes} min</span>
                    </div>
                    <span className="text-[10px] block opacity-70 mt-0.5 font-mono">
                      {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* Customer name / General notes */}
                {order.customerName && (
                  <div className="px-3.5 py-1.5 bg-stone-950/40 border-b border-stone-850 flex items-center justify-between text-xs text-stone-400">
                    <span>Cliente: <strong className="text-stone-200">{order.customerName}</strong></span>
                    <span className="text-[11px] font-mono opacity-60">#{order.id.slice(-4)}</span>
                  </div>
                )}

                {order.generalNotes && (
                  <div className="px-3.5 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300 font-semibold flex items-start gap-1.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                    <span>Obs Geral: {order.generalNotes}</span>
                  </div>
                )}

                {/* Items to Prepare */}
                <div className="flex-1 p-3.5 divide-y divide-stone-800/80 overflow-y-auto max-h-72">
                  {items.map((item, idx) => (
                    <div key={idx} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex items-start gap-2.5">
                        <span className="w-7 h-7 rounded-lg bg-stone-800 text-amber-400 font-black text-sm flex items-center justify-center shrink-0 border border-stone-700">
                          {item.quantity}
                        </span>
                        <div className="flex-1">
                          <h4 className="font-bold text-sm text-stone-100 leading-snug">
                            {item.name}
                          </h4>
                          {item.selectedOptions && item.selectedOptions.length > 0 && (
                            <p className="text-xs text-amber-400/90 font-medium mt-0.5">
                              + {item.selectedOptions.join(', ')}
                            </p>
                          )}
                          {item.notes && (
                            <div className="mt-1 px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-300 text-xs font-bold inline-block">
                              ⚠️ {item.notes.toUpperCase()}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Single-Touch Actions Footer */}
                <div className="p-3 bg-stone-950 border-t border-stone-850 flex gap-2">
                  {order.status === 'received' && (
                    <button
                      onClick={() => handleStartPreparing(order.id)}
                      className="flex-1 py-3 px-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
                    >
                      <Flame className="w-4 h-4" />
                      <span>Iniciar Preparo</span>
                    </button>
                  )}

                  {order.status === 'preparing' && (
                    <button
                      onClick={() => handleMarkAsReady(order.id)}
                      className="flex-1 py-3 px-3 bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
                    >
                      <CheckCircle2 className="w-5 h-5 stroke-[2.5]" />
                      <span>Pronto p/ Entrega</span>
                    </button>
                  )}

                  {order.status === 'ready' && (
                    <div className="flex-1 flex gap-2">
                      <button
                        onClick={() => handleReopenToPreparing(order.id)}
                        className="p-2.5 bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white rounded-xl transition"
                        title="Voltar para em preparo"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleMarkAsDelivered(order.id)}
                        className="flex-1 py-3 px-3 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs sm:text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer shadow-md active:scale-95"
                      >
                        <Check className="w-5 h-5 stroke-[3]" />
                        <span>Entregue à Mesa</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
