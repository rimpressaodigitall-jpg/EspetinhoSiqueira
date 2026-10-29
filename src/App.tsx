import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  doc, 
  query, 
  orderBy 
} from 'firebase/firestore';
import { 
  db, 
  auth, 
  testConnection, 
  onAuthStateChanged, 
  handleFirestoreError, 
  OperationType 
} from './lib/firebase';
import { seedInitialDataIfEmpty } from './lib/defaultData';
import { parseTableFromLocation } from './lib/urlHelper';
import { 
  RestaurantConfig, 
  Category, 
  MenuItem, 
  Table, 
  Order, 
  ServiceCall, 
  StaffMember, 
  AppViewMode 
} from './types';
import { HeaderNav } from './components/HeaderNav';
import { ClientApp } from './modules/ClientApp';
import { KitchenKDS } from './modules/KitchenKDS';
import { WaiterApp } from './modules/WaiterApp';
import { AdminApp } from './modules/AdminApp';
import { User } from 'firebase/auth';

export default function App() {
  const [currentMode, setCurrentMode] = useState<AppViewMode>('client');
  const [selectedTableNumber, setSelectedTableNumber] = useState<string>('01');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isCustomerView, setIsCustomerView] = useState<boolean>(false);

  // Firestore Live State
  const [config, setConfig] = useState<RestaurantConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [serviceCalls, setServiceCalls] = useState<ServiceCall[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);

  // 1. Detect table number from URL query params (e.g. ?mesa=05), hash or pathname
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const checkLocationForTable = () => {
      const parsedTable = parseTableFromLocation(window.location);
      if (parsedTable) {
        setSelectedTableNumber(parsedTable);
        setCurrentMode('client');
        setIsCustomerView(true);
      }
    };

    checkLocationForTable();
    window.addEventListener('popstate', checkLocationForTable);
    window.addEventListener('hashchange', checkLocationForTable);

    return () => {
      window.removeEventListener('popstate', checkLocationForTable);
      window.removeEventListener('hashchange', checkLocationForTable);
    };
  }, []);

  // 2. Track Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // 3. Test connection, seed if empty, and subscribe to Firestore collections
  useEffect(() => {
    let unsubs: (() => void)[] = [];

    const initialize = async () => {
      try {
        await testConnection();
        // Seed default menu, tables, and config if not present
        await seedInitialDataIfEmpty(db);

        // 1. Config listener
        const unsubConfig = onSnapshot(
          doc(db, 'restaurant_config', 'main'),
          (snap) => {
            if (snap.exists()) {
              setConfig({ id: snap.id, ...snap.data() } as RestaurantConfig);
            }
          },
          (err) => handleFirestoreError(err, OperationType.GET, 'restaurant_config/main')
        );
        unsubs.push(unsubConfig);

        // 2. Categories listener
        const catQuery = query(collection(db, 'categories'), orderBy('order', 'asc'));
        const unsubCat = onSnapshot(
          catQuery,
          (snap) => {
            const list: Category[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Category));
            setCategories(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'categories')
        );
        unsubs.push(unsubCat);

        // 3. Menu items listener
        const unsubMenu = onSnapshot(
          collection(db, 'menu_items'),
          (snap) => {
            const list: MenuItem[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as MenuItem));
            setMenuItems(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'menu_items')
        );
        unsubs.push(unsubMenu);

        // 4. Tables listener
        const tablesQuery = query(collection(db, 'tables'), orderBy('tableNumber', 'asc'));
        const unsubTables = onSnapshot(
          tablesQuery,
          (snap) => {
            const list: Table[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Table));
            setTables(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'tables')
        );
        unsubs.push(unsubTables);

        // 5. Orders listener (ordered by createdAt)
        const unsubOrders = onSnapshot(
          collection(db, 'orders'),
          (snap) => {
            const list: Order[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as Order));
            setOrders(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'orders')
        );
        unsubs.push(unsubOrders);

        // 6. Service Calls listener
        const unsubCalls = onSnapshot(
          collection(db, 'service_calls'),
          (snap) => {
            const list: ServiceCall[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ServiceCall));
            setServiceCalls(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'service_calls')
        );
        unsubs.push(unsubCalls);

        // 7. Staff listener
        const unsubStaff = onSnapshot(
          collection(db, 'staff'),
          (snap) => {
            const list: StaffMember[] = [];
            snap.forEach((d) => list.push({ id: d.id, ...d.data() } as StaffMember));
            setStaff(list);
          },
          (err) => handleFirestoreError(err, OperationType.LIST, 'staff')
        );
        unsubs.push(unsubStaff);

      } catch (err) {
        console.error('Initialization error:', err);
      } finally {
        setIsInitializing(false);
      }
    };

    initialize();

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  // Compute live badges for header
  const pendingKitchenCount = orders.filter((o) => ['received', 'preparing'].includes(o.status)).length;
  const readyOrdersCount = orders.filter((o) => o.status === 'ready').length;
  const pendingCallsCount = serviceCalls.filter((c) => c.status === 'pending').length;

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-200 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center animate-pulse mb-3">
          <span className="text-xl">🍽️</span>
        </div>
        <h2 className="text-lg font-bold text-white tracking-tight">ComandaSmart</h2>
        <p className="text-xs text-stone-400 mt-1">Conectando ao banco em tempo real...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col font-sans selection:bg-amber-500 selection:text-stone-950">
      {/* Universal Top Nav & Module Switcher: Shown to staff/admin, hidden from customer scanning QR Code */}
      {!isCustomerView ? (
        <HeaderNav
          currentMode={currentMode}
          onModeChange={(m) => setCurrentMode(m)}
          config={config}
          tables={tables}
          selectedTableNumber={selectedTableNumber}
          onSelectTableNumber={(num) => {
            setSelectedTableNumber(num);
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              url.searchParams.set('mesa', num);
              window.history.replaceState({}, '', url.toString());
            }
          }}
          pendingKitchenCount={pendingKitchenCount}
          readyOrdersCount={readyOrdersCount}
          pendingCallsCount={pendingCallsCount}
          currentUser={currentUser}
          onToggleCustomerView={() => setIsCustomerView(true)}
        />
      ) : (
        /* Discreet customer top bar notification with option to open staff console */
        <div className="bg-stone-900/90 border-b border-stone-800/80 px-4 py-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-semibold text-stone-300">
              {config?.name || 'ComandaSmart'} • Cardápio da Mesa {selectedTableNumber}
            </span>
          </div>

          <button
            onClick={() => setIsCustomerView(false)}
            className="text-[11px] text-stone-400 hover:text-amber-400 underline transition cursor-pointer"
          >
            Acesso da Equipe
          </button>
        </div>
      )}

      {/* Main Module Render */}
      <main className="flex-1">
        {currentMode === 'client' && (
          <ClientApp
            tableNumber={selectedTableNumber}
            config={config}
            categories={categories}
            menuItems={menuItems}
            orders={orders}
          />
        )}

        {currentMode === 'kitchen' && (
          <KitchenKDS
            orders={orders}
            config={config}
          />
        )}

        {currentMode === 'waiter' && (
          <WaiterApp
            tables={tables}
            orders={orders}
            serviceCalls={serviceCalls}
            menuItems={menuItems}
            config={config}
          />
        )}

        {currentMode === 'admin' && (
          <AdminApp
            config={config}
            categories={categories}
            menuItems={menuItems}
            tables={tables}
            orders={orders}
            staff={staff}
            onOpenTableClient={(tableNum) => {
              setSelectedTableNumber(tableNum);
              setCurrentMode('client');
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('mesa', tableNum);
                window.history.replaceState({}, '', url.toString());
              }
            }}
          />
        )}
      </main>
    </div>
  );
}
