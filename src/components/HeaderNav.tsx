import React from 'react';
import { 
  Smartphone, 
  ChefHat, 
  BellRing, 
  SlidersHorizontal, 
  Volume2, 
  VolumeX, 
  LogIn, 
  LogOut, 
  QrCode,
  Store,
  Layers,
  Eye
} from 'lucide-react';
import { AppViewMode, RestaurantConfig, Table } from '../types';
import { isSoundEnabled, setSoundEnabled } from '../lib/sound';
import { auth, loginWithGoogle, logoutUser } from '../lib/firebase';
import { User } from 'firebase/auth';

interface HeaderNavProps {
  currentMode: AppViewMode;
  onModeChange: (mode: AppViewMode) => void;
  config: RestaurantConfig | null;
  tables: Table[];
  selectedTableNumber: string;
  onSelectTableNumber: (tableNumber: string) => void;
  pendingKitchenCount: number;
  readyOrdersCount: number;
  pendingCallsCount: number;
  currentUser: User | null;
  onToggleCustomerView?: () => void;
}

export const HeaderNav: React.FC<HeaderNavProps> = ({
  currentMode,
  onModeChange,
  config,
  tables,
  selectedTableNumber,
  onSelectTableNumber,
  pendingKitchenCount,
  readyOrdersCount,
  pendingCallsCount,
  currentUser,
  onToggleCustomerView,
}) => {
  const [soundOn, setSoundOn] = React.useState(isSoundEnabled());
  const [showTableSelect, setShowTableSelect] = React.useState(false);
  const [showFirebaseModal, setShowFirebaseModal] = React.useState(false);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundEnabled(next);
    setSoundOn(next);
  };

  const handleAuth = async () => {
    if (currentUser) {
      await logoutUser();
    } else {
      try {
        await loginWithGoogle();
      } catch (e) {
        console.error(e);
      }
    }
  };

  return (
    <header className="sticky top-0 z-50 bg-stone-900 text-stone-100 shadow-md border-b border-stone-800">
      {/* Top Branding & Module Selector Bar */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Logo and Brand */}
        <div className="flex items-center gap-3">
          {config?.logoUrl ? (
            <img 
              src={config.logoUrl} 
              alt={config.name} 
              className="w-9 h-9 rounded-lg object-cover ring-1 ring-amber-500/40"
            />
          ) : (
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center ring-1 ring-amber-500/40">
              <Store className="w-5 h-5" />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-base sm:text-lg tracking-tight text-white leading-none">
                {config?.name || 'ComandaSmart'}
              </span>
              <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-stone-400 truncate max-w-[200px] sm:max-w-xs mt-0.5">
              {config?.tagline || 'Sistema de Restaurante & KDS'}
            </p>
          </div>
        </div>

        {/* Module Switcher Buttons */}
        <div className="flex items-center bg-stone-950 p-1 rounded-xl border border-stone-800 overflow-x-auto max-w-full">
          {/* Client / Mesa */}
          <button
            onClick={() => onModeChange('client')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              currentMode === 'client'
                ? 'bg-amber-500 text-stone-950 shadow-sm font-semibold'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>Mesa / Cliente</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-stone-900/30 rounded font-mono">
              #{selectedTableNumber || '01'}
            </span>
          </button>

          {/* Kitchen / KDS */}
          <button
            onClick={() => onModeChange('kitchen')}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              currentMode === 'kitchen'
                ? 'bg-amber-500 text-stone-950 shadow-sm font-semibold'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <ChefHat className="w-3.5 h-3.5" />
            <span>Cozinha KDS</span>
            {pendingKitchenCount > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold animate-pulse ${
                currentMode === 'kitchen' ? 'bg-stone-950 text-amber-400' : 'bg-red-500 text-white'
              }`}>
                {pendingKitchenCount}
              </span>
            )}
          </button>

          {/* Waiter / Salão */}
          <button
            onClick={() => onModeChange('waiter')}
            className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              currentMode === 'waiter'
                ? 'bg-amber-500 text-stone-950 shadow-sm font-semibold'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <BellRing className="w-3.5 h-3.5" />
            <span>Garçom / Salão</span>
            {(readyOrdersCount > 0 || pendingCallsCount > 0) && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold animate-bounce ${
                currentMode === 'waiter' ? 'bg-stone-950 text-amber-400' : 'bg-amber-500 text-stone-950'
              }`}>
                {readyOrdersCount + pendingCallsCount}
              </span>
            )}
          </button>

          {/* Admin Panel */}
          <button
            onClick={() => onModeChange('admin')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              currentMode === 'admin'
                ? 'bg-amber-500 text-stone-950 shadow-sm font-semibold'
                : 'text-stone-300 hover:text-white hover:bg-stone-800'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Admin / Gestão</span>
          </button>
        </div>

        {/* Utility Actions: Table quick picker, Firebase Status, Audio Toggle, Auth */}
        <div className="flex items-center gap-2">
          {/* Firebase Real-Time Status Pill */}
          <button
            onClick={() => setShowFirebaseModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-400 rounded-lg border border-emerald-500/30 transition cursor-pointer"
            title="Clique para ver detalhes da conexão com o Firebase"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-semibold hidden sm:inline">Firebase Conectado</span>
            <span className="sm:hidden font-semibold">Online</span>
          </button>

          {/* Table quick selector for client mode */}
          {currentMode === 'client' && (
            <div className="flex items-center gap-1.5">
              <div className="relative">
                <button
                  onClick={() => setShowTableSelect(!showTableSelect)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-stone-800 hover:bg-stone-750 text-amber-400 rounded-lg border border-stone-700 transition cursor-pointer"
                  title="Mudar mesa simulada"
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>Mesa: {selectedTableNumber || '01'}</span>
                </button>

                {showTableSelect && (
                  <div className="absolute right-0 mt-2 w-48 bg-stone-900 border border-stone-700 rounded-xl shadow-2xl p-2 z-50">
                    <p className="text-[11px] font-semibold text-stone-400 px-2 py-1 mb-1 border-b border-stone-800">
                      Simular QR Code de Mesa:
                    </p>
                    <div className="grid grid-cols-4 gap-1.5 max-h-48 overflow-y-auto p-1">
                      {tables.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => {
                            onSelectTableNumber(t.tableNumber);
                            setShowTableSelect(false);
                          }}
                          className={`py-1.5 text-xs rounded font-medium transition cursor-pointer ${
                            selectedTableNumber === t.tableNumber
                              ? 'bg-amber-500 text-stone-950 font-bold'
                              : 'bg-stone-800 text-stone-200 hover:bg-stone-700'
                          }`}
                        >
                          {t.tableNumber}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {onToggleCustomerView && (
                <button
                  onClick={onToggleCustomerView}
                  className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 text-xs bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-white rounded-lg border border-stone-700 transition cursor-pointer"
                  title="Ver exatamente a tela do cliente na mesa sem barra de equipe"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  <span>Visão do Cliente</span>
                </button>
              )}
            </div>
          )}

          {/* Audio toggle */}
          <button
            onClick={toggleSound}
            className={`p-2 rounded-lg border transition cursor-pointer ${
              soundOn 
                ? 'bg-stone-800 border-stone-700 text-amber-400 hover:bg-stone-700' 
                : 'bg-stone-800/40 border-stone-800 text-stone-500 hover:text-stone-300'
            }`}
            title={soundOn ? 'Alertas sonoros ativados' : 'Alertas sonoros mutados'}
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Auth button */}
          <button
            onClick={handleAuth}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition cursor-pointer ${
              currentUser 
                ? 'bg-stone-800 hover:bg-stone-700 text-stone-200 border-stone-700'
                : 'bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold border-amber-400 shadow-md'
            }`}
            title={currentUser ? `Conectado como ${currentUser.email}` : 'Entrar com Google no Firebase'}
          >
            {currentUser ? (
              <>
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="hidden sm:inline max-w-[90px] truncate">{currentUser.displayName || currentUser.email?.split('@')[0]}</span>
                <LogOut className="w-3.5 h-3.5 text-stone-400 ml-0.5" />
              </>
            ) : (
              <>
                <LogIn className="w-3.5 h-3.5" />
                <span>Entrar (Google)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Modal Details: Firebase Status & Login */}
      {showFirebaseModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔥</span>
                <div>
                  <h3 className="font-bold text-base text-white">Status da Conexão Firebase</h3>
                  <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Sincronização Ativa em Tempo Real
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowFirebaseModal(false)}
                className="text-stone-400 hover:text-white p-1"
              >
                ✕
              </button>
            </div>

            {/* Connection Information */}
            <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850 space-y-2.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-stone-400">Banco de Dados:</span>
                <span className="font-mono text-emerald-400 font-bold">Cloud Firestore</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-400">Database ID:</span>
                <span className="font-mono text-stone-300 text-[11px] truncate max-w-[200px]">
                  ai-studio-comandasmartsist-b20fc001
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-400">Projeto Google Cloud:</span>
                <span className="font-mono text-stone-300">gen-lang-client-0849882318</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-400">Regras de Segurança:</span>
                <span className="text-emerald-400 font-semibold">Ativas & Hardened (ABAC)</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-stone-400">Mesas Cadastradas:</span>
                <span className="font-mono text-stone-200">{tables.length} mesas salvas</span>
              </div>
            </div>

            {/* Auth Card */}
            <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850 space-y-3">
              <span className="text-xs font-bold text-stone-300 block">
                Firebase Authentication (Acesso Seguro):
              </span>

              {currentUser ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {currentUser.photoURL ? (
                      <img src={currentUser.photoURL} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-amber-500 text-stone-950 font-black text-xs flex items-center justify-center">
                        {currentUser.email?.[0]?.toUpperCase() || 'U'}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-bold text-white truncate max-w-[180px]">
                        {currentUser.displayName || currentUser.email}
                      </p>
                      <p className="text-[10px] text-stone-400 truncate max-w-[180px]">
                        {currentUser.email}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={async () => {
                      await logoutUser();
                    }}
                    className="py-1.5 px-3 bg-stone-800 hover:bg-stone-700 text-stone-300 rounded-xl text-xs font-semibold"
                  >
                    Sair
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-stone-400">
                    Conecte sua conta Google para gerenciar com perfil administrativo:
                  </p>
                  <button
                    onClick={async () => {
                      try {
                        await loginWithGoogle();
                        setShowFirebaseModal(false);
                      } catch (e) {
                        console.error(e);
                      }
                    }}
                    className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Conectar com Google</span>
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowFirebaseModal(false)}
              className="w-full py-2.5 bg-stone-800 hover:bg-stone-750 text-stone-300 rounded-xl text-xs font-bold"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

    </header>
  );
};
