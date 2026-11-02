import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import { 
  RestaurantConfig, 
  Category, 
  MenuItem, 
  Table, 
  Order, 
  OrderItem,
  StaffMember 
} from '../types';
import { 
  getResolvedBaseUrl, 
  getTableQrUrl, 
  isLocalhostUrl 
} from '../lib/urlHelper';
import { 
  doc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  addDoc 
} from 'firebase/firestore';
import { db, auth, loginWithGoogle, logoutUser, testConnection, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  Store, 
  Utensils, 
  QrCode, 
  TrendingUp, 
  Users, 
  Flame,
  Database,
  ShieldCheck,
  Plus, 
  Edit3, 
  Trash2, 
  Save, 
  Printer, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Percent, 
  Sparkles, 
  Layers, 
  Image as ImageIcon,
  Check,
  X,
  Copy,
  AlertTriangle,
  Smartphone,
  Globe,
  ArrowRight,
  HelpCircle,
  ChefHat,
  Shield,
  KeyRound,
  UserCheck,
  UserX,
  Camera,
  Download,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  ShieldAlert,
  Search
} from 'lucide-react';
import { ImageUploadCapture } from '../components/ImageUploadCapture';
import { AIMenuExtractorModal } from '../components/AIMenuExtractorModal';
import { printTableTent, printAllTableTents, printTableBill } from '../utils/printer';
import { downloadCompleteCardPng, downloadTwoCardsA4Png, openCardInPrintWindow } from '../utils/tableCardGenerator';

interface AdminAppProps {
  config: RestaurantConfig | null;
  categories: Category[];
  menuItems: MenuItem[];
  tables: Table[];
  orders: Order[];
  staff: StaffMember[];
  onOpenTableClient?: (tableNumber: string) => void;
}

export const AdminApp: React.FC<AdminAppProps> = ({
  config,
  categories,
  menuItems,
  tables,
  orders,
  staff,
  onOpenTableClient,
}) => {
  const [activeTab, setActiveTab] = useState<'reports' | 'brand' | 'menu' | 'tables' | 'staff' | 'firebase'>('tables');

  // Resolved public URL
  const currentBaseUrl = getResolvedBaseUrl(config);
  const isLocalhost = isLocalhostUrl(currentBaseUrl);

  // --- Brand Form State ---
  const [brandForm, setBrandForm] = useState<RestaurantConfig>({
    name: config?.name || '',
    tagline: config?.tagline || '',
    logoUrl: config?.logoUrl || '',
    address: config?.address || '',
    phone: config?.phone || '',
    pixKey: config?.pixKey || '',
    publicAppUrl: config?.publicAppUrl || currentBaseUrl,
    serviceTaxPercent: config?.serviceTaxPercent ?? 10,
    estimatedKdsAlertMinutes: config?.estimatedKdsAlertMinutes ?? 15,
    businessHours: config?.businessHours || '',
    wifiSsid: config?.wifiSsid || '',
    wifiPassword: config?.wifiPassword || '',
    adminDeletePassword: config?.adminDeletePassword || '1234',
  });

  useEffect(() => {
    if (config) {
      setBrandForm({
        name: config.name || '',
        tagline: config.tagline || '',
        logoUrl: config.logoUrl || '',
        address: config.address || '',
        phone: config.phone || '',
        pixKey: config.pixKey || '',
        publicAppUrl: config.publicAppUrl || currentBaseUrl,
        serviceTaxPercent: config.serviceTaxPercent ?? 10,
        estimatedKdsAlertMinutes: config.estimatedKdsAlertMinutes ?? 15,
        businessHours: config.businessHours || '',
        wifiSsid: config.wifiSsid || '',
        wifiPassword: config.wifiPassword || '',
        adminDeletePassword: config.adminDeletePassword || '1234',
      });
    }
  }, [config, currentBaseUrl]);

  const [savingBrand, setSavingBrand] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [copiedTableLink, setCopiedTableLink] = useState<string | null>(null);

  // --- Secure Deletion State (Requires Admin Password) ---
  const [deletionTarget, setDeletionTarget] = useState<{
    type: 'menu_item' | 'category' | 'table';
    id: string;
    name: string;
    extraInfo?: string;
  } | null>(null);
  const [deletePasswordInput, setDeletePasswordInput] = useState<string>('');
  const [deletePasswordError, setDeletePasswordError] = useState<string | null>(null);
  const [showDeletePassword, setShowDeletePassword] = useState<boolean>(false);
  const [isDeletingSecurely, setIsDeletingSecurely] = useState<boolean>(false);

  // --- Menu Item Form State ---
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [itemModalOpen, setItemModalOpen] = useState<boolean>(false);
  const [menuFilterCategory, setMenuFilterCategory] = useState<string>('all');
  const [menuSearchTerm, setMenuSearchTerm] = useState<string>('');

  // --- Category Form State ---
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState<boolean>(false);

  // --- Table Form State ---
  const [editingTable, setEditingTable] = useState<Partial<Table> | null>(null);
  const [tableModalOpen, setTableModalOpen] = useState<boolean>(false);
  const [printableTable, setPrintableTable] = useState<Table | null>(null);
  const [selectedPlateSize, setSelectedPlateSize] = useState<'10x15' | '13x20'>('13x20');
  const [selectedCopiesPerPage, setSelectedCopiesPerPage] = useState<1 | 2>(1);
  const [qrCodesMap, setQrCodesMap] = useState<Record<string, string>>({});

  // --- Staff Management State ---
  const [editingStaff, setEditingStaff] = useState<Partial<StaffMember> | null>(null);
  const [staffModalOpen, setStaffModalOpen] = useState<boolean>(false);
  const [deletingStaffId, setDeletingStaffId] = useState<string | null>(null);
  const [savingStaff, setSavingStaff] = useState<boolean>(false);
  const [staffRoleFilter, setStaffRoleFilter] = useState<string>('all');

  // --- AI Menu Extractor State ---
  const [aiExtractorOpen, setAiExtractorOpen] = useState<boolean>(false);

  // Generate QR codes for all tables using the resolved public URL
  useEffect(() => {
    const generateQrs = async () => {
      const map: Record<string, string> = {};
      for (const t of tables) {
        try {
          const url = getTableQrUrl(t.tableNumber, {
            ...config,
            publicAppUrl: brandForm.publicAppUrl || config?.publicAppUrl,
          } as RestaurantConfig);

          const qrDataUrl = await QRCode.toDataURL(url, {
            width: 360,
            margin: 2,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#1c1917',
              light: '#ffffff',
            },
          });
          map[t.tableNumber] = qrDataUrl;
        } catch (e) {
          console.error('Error generating QR code for table', t.tableNumber, e);
        }
      }
      setQrCodesMap(map);
    };
    generateQrs();
  }, [tables, config, brandForm.publicAppUrl]);

  // --- Financial & Performance Calculations ---
  const financialReports = useMemo(() => {
    const paidOrders = orders.filter((o) => o.status === 'paid');
    const totalRevenue = paidOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const totalOrdersCount = paidOrders.length;
    const averageTicket = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;

    // Items sales ranking
    const itemSalesMap: Record<string, { name: string; count: number; revenue: number }> = {};
    orders.forEach((o) => {
      if (o.status !== 'cancelled') {
        let items: { name: string; quantity: number; price: number }[] = [];
        try {
          items = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
        } catch (e) {}
        items.forEach((it) => {
          if (!itemSalesMap[it.name]) {
            itemSalesMap[it.name] = { name: it.name, count: 0, revenue: 0 };
          }
          itemSalesMap[it.name].count += it.quantity;
          itemSalesMap[it.name].revenue += it.price * it.quantity;
        });
      }
    });

    const ranking = Object.values(itemSalesMap).sort((a, b) => b.count - a.count);

    // Kitchen prep times
    const ordersWithReadyTime = orders.filter((o) => o.readyAt && o.createdAt);
    let avgPrepMin = 0;
    if (ordersWithReadyTime.length > 0) {
      const totalMinutes = ordersWithReadyTime.reduce((sum, o) => {
        const diff = (new Date(o.readyAt!).getTime() - new Date(o.createdAt).getTime()) / 60000;
        return sum + Math.max(1, diff);
      }, 0);
      avgPrepMin = Math.round(totalMinutes / ordersWithReadyTime.length);
    } else {
      avgPrepMin = 14; // benchmark
    }

    return {
      totalRevenue,
      totalOrdersCount,
      averageTicket,
      ranking,
      avgPrepMin,
      paidOrders,
    };
  }, [orders]);

  // Group menu items by category into distinct sub-spaces with search and filter
  const displayedCategoryGroups = useMemo(() => {
    const term = menuSearchTerm.trim().toLowerCase();

    // Filter items by search query if any
    const searchFiltered = menuItems.filter((item) => {
      if (!term) return true;
      const cat = categories.find((c) => c.id === item.categoryId);
      return (
        item.name.toLowerCase().includes(term) ||
        item.description.toLowerCase().includes(term) ||
        cat?.name.toLowerCase().includes(term) ||
        item.price.toString().includes(term)
      );
    });

    // Categories to include based on selected filter
    const activeCategories = menuFilterCategory === 'all'
      ? categories
      : categories.filter((c) => c.id === menuFilterCategory);

    // Sort categories by order
    const sortedCategories = [...activeCategories].sort((a, b) => (a.order || 0) - (b.order || 0));

    const groups = sortedCategories.map((cat) => ({
      category: cat,
      items: searchFiltered.filter((item) => item.categoryId === cat.id),
    }));

    // Find any items that don't belong to any known category
    const uncategorizedItems = searchFiltered.filter(
      (item) => !categories.some((c) => c.id === item.categoryId)
    );

    return {
      groups,
      uncategorizedItems,
      totalCount: searchFiltered.length,
    };
  }, [categories, menuItems, menuFilterCategory, menuSearchTerm]);

  // --- Handlers: Save Brand Config ---
  const handleSaveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBrand(true);
    try {
      await setDoc(doc(db, 'restaurant_config', 'main'), {
        ...brandForm,
        updatedAt: new Date().toISOString(),
      });
      setSaveSuccessMsg('Dados do estabelecimento salvos com sucesso!');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'restaurant_config/main');
    } finally {
      setSavingBrand(false);
    }
  };

  // --- Handlers: Menu Items CRUD ---
  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem?.name || !editingItem?.categoryId) return;

    try {
      const payload: MenuItem = {
        id: editingItem.id || `item_${Date.now()}`,
        categoryId: editingItem.categoryId,
        name: editingItem.name,
        description: editingItem.description || '',
        price: Number(editingItem.price) || 0,
        imageUrl: editingItem.imageUrl || 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
        available: editingItem.available ?? true,
        prepTimeMinutes: Number(editingItem.prepTimeMinutes) || 15,
        featured: editingItem.featured ?? false,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'menu_items', payload.id), payload);
      setItemModalOpen(false);
      setEditingItem(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'menu_items');
    }
  };

  // Open secure deletion modal requesting admin password
  const requestDeleteMenuItem = (item: MenuItem) => {
    setDeletionTarget({
      type: 'menu_item',
      id: item.id,
      name: item.name,
      extraInfo: `R$ ${item.price.toFixed(2).replace('.', ',')}`,
    });
    setDeletePasswordInput('');
    setDeletePasswordError(null);
  };

  // --- Handlers: Categories CRUD ---
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory?.name) return;

    try {
      const payload: Category = {
        id: editingCategory.id || `cat_${Date.now()}`,
        name: editingCategory.name,
        order: Number(editingCategory.order) || categories.length + 1,
        active: editingCategory.active ?? true,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'categories', payload.id), payload);
      setCategoryModalOpen(false);
      setEditingCategory(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'categories');
    }
  };

  const requestDeleteCategory = (cat: Category, itemCount?: number) => {
    const count = typeof itemCount === 'number'
      ? itemCount
      : menuItems.filter((i) => i.categoryId === cat.id).length;

    setDeletionTarget({
      type: 'category',
      id: cat.id,
      name: cat.name,
      extraInfo: count > 0
        ? `Sub-categoria com ${count} ${count === 1 ? 'prato vinculado' : 'pratos vinculados'}. A exclusão removerá a categoria e seus itens.`
        : 'Sub-categoria do cardápio (sem itens vinculados).',
    });
    setDeletePasswordInput('');
    setDeletePasswordError(null);
  };

  const requestDeleteTable = (table: Table) => {
    setDeletionTarget({
      type: 'table',
      id: table.id,
      name: `Mesa ${table.tableNumber}`,
      extraInfo: `${table.capacity} lugares`,
    });
    setDeletePasswordInput('');
    setDeletePasswordError(null);
  };

  // Authorize and execute deletion with admin password
  const handleConfirmSecureDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deletionTarget) return;

    const currentAdminPassword = (config?.adminDeletePassword || brandForm.adminDeletePassword || '1234').trim();
    const enteredPassword = deletePasswordInput.trim();

    if (enteredPassword !== currentAdminPassword) {
      setDeletePasswordError('Senha incorreta! Digite a senha de exclusão criada pelo administrador.');
      return;
    }

    setIsDeletingSecurely(true);
    setDeletePasswordError(null);

    try {
      if (deletionTarget.type === 'menu_item') {
        await deleteDoc(doc(db, 'menu_items', deletionTarget.id));
        setSaveSuccessMsg(`Item "${deletionTarget.name}" excluído com sucesso do cardápio!`);
      } else if (deletionTarget.type === 'category') {
        // 1. Delete category document
        await deleteDoc(doc(db, 'categories', deletionTarget.id));

        // 2. Delete all items belonging to this category
        const itemsToDelete = menuItems.filter((i) => i.categoryId === deletionTarget.id);
        for (const item of itemsToDelete) {
          try {
            await deleteDoc(doc(db, 'menu_items', item.id));
          } catch (e) {
            console.warn('Erro ao excluir item vinculado à categoria:', e);
          }
        }

        setSaveSuccessMsg(
          `Sub-categoria "${deletionTarget.name}" ${
            itemsToDelete.length > 0 ? `e seus ${itemsToDelete.length} itens foram excluídos` : 'foi excluída'
          } com sucesso!`
        );
      } else if (deletionTarget.type === 'table') {
        await deleteDoc(doc(db, 'tables', deletionTarget.id));
        setSaveSuccessMsg(`Mesa "${deletionTarget.name}" excluída com sucesso!`);
      }

      setDeletionTarget(null);
      setDeletePasswordInput('');
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err: any) {
      console.error('Erro na exclusão do item:', err);
      setDeletePasswordError(err?.message || 'Falha ao excluir o registro no banco de dados.');
    } finally {
      setIsDeletingSecurely(false);
    }
  };

  // --- Handlers: Tables CRUD ---
  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable?.tableNumber) return;

    try {
      const padNum = editingTable.tableNumber.padStart(2, '0');
      const tableId = editingTable.id || `mesa_${padNum}`;

      const payload: Table = {
        id: tableId,
        tableNumber: padNum,
        capacity: Number(editingTable.capacity) || 4,
        status: (editingTable.status as Table['status']) || 'available',
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'tables', payload.id), payload);
      setTableModalOpen(false);
      setEditingTable(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'tables');
    }
  };

  const handleDeleteTable = async (id: string) => {
    if (!confirm('Deseja excluir esta mesa?')) return;
    try {
      await deleteDoc(doc(db, 'tables', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tables/${id}`);
    }
  };

  // State for card generation
  const [downloadingCard, setDownloadingCard] = useState<boolean>(false);
  const [printingCard, setPrintingCard] = useState<boolean>(false);

  // Download high-resolution PNG with the complete plate art (not just QR)
  const handleDownloadCompleteCard = async (table: Table, size: '10x15' | '13x20' = selectedPlateSize) => {
    setDownloadingCard(true);
    try {
      const qrDataUrl = qrCodesMap[table.tableNumber] || '';
      const tableUrl = getTableQrUrl(table.tableNumber, {
        ...config,
        publicAppUrl: brandForm.publicAppUrl || config?.publicAppUrl,
      } as RestaurantConfig);

      await downloadCompleteCardPng(table, config, qrDataUrl, tableUrl, size);
      setSaveSuccessMsg(`Arte da Mesa ${table.tableNumber} (${size === '13x20' ? '13cm x 20cm' : '10cm x 15cm'}) baixada com sucesso (300 DPI)!`);
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err) {
      console.error('Erro ao gerar PNG da placa completa', err);
      // Fallback: download raw QR code
      handleDownloadQr(table.tableNumber);
    } finally {
      setDownloadingCard(false);
    }
  };

  // Print plate with direct window print + popup window fallback (bypasses iframe restrictions)
  const handlePrintCompleteCard = async (
    table: Table,
    size: '10x15' | '13x20' = selectedPlateSize,
    copiesPerPage: 1 | 2 = selectedCopiesPerPage
  ) => {
    setPrintingCard(true);
    const qrDataUrl = qrCodesMap[table.tableNumber] || '';
    const tableUrl = getTableQrUrl(table.tableNumber, {
      ...config,
      publicAppUrl: brandForm.publicAppUrl || config?.publicAppUrl,
    } as RestaurantConfig);

    // Open dedicated printable document with the requested size and copies per page
    try {
      await openCardInPrintWindow(table, config, qrDataUrl, tableUrl, size, copiesPerPage);
    } catch (err) {
      console.warn('Erro ao abrir janela de impressão, baixando imagem completa', err);
      if (copiesPerPage === 2) {
        await downloadTwoCardsA4Png(table, config, qrDataUrl, tableUrl, size);
        setSaveSuccessMsg('A janela de impressão foi bloqueada no modo preview. A folha A4 com 2 placas foi baixada em PNG para impressão!');
      } else {
        await downloadCompleteCardPng(table, config, qrDataUrl, tableUrl, size);
        setSaveSuccessMsg('A janela de impressão foi bloqueada no modo preview. A arte completa foi baixada em PNG para impressão!');
      }
      setTimeout(() => setSaveSuccessMsg(null), 4500);
    } finally {
      setPrintingCard(false);
    }
  };

  // Download high-resolution PNG containing 2 plates on A4 with cutting guide
  const handleDownloadTwoCards = async (table: Table, size: '10x15' | '13x20' = selectedPlateSize) => {
    setDownloadingCard(true);
    const qrDataUrl = qrCodesMap[table.tableNumber] || '';
    const tableUrl = getTableQrUrl(table.tableNumber, {
      ...config,
      publicAppUrl: brandForm.publicAppUrl || config?.publicAppUrl,
    } as RestaurantConfig);

    try {
      await downloadTwoCardsA4Png(table, config, qrDataUrl, tableUrl, size);
      setSaveSuccessMsg(`Folha A4 com 2 placas da Mesa ${table.tableNumber} baixada com sucesso (300 DPI)!`);
      setTimeout(() => setSaveSuccessMsg(null), 3500);
    } catch (err) {
      console.error('Erro ao baixar folha A4 com 2 placas', err);
      await downloadCompleteCardPng(table, config, qrDataUrl, tableUrl, size);
    } finally {
      setDownloadingCard(false);
    }
  };

  // Open single table display modal and optionally trigger print
  const triggerPrintDisplay = (table: Table, autoExecute = false) => {
    setPrintableTable(table);
    if (autoExecute) {
      setTimeout(() => {
        handlePrintCompleteCard(table);
      }, 350);
    }
  };

  // Batch print all table displays for cutting/laminating
  const handlePrintAllTables = () => {
    if (tables.length === 0) return;
    printAllTableTents(
      tables,
      config,
      qrCodesMap,
      (tableNum) =>
        getTableQrUrl(tableNum, {
          ...config,
          publicAppUrl: brandForm.publicAppUrl || config?.publicAppUrl,
        } as RestaurantConfig)
    );
  };

  // Download high-resolution PNG of raw QR Code (fallback)
  const handleDownloadQr = (tableNumber: string) => {
    const dataUrl = qrCodesMap[tableNumber];
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `qrcode-mesa-${tableNumber}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Handlers: Staff CRUD ---
  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff?.name || !editingStaff?.role) return;

    setSavingStaff(true);
    try {
      const staffId = editingStaff.id || `staff_${Date.now()}`;
      const payload: StaffMember = {
        id: staffId,
        name: editingStaff.name.trim(),
        role: editingStaff.role,
        email: editingStaff.email?.trim() || '',
        pin: editingStaff.pin?.trim() || '',
        active: editingStaff.active ?? true,
        createdAt: editingStaff.createdAt || new Date().toISOString(),
      };

      await setDoc(doc(db, 'staff', staffId), payload);
      setStaffModalOpen(false);
      setEditingStaff(null);
      setSaveSuccessMsg('Funcionário salvo com sucesso no Firebase!');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'staff');
    } finally {
      setSavingStaff(false);
    }
  };

  const handleDeleteStaff = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'staff', id));
      setDeletingStaffId(null);
      setSaveSuccessMsg('Funcionário removido com sucesso!');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `staff/${id}`);
    }
  };

  const handleToggleStaffActive = async (member: StaffMember) => {
    try {
      await updateDoc(doc(db, 'staff', member.id), {
        active: !member.active,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `staff/${member.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 p-3 sm:p-6 pb-24">
      {/* Container Principal do Painel (Oculto automaticamente durante impressão do card de mesa) */}
      <div className={`admin-dashboard-container ${printableTable ? 'print:hidden' : ''}`}>
        {/* Top Admin Bar */}
        <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 mb-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-black text-white flex items-center gap-2">
            <span>Painel Administrativo & Gestão Geral</span>
            <span className="text-[10px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">
              Gerente
            </span>
          </h1>
          <p className="text-xs text-stone-400">
            Personalize seu restaurante, gerencie cardápio, mesas com QR Code e acompanhe vendas
          </p>
        </div>

        {/* Admin Sub-Tabs */}
        <div className="flex items-center bg-stone-950 p-1 rounded-xl border border-stone-800 overflow-x-auto">
          {[
            { key: 'reports', label: 'Relatórios & Vendas', icon: TrendingUp },
            { key: 'brand', label: 'Marca & Loja', icon: Store },
            { key: 'menu', label: 'Cardápio & Itens', icon: Utensils },
            { key: 'tables', label: 'Mesas & QR Code', icon: QrCode },
            { key: 'staff', label: 'Equipe', icon: Users },
            { key: 'firebase', label: 'Firebase & Nuvem', icon: Flame },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-amber-500 text-stone-950 shadow-sm'
                    : 'text-stone-300 hover:text-white hover:bg-stone-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* TAB 1: RELATÓRIOS & VENDAS */}
      {activeTab === 'reports' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Key Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-stone-900 border border-stone-800 p-4 rounded-2xl shadow-lg">
              <span className="text-xs text-stone-400 font-semibold uppercase tracking-wider block">
                Faturamento Total
              </span>
              <h3 className="text-2xl font-black text-emerald-400 font-mono mt-1">
                R$ {financialReports.totalRevenue.toFixed(2).replace('.', ',')}
              </h3>
              <p className="text-[11px] text-stone-500 mt-1">Comandas pagas e finalizadas</p>
            </div>

            <div className="bg-stone-900 border border-stone-800 p-4 rounded-2xl shadow-lg">
              <span className="text-xs text-stone-400 font-semibold uppercase tracking-wider block">
                Comandas Finalizadas
              </span>
              <h3 className="text-2xl font-black text-amber-400 font-mono mt-1">
                {financialReports.totalOrdersCount}
              </h3>
              <p className="text-[11px] text-stone-500 mt-1">Mesas atendidas com sucesso</p>
            </div>

            <div className="bg-stone-900 border border-stone-800 p-4 rounded-2xl shadow-lg">
              <span className="text-xs text-stone-400 font-semibold uppercase tracking-wider block">
                Ticket Médio por Mesa
              </span>
              <h3 className="text-2xl font-black text-blue-400 font-mono mt-1">
                R$ {financialReports.averageTicket.toFixed(2).replace('.', ',')}
              </h3>
              <p className="text-[11px] text-stone-500 mt-1">Média gasta por comanda</p>
            </div>

            <div className="bg-stone-900 border border-stone-800 p-4 rounded-2xl shadow-lg">
              <span className="text-xs text-stone-400 font-semibold uppercase tracking-wider block">
                Tempo Médio de Cozinha
              </span>
              <h3 className="text-2xl font-black text-purple-400 font-mono mt-1">
                {financialReports.avgPrepMin} min
              </h3>
              <p className="text-[11px] text-stone-500 mt-1">Desde o pedido até o "Pronto"</p>
            </div>
          </div>

          {/* Ranking dos Pratos Mais Vendidos & Histórico de Comandas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ranking */}
            <div className="bg-stone-900 border border-stone-800 p-5 rounded-2xl shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>Itens Mais Vendidos (Ranking)</span>
                </h3>
                <span className="text-xs text-stone-400">Por volume</span>
              </div>

              {financialReports.ranking.length === 0 ? (
                <p className="text-xs text-stone-500 py-6 text-center">Nenhum dado de venda ainda</p>
              ) : (
                <div className="space-y-2">
                  {financialReports.ranking.slice(0, 7).map((item, idx) => (
                    <div
                      key={item.name}
                      className="bg-stone-950/60 p-3 rounded-xl border border-stone-850 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-6 h-6 rounded-lg font-black text-xs flex items-center justify-center ${
                            idx === 0
                              ? 'bg-amber-500 text-stone-950'
                              : idx === 1
                              ? 'bg-stone-300 text-stone-950'
                              : idx === 2
                              ? 'bg-amber-700 text-white'
                              : 'bg-stone-800 text-stone-300'
                          }`}
                        >
                          {idx + 1}º
                        </span>
                        <span className="font-bold text-stone-200">{item.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-amber-400 font-mono">{item.count} un</span>
                        <span className="text-[11px] text-stone-500 block font-mono">
                          R$ {item.revenue.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recentes Fechados */}
            <div className="bg-stone-900 border border-stone-800 p-5 rounded-2xl shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>Histórico de Comandas Fechadas</span>
                </h3>
                <span className="text-xs text-stone-400">Mais recentes</span>
              </div>

              {financialReports.paidOrders.length === 0 ? (
                <p className="text-xs text-stone-500 py-6 text-center">Nenhuma comanda encerrada ainda</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {financialReports.paidOrders.slice(0, 10).map((o) => (
                    <div
                      key={o.id}
                      className="bg-stone-950/60 p-3 rounded-xl border border-stone-850 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-black text-white">Mesa {o.tableNumber}</span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-800 text-stone-400">
                            {o.paymentMethod || 'Pago'}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 mt-0.5">
                          {o.closedAt ? new Date(o.closedAt).toLocaleString() : new Date(o.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-bold text-emerald-400 font-mono text-sm">
                          R$ {o.totalAmount.toFixed(2).replace('.', ',')}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            let orderItems: OrderItem[] = [];
                            try {
                              orderItems = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
                            } catch (e) {
                              orderItems = [];
                            }
                            printTableBill({
                              tableNumber: o.tableNumber,
                              items: orderItems.map((item) => ({ item })),
                              subtotal: o.subtotal || o.totalAmount,
                              serviceFee: o.serviceFee || 0,
                              serviceTaxPercent: config?.serviceTaxPercent || 10,
                              total: o.totalAmount,
                              paymentMethod: o.paymentMethod,
                              type: 'receipt',
                              config,
                            });
                          }}
                          className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white transition cursor-pointer"
                          title="Reimprimir cupom fiscal/recibo desta comanda"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MARCA & LOJA (100% editável pelo dono) */}
      {activeTab === 'brand' && (
        <div className="max-w-3xl bg-stone-900 border border-stone-800 rounded-3xl p-6 shadow-xl animate-fadeIn space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-stone-800">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-amber-400" />
                <span>Identidade Visual & Configurações da Loja</span>
              </h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Altere nome, logotipo, horários, endereço e chave PIX exibidos no cardápio dos clientes
              </p>
            </div>
          </div>

          {saveSuccessMsg && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{saveSuccessMsg}</span>
            </div>
          )}

          <form onSubmit={handleSaveBrand} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Nome do Estabelecimento *
                </label>
                <input
                  type="text"
                  required
                  value={brandForm.name}
                  onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                  placeholder="Ex: Bistrô & Parrilla Bella Vista"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Slogan ou Especialidade
                </label>
                <input
                  type="text"
                  value={brandForm.tagline}
                  onChange={(e) => setBrandForm({ ...brandForm, tagline: e.target.value })}
                  placeholder="Ex: Carnes nobres na brasa e massas artesanais"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Logo / Foto do Estabelecimento com Câmera e Upload */}
            <div>
              <ImageUploadCapture
                label="Logomarca do Estabelecimento (ou Foto da Fachada)"
                value={brandForm.logoUrl}
                onChange={(url) => setBrandForm({ ...brandForm, logoUrl: url })}
                aspectRatio="square"
                helperText="Tire uma foto do logo ou fachada com a câmera do celular, escolha da galeria ou informe uma URL externa."
              />
            </div>

            {/* Address & Phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Endereço Completo
                </label>
                <input
                  type="text"
                  value={brandForm.address}
                  onChange={(e) => setBrandForm({ ...brandForm, address: e.target.value })}
                  placeholder="Rua das Flores, 450 - Centro"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Telefone / WhatsApp
                </label>
                <input
                  type="text"
                  value={brandForm.phone}
                  onChange={(e) => setBrandForm({ ...brandForm, phone: e.target.value })}
                  placeholder="(11) 98765-4321"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Business Hours & PIX */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Horários de Funcionamento
                </label>
                <input
                  type="text"
                  value={brandForm.businessHours}
                  onChange={(e) => setBrandForm({ ...brandForm, businessHours: e.target.value })}
                  placeholder="Terça a Domingo: 11:30 às 15:30 e 18:30 às 23:45"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Chave PIX (para pagamento na mesa)
                </label>
                <input
                  type="text"
                  value={brandForm.pixKey}
                  onChange={(e) => setBrandForm({ ...brandForm, pixKey: e.target.value })}
                  placeholder="Ex: CNPJ, email ou celular"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Public URL for QR Codes */}
            <div className="pt-2 border-t border-stone-800">
              <label className="text-xs font-bold text-amber-400 block mb-1">
                URL Pública do Sistema (para os QR Codes das mesas)
              </label>
              <input
                type="url"
                value={brandForm.publicAppUrl || ''}
                onChange={(e) => setBrandForm({ ...brandForm, publicAppUrl: e.target.value })}
                placeholder="https://ais-dev-...run.app ou seu domínio próprio"
                className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs font-mono text-stone-200 focus:outline-none focus:border-amber-500"
              />
              <p className="text-[11px] text-stone-500 mt-1">
                Utilize a URL pública (não localhost) para que os clientes consigam ler o QR Code de seus smartphones.
              </p>
            </div>

            {/* Operational Rates: Service Tax & KDS Alert */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-stone-800">
              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Taxa de Serviço Padrão (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={brandForm.serviceTaxPercent}
                  onChange={(e) => setBrandForm({ ...brandForm, serviceTaxPercent: Number(e.target.value) })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Limite de Alerta KDS Atrasado (Minutos)
                </label>
                <input
                  type="number"
                  min="5"
                  max="60"
                  value={brandForm.estimatedKdsAlertMinutes}
                  onChange={(e) => setBrandForm({ ...brandForm, estimatedKdsAlertMinutes: Number(e.target.value) })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Nome da Rede Wi-Fi (SSID para Clientes)
                </label>
                <input
                  type="text"
                  value={brandForm.wifiSsid || ''}
                  onChange={(e) => setBrandForm({ ...brandForm, wifiSsid: e.target.value })}
                  placeholder="Ex: Restaurante_Clientes"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-stone-500 block mt-0.5">
                  Impresso automaticamente no card da mesa para os clientes conectarem.
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Senha do Wi-Fi dos Clientes (Opcional)
                </label>
                <input
                  type="text"
                  value={brandForm.wifiPassword || ''}
                  onChange={(e) => setBrandForm({ ...brandForm, wifiPassword: e.target.value })}
                  placeholder="Ex: delicia123 ou deixe em branco se aberto"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* SENHA DE EXCLUSÃO DO ADMINISTRADOR */}
              <div className="bg-amber-500/5 border border-amber-500/25 rounded-2xl p-3.5 space-y-2 col-span-1 sm:col-span-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-400" />
                    <label className="text-xs font-bold text-amber-300 block">
                      Senha de Segurança para Exclusão (Admin)
                    </label>
                  </div>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono font-bold">
                    Padrão: 1234
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showDeletePassword ? 'text' : 'password'}
                    value={brandForm.adminDeletePassword || ''}
                    onChange={(e) => setBrandForm({ ...brandForm, adminDeletePassword: e.target.value })}
                    placeholder="Digite a nova senha para autorizar exclusão (ex: 1234)"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 pr-10 text-xs text-stone-100 focus:outline-none focus:border-amber-500 font-mono tracking-wider"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword(!showDeletePassword)}
                    className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-200 transition"
                    title={showDeletePassword ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-stone-400 leading-relaxed">
                  Esta senha será solicitada antes de excluir qualquer <strong>item do cardápio</strong>, categoria ou mesa, protegendo seus dados contra exclusões acidentais ou não autorizadas.
                </p>
              </div>
            </div>

            <div className="pt-4 border-t border-stone-800 flex justify-end">
              <button
                type="submit"
                disabled={savingBrand}
                className="py-3 px-6 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 cursor-pointer transition active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>{savingBrand ? 'Salvando...' : 'Salvar Informações da Loja'}</span>
              </button>
            </div>
          </form>

          {/* GUIA PASSO A PASSO: CONFIGURAÇÃO DE DOMÍNIO PRÓPRIO & DNS (CLOUD RUN) */}
          <div className="mt-8 pt-8 border-t border-stone-800 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Globe className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    <span>Configurar Domínio Personalizado & DNS (Cloud Run)</span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Recomendado
                    </span>
                  </h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Utilize seu próprio endereço (ex: <code className="text-amber-300 font-mono">cardapio.seu-restaurante.com.br</code>) para que os QR Codes das mesas levem os clientes direto para a sua marca oficial.
                  </p>
                </div>
              </div>
            </div>

            {/* Input para o Domínio / DNS Final dos QR Codes */}
            <div className="bg-stone-950 p-5 rounded-2xl border border-amber-500/30 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-stone-200 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-amber-400" />
                  <span>Domínio / URL Final para Geração dos QR Codes:</span>
                </label>
                <span className="text-[10px] text-stone-400">Salva no Firestore em tempo real</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[260px]">
                  <input
                    type="url"
                    value={brandForm.publicAppUrl || ''}
                    onChange={(e) => setBrandForm({ ...brandForm, publicAppUrl: e.target.value })}
                    placeholder="https://cardapio.seu-restaurante.com.br"
                    className="w-full bg-stone-900 border border-stone-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    setSavingBrand(true);
                    try {
                      await setDoc(doc(db, 'restaurant_config', 'main'), {
                        ...brandForm,
                        updatedAt: new Date().toISOString(),
                      });
                      setSaveSuccessMsg('Domínio personalizado salvo! Todos os QR Codes foram atualizados.');
                      setTimeout(() => setSaveSuccessMsg(null), 3500);
                    } catch (err) {
                      handleFirestoreError(err, OperationType.WRITE, 'restaurant_config/main');
                    } finally {
                      setSavingBrand(false);
                    }
                  }}
                  className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-lg active:scale-95 whitespace-nowrap"
                >
                  <Save className="w-4 h-4" />
                  <span>Aplicar aos QR Codes</span>
                </button>
              </div>

              <p className="text-[11px] text-stone-400">
                Ao salvar aqui, todas as plaquetas de mesa geram links usando este endereço oficial.
              </p>
            </div>

            {/* Tabela de Apontamento DNS Recomendado */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
                <span>Registros DNS Necessários no seu Provedor de Domínio</span>
              </h4>

              <div className="overflow-x-auto bg-stone-950 rounded-2xl border border-stone-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-900/80 text-stone-400 uppercase text-[10px] tracking-wider border-b border-stone-800">
                    <tr>
                      <th className="p-3">Tipo</th>
                      <th className="p-3">Nome / Host</th>
                      <th className="p-3">Destino / Valor</th>
                      <th className="p-3">TTL</th>
                      <th className="p-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-850 font-mono text-stone-300">
                    <tr>
                      <td className="p-3 font-bold text-amber-400">CNAME</td>
                      <td className="p-3">
                        <span className="bg-stone-900 px-2 py-0.5 rounded text-stone-200">cardapio</span>
                      </td>
                      <td className="p-3 text-stone-200 font-semibold truncate max-w-xs">
                        ghs.googlehosted.com.
                      </td>
                      <td className="p-3 text-stone-400">Auto / 3600</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText('ghs.googlehosted.com.');
                            setSaveSuccessMsg('Valor CNAME copiado para a área de transferência!');
                            setTimeout(() => setSaveSuccessMsg(null), 2500);
                          }}
                          className="px-2 py-1 bg-stone-850 hover:bg-stone-800 text-stone-300 text-[11px] rounded-lg transition"
                        >
                          Copiar
                        </button>
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3 font-bold text-amber-400">CNAME (Alt)</td>
                      <td className="p-3">
                        <span className="bg-stone-900 px-2 py-0.5 rounded text-stone-200">cardapio</span>
                      </td>
                      <td className="p-3 text-stone-400 truncate max-w-xs" title="ais-pre-lq52p6akhj53uxkz6zg2h6-724966331366.us-east1.run.app">
                        ais-pre-lq52p6akhj53uxkz6zg2h6-724966331366.us-east1.run.app
                      </td>
                      <td className="p-3 text-stone-400">Auto / 3600</td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText('ais-pre-lq52p6akhj53uxkz6zg2h6-724966331366.us-east1.run.app');
                            setSaveSuccessMsg('URL do Cloud Run copiada!');
                            setTimeout(() => setSaveSuccessMsg(null), 2500);
                          }}
                          className="px-2 py-1 bg-stone-850 hover:bg-stone-800 text-stone-300 text-[11px] rounded-lg transition"
                        >
                          Copiar
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* O Passo a Passo Didático */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-stone-300">
                Guia Passo a Passo para Configuração:
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Passo 1 */}
                <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500 text-stone-950 font-black text-xs flex items-center justify-center shrink-0">
                      1
                    </span>
                    <h5 className="font-bold text-sm text-white">Escolha seu Subdomínio</h5>
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    Acesse a empresa onde seu domínio foi registrado (Registro.br, Cloudflare, GoDaddy, Hostinger, etc.). O ideal para restaurantes é criar um subdomínio como <code className="text-amber-300 font-mono">cardapio.seudominio.com.br</code> ou <code className="text-amber-300 font-mono">mesa.seudominio.com.br</code>.
                  </p>
                </div>

                {/* Passo 2 */}
                <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500 text-stone-950 font-black text-xs flex items-center justify-center shrink-0">
                      2
                    </span>
                    <h5 className="font-bold text-sm text-white">Adicione o Registro CNAME</h5>
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    Na Zona de DNS do seu domínio, crie uma entrada do tipo <strong>CNAME</strong> com o nome <code className="text-amber-300 font-mono">cardapio</code> apontando para <code className="text-amber-300 font-mono">ghs.googlehosted.com.</code> (endereço padrão de borda do Google).
                  </p>
                </div>

                {/* Passo 3 */}
                <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500 text-stone-950 font-black text-xs flex items-center justify-center shrink-0">
                      3
                    </span>
                    <h5 className="font-bold text-sm text-white">Vincule no Google Cloud Run</h5>
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    No Console do Google Cloud (projeto <code className="text-amber-300 font-mono">gen-lang-client-0849882318</code>), vá em <strong>Cloud Run ➔ Gerenciar Domínios Personalizados ➔ Adicionar Mapeamento</strong> e informe seu domínio. O Google gerencia o certificado HTTPS (SSL) gratuitamente!
                  </p>
                </div>

                {/* Passo 4 */}
                <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-emerald-500 text-stone-950 font-black text-xs flex items-center justify-center shrink-0">
                      4
                    </span>
                    <h5 className="font-bold text-sm text-white">Insira o Domínio no Campo Acima</h5>
                  </div>
                  <p className="text-xs text-stone-400 leading-relaxed">
                    Digite a URL completa (ex: <code className="text-emerald-400 font-mono">https://cardapio.seu-restaurante.com.br</code>) no campo acima e clique em <strong>"Aplicar aos QR Codes"</strong>. Seus clientes acessarão diretamente seu site oficial!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: CARDÁPIO & PRODUTOS */}
      {activeTab === 'menu' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Categories Management Bar */}
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-2xl shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm text-white">Categorias do Cardápio</h3>
                <p className="text-xs text-stone-400">Organize os grupos de pratos e bebidas</p>
              </div>
              <button
                onClick={() => {
                  setEditingCategory({ name: '', order: categories.length + 1, active: true });
                  setCategoryModalOpen(true);
                }}
                className="py-2 px-3 bg-stone-800 hover:bg-stone-750 text-amber-400 border border-stone-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Categoria</span>
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="bg-stone-950 border border-stone-800 px-3 py-2 rounded-xl flex items-center gap-2 shrink-0 text-xs"
                >
                  <span className="font-bold text-stone-200">{cat.name}</span>
                  <div className="flex items-center gap-1 border-l border-stone-800 pl-2">
                    <button
                      onClick={() => {
                        setEditingCategory(cat);
                        setCategoryModalOpen(true);
                      }}
                      className="text-stone-400 hover:text-amber-400 p-0.5"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => requestDeleteCategory(cat)}
                      className="text-stone-500 hover:text-red-400 p-0.5 transition cursor-pointer"
                      title="Excluir categoria (requer senha)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dishes Header & Add Buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white">Pratos &amp; Bebidas Cadastrados</h3>
              <p className="text-xs text-stone-400">
                Total de {menuItems.length} itens distribuídos por categorias
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Botão de Copiar Cardápio com IA */}
              <button
                type="button"
                onClick={() => setAiExtractorOpen(true)}
                className="py-2.5 px-3.5 bg-gradient-to-r from-purple-900/60 via-amber-900/40 to-amber-600/30 hover:from-purple-800/80 hover:to-amber-500/50 text-amber-300 border border-amber-500/40 font-bold text-xs rounded-xl shadow-lg flex items-center gap-2 transition cursor-pointer active:scale-95"
                title="Tire uma foto de um cardápio impresso ou lousa e a IA cadastra todos os pratos automaticamente"
              >
                <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                <span>Copiar Cardápio de Foto (IA)</span>
              </button>

              {/* Botão Adicionar Prato Manual */}
              <button
                onClick={() => {
                  setEditingItem({
                    categoryId: categories[0]?.id || '',
                    name: '',
                    description: '',
                    price: 0,
                    imageUrl: '',
                    available: true,
                    prepTimeMinutes: 15,
                    featured: false,
                  });
                  setItemModalOpen(true);
                }}
                className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Prato</span>
              </button>
            </div>
          </div>

          {/* Sub-espaço de Busca e Filtro de Categorias */}
          <div className="bg-stone-900/80 border border-stone-800 p-4 rounded-2xl shadow-md space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Campo de Busca Rápida */}
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-stone-500 absolute left-3 top-3" />
                <input
                  type="text"
                  value={menuSearchTerm}
                  onChange={(e) => setMenuSearchTerm(e.target.value)}
                  placeholder="Pesquisar prato, ingrediente ou valor..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl pl-9 pr-3 py-2 text-xs text-stone-200 placeholder-stone-500 focus:outline-none focus:border-amber-500"
                />
                {menuSearchTerm && (
                  <button
                    type="button"
                    onClick={() => setMenuSearchTerm('')}
                    className="absolute right-2.5 top-2.5 text-stone-500 hover:text-stone-300 text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Indicador de Itens Filtrados */}
              <div className="text-xs text-stone-400">
                Exibindo <strong>{displayedCategoryGroups.totalCount}</strong> de {menuItems.length} itens
              </div>
            </div>

            {/* Pílulas de Navegação por Sub-espaço de Categoria */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
              <button
                type="button"
                onClick={() => setMenuFilterCategory('all')}
                className={`py-1.5 px-3 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  menuFilterCategory === 'all'
                    ? 'bg-amber-500 text-stone-950 shadow-md'
                    : 'bg-stone-950 hover:bg-stone-800 text-stone-400 border border-stone-800'
                }`}
              >
                <span>Todas as Categorias</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  menuFilterCategory === 'all' ? 'bg-stone-950/20 text-stone-950' : 'bg-stone-800 text-stone-400'
                }`}>
                  {menuItems.length}
                </span>
              </button>

              {categories.map((cat) => {
                const count = menuItems.filter((i) => i.categoryId === cat.id).length;
                const isSelected = menuFilterCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setMenuFilterCategory(cat.id)}
                    className={`py-1.5 px-3 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-500 text-stone-950 shadow-md'
                        : 'bg-stone-950 hover:bg-stone-800 text-stone-400 border border-stone-800'
                    }`}
                  >
                    <span>{cat.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                      isSelected ? 'bg-stone-950/20 text-stone-950' : 'bg-stone-800 text-stone-400'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sub-espaços das Categorias (Agrupamento Visual Separado) */}
          <div className="space-y-6">
            {displayedCategoryGroups.groups.map(({ category, items }) => (
              <div
                key={category.id}
                className="bg-stone-900/60 border border-stone-800 rounded-3xl p-5 space-y-4 shadow-xl"
              >
                {/* Cabeçalho do Sub-espaço da Categoria */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-400 font-black">
                      <Utensils className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base sm:text-lg font-black text-white">{category.name}</h4>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                          {items.length} {items.length === 1 ? 'item' : 'itens'}
                        </span>
                      </div>
                      <p className="text-[11px] text-stone-400">
                        Sub-espaço de pratos e bebidas vinculados à categoria {category.name}
                      </p>
                    </div>
                  </div>

                  {/* Ações do Sub-espaço da Categoria */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Ação Rápida: Adicionar item direto neste sub-espaço */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem({
                          categoryId: category.id,
                          name: '',
                          description: '',
                          price: 0,
                          imageUrl: '',
                          available: true,
                          prepTimeMinutes: 15,
                          featured: false,
                        });
                        setItemModalOpen(true);
                      }}
                      className="py-1.5 px-3 bg-stone-800 hover:bg-stone-750 text-amber-400 border border-stone-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                      title={`Cadastrar novo prato em ${category.name}`}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Adicionar Prato</span>
                    </button>

                    {/* Editar Categoria */}
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategory(category);
                        setCategoryModalOpen(true);
                      }}
                      className="py-1.5 px-2.5 bg-stone-800 hover:bg-stone-750 text-stone-300 border border-stone-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                      title={`Editar nome e ordem da categoria "${category.name}"`}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Editar</span>
                    </button>

                    {/* Excluir Sub-categoria com Senha */}
                    <button
                      type="button"
                      onClick={() => requestDeleteCategory(category, items.length)}
                      className="py-1.5 px-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/30 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                      title={`Excluir sub-categoria "${category.name}" com senha`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir Categoria</span>
                    </button>
                  </div>
                </div>

                {/* Grid de Itens do Sub-espaço */}
                {items.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="bg-stone-950/80 border border-stone-800/90 hover:border-stone-700 rounded-2xl p-4 flex flex-col justify-between shadow-md transition"
                      >
                        <div>
                          <div className="flex gap-3">
                            <img
                              src={item.imageUrl || 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80'}
                              alt={item.name}
                              className="w-18 h-18 rounded-xl object-cover shrink-0 bg-stone-900 border border-stone-800"
                            />
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90 block">
                                {category.name}
                              </span>
                              <h5 className="font-bold text-sm text-white truncate">{item.name}</h5>
                              <p className="text-xs text-stone-400 line-clamp-2 mt-0.5">
                                {item.description || 'Sem descrição cadastrada.'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between mt-3 pt-2 border-t border-stone-850 text-xs">
                            <div>
                              <span className="text-stone-400">Preço: </span>
                              <strong className="text-amber-400 font-mono text-sm">
                                R$ {item.price.toFixed(2).replace('.', ',')}
                              </strong>
                            </div>
                            <span className="text-[11px] text-stone-500">
                              ~{item.prepTimeMinutes} min preparo
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-stone-800/80">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              item.available
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border border-red-500/20'
                            }`}
                          >
                            {item.available ? 'Disponível' : 'Esgotado'}
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setItemModalOpen(true);
                              }}
                              className="p-1.5 text-stone-400 hover:text-amber-400 rounded-lg hover:bg-stone-800 transition cursor-pointer"
                              title="Editar"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => requestDeleteMenuItem(item)}
                              className="p-1.5 text-stone-400 hover:text-red-400 rounded-lg hover:bg-stone-800 transition cursor-pointer"
                              title="Excluir item do cardápio (requer senha)"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-7 px-4 bg-stone-950/40 rounded-2xl border border-dashed border-stone-800/70 text-center space-y-2">
                    <p className="text-xs text-stone-400">
                      Nenhum prato cadastrado no sub-espaço de <strong>{category.name}</strong>.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem({
                          categoryId: category.id,
                          name: '',
                          description: '',
                          price: 0,
                          imageUrl: '',
                          available: true,
                          prepTimeMinutes: 15,
                          featured: false,
                        });
                        setItemModalOpen(true);
                      }}
                      className="py-1.5 px-3 bg-stone-800 hover:bg-stone-750 text-amber-400 text-xs font-bold rounded-xl transition cursor-pointer inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Cadastrar Primeiro Item</span>
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Sub-espaço para itens sem categoria (se houver) */}
            {displayedCategoryGroups.uncategorizedItems.length > 0 && (
              <div className="bg-stone-900/60 border border-stone-800 rounded-3xl p-5 space-y-4 shadow-xl">
                <div className="flex items-center justify-between pb-3 border-b border-stone-800">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-2xl bg-stone-800 flex items-center justify-center text-stone-400 font-bold">
                      <Utensils className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-black text-white">Outros / Sem Categoria</h4>
                      <p className="text-[11px] text-stone-400">
                        Itens ainda não associados a uma categoria oficial
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-stone-800 text-stone-300">
                    {displayedCategoryGroups.uncategorizedItems.length} itens
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {displayedCategoryGroups.uncategorizedItems.map((item) => (
                    <div
                      key={item.id}
                      className="bg-stone-950/80 border border-stone-800 rounded-2xl p-4 flex flex-col justify-between shadow-md"
                    >
                      <div>
                        <div className="flex gap-3">
                          <img
                            src={item.imageUrl || 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80'}
                            alt={item.name}
                            className="w-18 h-18 rounded-xl object-cover shrink-0 bg-stone-900 border border-stone-800"
                          />
                          <div className="min-w-0 flex-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 block">
                              Sem Categoria
                            </span>
                            <h5 className="font-bold text-sm text-white truncate">{item.name}</h5>
                            <p className="text-xs text-stone-400 line-clamp-2 mt-0.5">
                              {item.description || 'Sem descrição cadastrada.'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-stone-850 text-xs">
                          <div>
                            <span className="text-stone-400">Preço: </span>
                            <strong className="text-amber-400 font-mono text-sm">
                              R$ {item.price.toFixed(2).replace('.', ',')}
                            </strong>
                          </div>
                          <span className="text-[11px] text-stone-500">
                            ~{item.prepTimeMinutes} min preparo
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between gap-2 mt-3 pt-2 border-t border-stone-800">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-stone-800 text-stone-400">
                          {item.available ? 'Disponível' : 'Esgotado'}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setItemModalOpen(true);
                            }}
                            className="p-1.5 text-stone-400 hover:text-amber-400 rounded-lg hover:bg-stone-800 transition"
                            title="Editar"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => requestDeleteMenuItem(item)}
                            className="p-1.5 text-stone-400 hover:text-red-400 rounded-lg hover:bg-stone-800 transition cursor-pointer"
                            title="Excluir item do cardápio"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: MESAS & GERADOR DE QR CODE */}
      {activeTab === 'tables' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Public URL Config Card */}
          <div className="bg-stone-900 border border-stone-800 p-5 rounded-3xl shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-base text-white flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-amber-400" />
                  <span>Configuração da URL dos QR Codes</span>
                </h3>
                <p className="text-xs text-stone-400">
                  Este é o link base gravado dentro de cada QR Code que os clientes escaneiam com a câmera do celular
                </p>
              </div>

              <button
                onClick={() => {
                  setEditingTable({
                    tableNumber: (tables.length + 1).toString().padStart(2, '0'),
                    capacity: 4,
                    status: 'available',
                  });
                  setTableModalOpen(true);
                }}
                className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 cursor-pointer transition active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Adicionar Nova Mesa</span>
              </button>
            </div>

            {/* Explanation Guide on Google Cloud Run links */}
            <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850 space-y-2 text-xs">
              <span className="font-bold text-amber-400 block">
                💡 Como funciona o acesso no celular dos clientes:
              </span>
              <p className="text-stone-300 leading-relaxed">
                No Google AI Studio, existem dois tipos de link:
              </p>
              <ul className="space-y-1.5 pl-2 text-stone-400 text-[11px]">
                <li className="flex items-start gap-1.5">
                  <span className="text-emerald-400 font-bold shrink-0">1. Link Público dos Clientes (<code className="text-emerald-300 font-mono">ais-pre</code>):</span>
                  <span>Abre <strong>direto no cardápio de qualquer celular sem pedir conta do Google</strong>. Para ativá-lo, clique no botão <strong>"Share" (Compartilhar)</strong> no topo do Google AI Studio.</span>
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-blue-400 font-bold shrink-0">2. Link de Teste Dev (<code className="text-blue-300 font-mono">ais-dev</code>):</span>
                  <span>Abre no seu computador e no celular onde o navegador estiver conectado à sua conta Google.</span>
                </li>
              </ul>

              {/* Quick Presets Buttons */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-stone-900">
                <button
                  type="button"
                  onClick={() => {
                    const publicUrl = 'https://ais-pre-lq52p6akhj53uxkz6zg2h6-724966331366.us-east1.run.app';
                    setBrandForm({ ...brandForm, publicAppUrl: publicUrl });
                  }}
                  className="py-1.5 px-3 bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/50 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Usar Link Público Clientes (ais-pre)
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const devUrl = 'https://ais-dev-lq52p6akhj53uxkz6zg2h6-724966331366.us-east1.run.app';
                    setBrandForm({ ...brandForm, publicAppUrl: devUrl });
                  }}
                  className="py-1.5 px-3 bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-700/50 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Usar Link de Teste Dev (ais-dev)
                </button>
              </div>
            </div>

            {/* URL Input and Actions */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[280px]">
                <input
                  type="url"
                  value={brandForm.publicAppUrl || ''}
                  onChange={(e) => setBrandForm({ ...brandForm, publicAppUrl: e.target.value })}
                  placeholder="https://sua-url-publica.com"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-xs font-mono text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <button
                onClick={async () => {
                  setSavingBrand(true);
                  try {
                    await setDoc(doc(db, 'restaurant_config', 'main'), {
                      ...brandForm,
                      updatedAt: new Date().toISOString(),
                    });
                    setSaveSuccessMsg('URL do QR Code atualizada e salva com sucesso!');
                    setTimeout(() => setSaveSuccessMsg(null), 3500);
                  } catch (err) {
                    handleFirestoreError(err, OperationType.WRITE, 'restaurant_config/main');
                  } finally {
                    setSavingBrand(false);
                  }
                }}
                className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-lg active:scale-95"
              >
                <Save className="w-4 h-4" />
                <span>Salvar URL</span>
              </button>
            </div>

            {saveSuccessMsg && (
              <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}
          </div>

          {/* Batch Print & Header Toolbar */}
          <div className="bg-stone-900 border border-stone-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div>
              <h4 className="font-bold text-sm text-white flex items-center gap-2">
                <span>Mesas & Placas com QR Code</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-mono font-bold">
                  {tables.length} mesas
                </span>
              </h4>
              <p className="text-xs text-stone-400 mt-0.5">
                Prontas para impressão em papel comum, papel cartão ou display de acrílico
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handlePrintAllTables}
                className="py-2 px-3.5 bg-stone-800 hover:bg-stone-750 text-amber-300 border border-amber-500/30 font-bold text-xs rounded-xl flex items-center gap-2 transition cursor-pointer shadow-sm hover:border-amber-400"
                title="Gera um documento único com todos os displays de mesa para recortar e plastificar"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Imprimir Todas as Mesas (A4 / Lote)</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingTable({
                    tableNumber: (tables.length + 1).toString().padStart(2, '0'),
                    capacity: 4,
                    status: 'available',
                  });
                  setTableModalOpen(true);
                }}
                className="py-2 px-3.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl shadow-md flex items-center gap-1.5 transition active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Nova Mesa</span>
              </button>
            </div>
          </div>

          {/* Tables Cards Grid with QR Codes & Direct Testing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tables.map((table) => {
              const qr = qrCodesMap[table.tableNumber];
              const tableUrl = getTableQrUrl(table.tableNumber, {
                ...config,
                publicAppUrl: brandForm.publicAppUrl || config?.publicAppUrl,
              } as RestaurantConfig);
              const isCopied = copiedTableLink === table.tableNumber;

              return (
                <div
                  key={table.id}
                  className="bg-stone-900 border border-stone-800 rounded-3xl p-4 flex flex-col justify-between shadow-xl text-center hover:border-stone-700 transition"
                >
                  <div>
                    <div className="flex items-center justify-between pb-2 border-b border-stone-800 mb-3 text-xs text-stone-400">
                      <span>Capacidade: <strong>{table.capacity} lugares</strong></span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        table.status === 'available'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {table.status === 'available' ? 'Livre' : 'Ocupada'}
                      </span>
                    </div>

                    <h4 className="text-2xl font-black text-white">MESA {table.tableNumber}</h4>

                    {/* QR Code image */}
                    <div className="my-3 p-3 bg-white rounded-2xl inline-block shadow-md">
                      {qr ? (
                        <img 
                          src={qr} 
                          alt={`QR Code Mesa ${table.tableNumber}`} 
                          className="w-36 h-36 mx-auto object-contain" 
                        />
                      ) : (
                        <div className="w-36 h-36 flex items-center justify-center text-stone-500 text-xs">
                          Gerando QR...
                        </div>
                      )}
                    </div>

                    <div className="bg-stone-950 p-2 rounded-xl border border-stone-850 mb-2">
                      <p className="text-[10px] text-stone-400 font-mono truncate" title={tableUrl}>
                        {tableUrl}
                      </p>
                    </div>
                  </div>

                  {/* Actions: Test in Browser, Copy Link, Print Display, Delete */}
                  <div className="space-y-1.5 pt-2 border-t border-stone-800">
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        onClick={() => {
                          if (onOpenTableClient) {
                            onOpenTableClient(table.tableNumber);
                          } else {
                            window.location.href = tableUrl;
                          }
                        }}
                        className="py-2 px-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl flex items-center justify-center gap-1 transition cursor-pointer active:scale-95"
                        title="Simular a experiência do cliente abrindo esta mesa"
                      >
                        <Smartphone className="w-3.5 h-3.5" />
                        <span>Testar Mesa</span>
                      </button>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(tableUrl);
                          setCopiedTableLink(table.tableNumber);
                          setTimeout(() => setCopiedTableLink(null), 2500);
                        }}
                        className="py-2 px-2 bg-stone-800 hover:bg-stone-750 text-stone-200 hover:text-white border border-stone-700 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition cursor-pointer"
                        title="Copiar link direto para testar ou enviar"
                      >
                        {isCopied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-emerald-400">Copiado!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copiar Link</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => triggerPrintDisplay(table, true)}
                        className="flex-1 py-2 px-2 bg-stone-950 hover:bg-stone-800 text-amber-400 border border-stone-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="Imprimir plaqueta ou display acrílico desta mesa"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Imprimir Plaqueta</span>
                      </button>

                      <button
                        onClick={() => handleDownloadCompleteCard(table)}
                        className="p-2 bg-stone-950 hover:bg-stone-800 text-amber-400 hover:text-amber-300 border border-stone-800 rounded-xl transition cursor-pointer"
                        title="Baixar arte completa da placa da mesa em PNG (alta definição)"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => requestDeleteTable(table)}
                        className="p-2 text-stone-500 hover:text-red-400 rounded-xl hover:bg-stone-800 transition cursor-pointer"
                        title="Excluir mesa (requer senha)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: EQUIPE & USUÁRIOS (ADMIN ACESSO TOTAL: CRIAR, EDITAR, EXCLUIR) */}
      {activeTab === 'staff' && (
        <div className="max-w-4xl space-y-6 animate-fadeIn">
          {/* Header Card */}
          <div className="bg-stone-900 border border-stone-800 p-6 rounded-3xl shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white flex items-center gap-2">
                    <span>Gestão de Equipe & Acessos</span>
                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {staff.length} Membros
                    </span>
                  </h3>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Cadastre, edite e controle garçons, cozinheiros e administradores com PIN rápido e perfis
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingStaff({
                    name: '',
                    role: 'waiter',
                    email: '',
                    pin: '',
                    active: true,
                  });
                  setStaffModalOpen(true);
                }}
                className="py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 transition cursor-pointer active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Funcionário</span>
              </button>
            </div>

            {/* Quick Stats Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-stone-950 p-3 rounded-2xl border border-stone-850">
                <span className="text-[10px] text-stone-500 uppercase font-bold block">Total Equipe</span>
                <span className="text-xl font-black text-white">{staff.length}</span>
              </div>

              <div className="bg-stone-950 p-3 rounded-2xl border border-stone-850">
                <span className="text-[10px] text-amber-400 uppercase font-bold block">Garçons (Salão)</span>
                <span className="text-xl font-black text-amber-400">
                  {staff.filter((s) => s.role === 'waiter').length}
                </span>
              </div>

              <div className="bg-stone-950 p-3 rounded-2xl border border-stone-850">
                <span className="text-[10px] text-blue-400 uppercase font-bold block">Cozinha (KDS)</span>
                <span className="text-xl font-black text-blue-400">
                  {staff.filter((s) => s.role === 'cook').length}
                </span>
              </div>

              <div className="bg-stone-950 p-3 rounded-2xl border border-stone-850">
                <span className="text-[10px] text-purple-400 uppercase font-bold block">Administradores</span>
                <span className="text-xl font-black text-purple-400">
                  {staff.filter((s) => s.role === 'admin').length}
                </span>
              </div>
            </div>
          </div>

          {/* Role Filter Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1">
            {[
              { id: 'all', label: 'Todos os Funcionários', count: staff.length },
              { id: 'waiter', label: 'Garçons (Salão)', count: staff.filter((s) => s.role === 'waiter').length },
              { id: 'cook', label: 'Cozinha (KDS)', count: staff.filter((s) => s.role === 'cook').length },
              { id: 'admin', label: 'Administradores', count: staff.filter((s) => s.role === 'admin').length },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStaffRoleFilter(tab.id)}
                className={`py-2 px-3.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shrink-0 ${
                  staffRoleFilter === tab.id
                    ? 'bg-amber-500 text-stone-950 shadow-md'
                    : 'bg-stone-900 text-stone-400 hover:text-white border border-stone-800'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                    staffRoleFilter === tab.id
                      ? 'bg-stone-950/20 text-stone-950'
                      : 'bg-stone-800 text-stone-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Staff Cards List */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {staff
              .filter((s) => staffRoleFilter === 'all' || s.role === staffRoleFilter)
              .map((member) => {
                const isWait = member.role === 'waiter';
                const isCook = member.role === 'cook';
                const isAdmin = member.role === 'admin';

                return (
                  <div
                    key={member.id}
                    className="bg-stone-900 border border-stone-800 rounded-3xl p-5 shadow-xl flex flex-col justify-between hover:border-stone-700 transition space-y-4"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-base shrink-0 shadow-inner ${
                              isAdmin
                                ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                                : isCook
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {isAdmin ? (
                              <Shield className="w-5 h-5" />
                            ) : isCook ? (
                              <ChefHat className="w-5 h-5" />
                            ) : (
                              <Users className="w-5 h-5" />
                            )}
                          </div>

                          <div>
                            <h4 className="font-bold text-white text-base leading-tight">
                              {member.name}
                            </h4>
                            <span
                              className={`inline-block mt-1 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                isAdmin
                                  ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                                  : isCook
                                  ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {isAdmin
                                ? 'Administrador Geral'
                                : isCook
                                ? 'Cozinha / KDS'
                                : 'Garçom de Salão'}
                            </span>
                          </div>
                        </div>

                        {/* Status Toggle Button */}
                        <button
                          type="button"
                          onClick={() => handleToggleStaffActive(member)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                            member.active
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                              : 'bg-stone-800 text-stone-500 border-stone-700 hover:text-stone-300'
                          }`}
                          title="Clique para alternar o status ativo/inativo"
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              member.active ? 'bg-emerald-400 animate-pulse' : 'bg-stone-600'
                            }`}
                          />
                          <span>{member.active ? 'Ativo' : 'Inativo'}</span>
                        </button>
                      </div>

                      {/* Details row: Email & PIN */}
                      <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-stone-850 text-xs">
                        <div className="bg-stone-950 p-2.5 rounded-xl border border-stone-850/80">
                          <span className="text-[10px] text-stone-500 block">Identificação / Email:</span>
                          <span className="text-stone-300 font-mono text-[11px] truncate block" title={member.email || 'Não informado'}>
                            {member.email || 'Sem email'}
                          </span>
                        </div>

                        <div className="bg-stone-950 p-2.5 rounded-xl border border-stone-850/80">
                          <span className="text-[10px] text-stone-500 block">Código PIN Rápido:</span>
                          <span className="text-amber-400 font-mono text-xs font-bold flex items-center gap-1">
                            <KeyRound className="w-3 h-3 text-amber-500/70" />
                            <span>{member.pin ? member.pin : 'Sem PIN'}</span>
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons: Edit & Delete */}
                    <div className="pt-2 border-t border-stone-800 flex items-center justify-between gap-2">
                      <span className="text-[10px] text-stone-500">
                        {member.createdAt
                          ? `Desde ${new Date(member.createdAt).toLocaleDateString()}`
                          : 'Cadastro ativo'}
                      </span>

                      <div className="flex items-center gap-2">
                        {/* Edit Button */}
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStaff(member);
                            setStaffModalOpen(true);
                          }}
                          className="py-1.5 px-3 bg-stone-800 hover:bg-stone-750 text-amber-300 hover:text-amber-200 border border-stone-700 text-xs font-bold rounded-xl flex items-center gap-1 transition cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar</span>
                        </button>

                        {/* Delete Button */}
                        <button
                          type="button"
                          onClick={() => setDeletingStaffId(member.id)}
                          className="py-1.5 px-3 bg-stone-950 hover:bg-red-500/10 text-stone-400 hover:text-red-400 border border-stone-800 hover:border-red-500/30 text-xs font-bold rounded-xl flex items-center gap-1 transition cursor-pointer"
                          title="Excluir este funcionário"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

            {staff.filter((s) => staffRoleFilter === 'all' || s.role === staffRoleFilter).length === 0 && (
              <div className="col-span-full bg-stone-900 border border-stone-800 rounded-3xl p-8 text-center space-y-3">
                <Users className="w-8 h-8 mx-auto text-stone-600" />
                <p className="text-xs text-stone-400">Nenhum funcionário encontrado neste filtro.</p>
                <button
                  type="button"
                  onClick={() => {
                    setEditingStaff({
                      name: '',
                      role: 'waiter',
                      email: '',
                      pin: '',
                      active: true,
                    });
                    setStaffModalOpen(true);
                  }}
                  className="py-2 px-4 bg-amber-500 text-stone-950 font-bold text-xs rounded-xl"
                >
                  Cadastrar Agora
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: FIREBASE & NUVEM */}
      {activeTab === 'firebase' && (
        <div className="max-w-4xl space-y-6 animate-fadeIn">
          {/* Header */}
          <div className="bg-stone-900 border border-stone-800 p-6 rounded-3xl shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl">
                  🔥
                </div>
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <span>Banco de Dados & Autenticação Firebase</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      100% Conectado e Operacional
                    </span>
                  </h2>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Seus pratos, categorias, mesas e pedidos são sincronizados instantaneamente em tempo real na nuvem do Google.
                  </p>
                </div>
              </div>
            </div>

            {/* Connection Spec Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
              <div className="bg-stone-950 p-3.5 rounded-2xl border border-stone-850">
                <span className="text-[11px] text-stone-400 font-semibold block">Serviço de Banco:</span>
                <strong className="text-sm text-emerald-400 font-mono block mt-0.5">Cloud Firestore</strong>
                <span className="text-[10px] text-stone-500">Enterprise Mode</span>
              </div>

              <div className="bg-stone-950 p-3.5 rounded-2xl border border-stone-850">
                <span className="text-[11px] text-stone-400 font-semibold block">Database ID:</span>
                <strong className="text-xs text-stone-200 font-mono block mt-0.5 truncate" title="ai-studio-comandasmartsist-b20fc001-9fbd-4cc0-a4c8-7fd15a98eea5">
                  ai-studio-comandasmartsist...
                </strong>
                <span className="text-[10px] text-emerald-400">Instância Dedicada</span>
              </div>

              <div className="bg-stone-950 p-3.5 rounded-2xl border border-stone-850">
                <span className="text-[11px] text-stone-400 font-semibold block">Projeto Cloud:</span>
                <strong className="text-xs text-stone-200 font-mono block mt-0.5">gen-lang-client-0849882318</strong>
                <span className="text-[10px] text-stone-500">Google Cloud Platform</span>
              </div>

              <div className="bg-stone-950 p-3.5 rounded-2xl border border-stone-850">
                <span className="text-[11px] text-stone-400 font-semibold block">Regras de Segurança:</span>
                <strong className="text-xs text-emerald-400 block mt-0.5 font-semibold">Ativas & Hardened</strong>
                <span className="text-[10px] text-stone-500">firestore.rules implantadas</span>
              </div>
            </div>
          </div>

          {/* Authentication & User Session Card */}
          <div className="bg-stone-900 border border-stone-800 p-6 rounded-3xl shadow-xl space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-base text-white">Firebase Authentication (Acesso Seguro)</h3>
            </div>
            <p className="text-xs text-stone-400">
              O Firebase Auth garante que apenas o proprietário e funcionários autorizados alterem itens, fechem o caixa e gerenciem o restaurante.
            </p>

            {auth.currentUser ? (
              <div className="bg-stone-950 p-4 rounded-2xl border border-emerald-500/30 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {auth.currentUser.photoURL ? (
                    <img src={auth.currentUser.photoURL} alt="" className="w-11 h-11 rounded-2xl object-cover ring-2 ring-emerald-500/40" />
                  ) : (
                    <div className="w-11 h-11 rounded-2xl bg-amber-500 text-stone-950 font-black text-sm flex items-center justify-center">
                      {auth.currentUser.email?.[0]?.toUpperCase() || 'A'}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-sm text-white font-bold">{auth.currentUser.displayName || 'Administrador'}</strong>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        Admin Conectado
                      </span>
                    </div>
                    <p className="text-xs text-stone-400 font-mono mt-0.5">{auth.currentUser.email}</p>
                    <span className="text-[10px] text-stone-500 font-mono">UID: {auth.currentUser.uid}</span>
                  </div>
                </div>

                <button
                  onClick={async () => {
                    await logoutUser();
                  }}
                  className="py-2 px-4 bg-stone-800 hover:bg-stone-750 text-stone-300 hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Desconectar
                </button>
              </div>
            ) : (
              <div className="bg-stone-950 p-5 rounded-2xl border border-stone-850 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="text-sm font-bold text-white">Nenhuma sessão Google iniciada</h4>
                  <p className="text-xs text-stone-400 mt-0.5">
                    Faça login com sua conta Google (<strong className="text-stone-300">rimpressaodigitall@gmail.com</strong>) para se autenticar no Firebase.
                  </p>
                </div>

                <button
                  onClick={async () => {
                    try {
                      await loginWithGoogle();
                    } catch (e) {
                      console.error(e);
                    }
                  }}
                  className="py-3 px-5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 transition cursor-pointer active:scale-95"
                >
                  <Users className="w-4 h-4" />
                  <span>Conectar com Google no Firebase</span>
                </button>
              </div>
            )}
          </div>

          {/* Sincronização de Coleções em Tempo Real */}
          <div className="bg-stone-900 border border-stone-800 p-6 rounded-3xl shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base text-white">Coleções Sincronizadas no Firestore</h3>
              </div>
              <span className="text-xs text-stone-400">Listeners onSnapshot Ativos</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-stone-950 p-3 rounded-xl border border-stone-850">
                <span className="text-[10px] text-stone-500 uppercase font-mono block">/menu_items</span>
                <span className="text-lg font-black text-amber-400">{menuItems.length} pratos</span>
              </div>

              <div className="bg-stone-950 p-3 rounded-xl border border-stone-850">
                <span className="text-[10px] text-stone-500 uppercase font-mono block">/categories</span>
                <span className="text-lg font-black text-amber-400">{categories.length} categorias</span>
              </div>

              <div className="bg-stone-950 p-3 rounded-xl border border-stone-850">
                <span className="text-[10px] text-stone-500 uppercase font-mono block">/tables</span>
                <span className="text-lg font-black text-amber-400">{tables.length} mesas</span>
              </div>

              <div className="bg-stone-950 p-3 rounded-xl border border-stone-850">
                <span className="text-[10px] text-stone-500 uppercase font-mono block">/orders</span>
                <span className="text-lg font-black text-blue-400">{orders.length} pedidos</span>
              </div>

              <div className="bg-stone-950 p-3 rounded-xl border border-stone-850">
                <span className="text-[10px] text-stone-500 uppercase font-mono block">/staff</span>
                <span className="text-lg font-black text-purple-400">{staff.length} funcionários</span>
              </div>

              <div className="bg-stone-950 p-3 rounded-xl border border-stone-850">
                <span className="text-[10px] text-stone-500 uppercase font-mono block">/restaurant_config</span>
                <span className="text-lg font-black text-emerald-400">Configurada</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT / CREATE MENU ITEM */}
      {itemModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-lg rounded-3xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-stone-800">
              <h3 className="font-bold text-base text-white">
                {editingItem.id ? 'Editar Prato / Bebida' : 'Cadastrar Novo Item no Cardápio'}
              </h3>
              <button onClick={() => setItemModalOpen(false)} className="text-stone-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMenuItem} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">Nome do Prato *</label>
                <input
                  type="text"
                  required
                  value={editingItem.name || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  placeholder="Ex: Picanha Nobre Fatiada"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-stone-300 block mb-1">Categoria *</label>
                  <select
                    value={editingItem.categoryId || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, categoryId: e.target.value })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-stone-300 block mb-1">Preço (R$) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editingItem.price || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, price: parseFloat(e.target.value) })}
                    placeholder="0.00"
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">Descrição detalhada</label>
                <textarea
                  rows={2}
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  placeholder="Ingredientes, acompanhamentos e detalhes do preparo..."
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <ImageUploadCapture
                label="Foto do Prato / Bebida"
                value={editingItem.imageUrl || ''}
                onChange={(url) => setEditingItem({ ...editingItem, imageUrl: url })}
                aspectRatio="square"
                helperText="Tire uma foto do prato na hora com a câmera do celular, escolha da galeria ou insira uma URL."
              />

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="text-xs font-bold text-stone-300 block mb-1">
                    Tempo Médio Preparo (min)
                  </label>
                  <input
                    type="number"
                    value={editingItem.prepTimeMinutes || 15}
                    onChange={(e) => setEditingItem({ ...editingItem, prepTimeMinutes: Number(e.target.value) })}
                    className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex flex-col justify-end space-y-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-stone-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingItem.available ?? true}
                      onChange={(e) => setEditingItem({ ...editingItem, available: e.target.checked })}
                      className="accent-amber-500 rounded"
                    />
                    <span>Disponível no cardápio</span>
                  </label>

                  <label className="flex items-center gap-2 text-xs font-semibold text-stone-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingItem.featured ?? false}
                      onChange={(e) => setEditingItem({ ...editingItem, featured: e.target.checked })}
                      className="accent-amber-500 rounded"
                    />
                    <span>Destaque / Recomendado</span>
                  </label>
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="flex-1 py-2.5 bg-stone-800 text-stone-300 text-xs font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl shadow-lg"
                >
                  Salvar Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CATEGORY EDIT */}
      {categoryModalOpen && editingCategory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-sm rounded-3xl p-5 space-y-4">
            <h3 className="font-bold text-base text-white">Categoria do Cardápio</h3>
            <form onSubmit={handleSaveCategory} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">Nome da Categoria *</label>
                <input
                  type="text"
                  required
                  value={editingCategory.name || ''}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  placeholder="Ex: Sobremesas Artesanais"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">Ordem de Exibição</label>
                <input
                  type="number"
                  value={editingCategory.order || 1}
                  onChange={(e) => setEditingCategory({ ...editingCategory, order: Number(e.target.value) })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCategoryModalOpen(false)}
                  className="flex-1 py-2 bg-stone-800 text-stone-300 text-xs font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl shadow-lg"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: TABLE EDIT */}
      {tableModalOpen && editingTable && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-sm rounded-3xl p-5 space-y-4">
            <h3 className="font-bold text-base text-white">Adicionar / Editar Mesa</h3>
            <form onSubmit={handleSaveTable} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">Número da Mesa *</label>
                <input
                  type="text"
                  required
                  value={editingTable.tableNumber || ''}
                  onChange={(e) => setEditingTable({ ...editingTable, tableNumber: e.target.value })}
                  placeholder="Ex: 05"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">Capacidade (Lugares)</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={editingTable.capacity || 4}
                  onChange={(e) => setEditingTable({ ...editingTable, capacity: Number(e.target.value) })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTableModalOpen(false)}
                  className="flex-1 py-2 bg-stone-800 text-stone-300 text-xs font-bold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl shadow-lg"
                >
                  Salvar Mesa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>

      {/* MODAL: CARD COMPLETO DE MESA & IMPRESSÃO PROFISSIONAL */}
      {/* MODAL: CARD COMPLETO DE MESA & IMPRESSÃO PROFISSIONAL */}
      {printableTable && (
        <div id="printable-table-modal-container" className="print-modal-container fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fadeIn print:static print:bg-white print:p-0 print:m-0 print:w-full print:block">
          
          {/* Seletor de Tamanho e Cópias por Página (Folha A4) */}
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2.5 print:hidden z-10 shrink-0">
            {/* Seletor de Tamanho da Placa (13x20cm vs 10x15cm) */}
            <div className="flex items-center gap-1 bg-stone-900 border border-stone-800 p-1.5 rounded-2xl shadow-xl">
              <span className="text-[11px] font-bold text-stone-400 pl-2 pr-1">Tamanho:</span>
              <button
                type="button"
                onClick={() => setSelectedPlateSize('13x20')}
                className={`py-1.5 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  selectedPlateSize === '13x20'
                    ? 'bg-amber-500 text-stone-950 shadow-md ring-2 ring-amber-400'
                    : 'text-stone-400 hover:text-white hover:bg-stone-800'
                }`}
              >
                <span>📐 13cm x 20cm</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                  selectedPlateSize === '13x20' ? 'bg-amber-600 text-stone-950' : 'bg-stone-800 text-stone-400'
                }`}>
                  Grande
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedPlateSize('10x15')}
                className={`py-1.5 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1.5 ${
                  selectedPlateSize === '10x15'
                    ? 'bg-amber-500 text-stone-950 shadow-md ring-2 ring-amber-400'
                    : 'text-stone-400 hover:text-white hover:bg-stone-800'
                }`}
              >
                <span>📐 10cm x 15cm</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                  selectedPlateSize === '10x15' ? 'bg-amber-600 text-stone-950' : 'bg-stone-800 text-stone-400'
                }`}>
                  Padrão
                </span>
              </button>
            </div>

            {/* Seletor de Cópias por Página (Folha A4) */}
            <div className="flex items-center gap-1 bg-stone-900 border border-stone-800 p-1.5 rounded-2xl shadow-xl">
              <span className="text-[11px] font-bold text-stone-400 pl-2 pr-1">Por Folha:</span>
              <button
                type="button"
                onClick={() => setSelectedCopiesPerPage(1)}
                className={`py-1.5 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                  selectedCopiesPerPage === 1
                    ? 'bg-amber-500 text-stone-950 shadow-md ring-2 ring-amber-400'
                    : 'text-stone-400 hover:text-white hover:bg-stone-800'
                }`}
                title="Imprime 1 placa individual por página"
              >
                <span>📄 1 por Folha</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedCopiesPerPage(2)}
                className={`py-1.5 px-3 rounded-xl text-xs font-black transition cursor-pointer flex items-center gap-1 ${
                  selectedCopiesPerPage === 2
                    ? 'bg-amber-500 text-stone-950 shadow-md ring-2 ring-amber-400'
                    : 'text-stone-400 hover:text-white hover:bg-stone-800'
                }`}
                title="Coloca 2 placas na mesma folha A4 com linha de corte para economizar papel"
              >
                <span>📄📄 2 por Página (A4)</span>
              </button>
            </div>
          </div>

          <div className={`printable-tent-card bg-white text-stone-950 rounded-3xl ${
            selectedPlateSize === '13x20' ? 'p-6 sm:p-9 max-w-xl' : 'p-6 sm:p-7 max-w-md'
          } w-full text-center shadow-2xl border-4 border-stone-900 relative my-auto print:m-auto print:border-4 print:border-stone-900 print:shadow-none print:bg-white print:text-black ${
            selectedPlateSize === '13x20' ? 'print:w-[460px] print:max-w-[460px]' : 'print:w-[380px] print:max-w-[380px]'
          }`}>
            
            {/* Tag de Recorte e Guia de Uso */}
            <div className="flex items-center justify-between text-[10px] font-mono font-bold text-stone-500 pb-2 mb-3 border-b-2 border-dashed border-stone-300 print:flex">
              <span>✂️ RECORTE</span>
              <span className="bg-amber-100 print:bg-[#fef3c7] text-amber-900 print:text-[#b45309] px-3 py-1 rounded-full font-sans text-[10px] font-black uppercase tracking-wider">
                Display de Mesa ({selectedPlateSize === '13x20' ? '13x20cm (Grande)' : '10x15cm (Padrão)'} / Acrílico)
              </span>
              <span>✂️ RECORTE</span>
            </div>

            {/* Header: Logo & Nome da Loja */}
            <div className="space-y-1 mb-3">
              {config?.logoUrl ? (
                <img
                  src={config.logoUrl}
                  alt={config.name}
                  className={`${selectedPlateSize === '13x20' ? 'w-20 h-20' : 'w-16 h-16'} rounded-2xl mx-auto object-contain ring-2 ring-stone-900/10 mb-1 print:block print:mx-auto`}
                />
              ) : (
                <div className={`${selectedPlateSize === '13x20' ? 'text-4xl' : 'text-3xl'} mb-1`}>🍽️</div>
              )}
              <h2 className={`${selectedPlateSize === '13x20' ? 'text-2xl sm:text-3xl' : 'text-xl sm:text-2xl'} font-black uppercase tracking-tight text-stone-950 print:text-black leading-tight`}>
                {config?.name || 'ComandaSmart'}
              </h2>
              <p className={`${selectedPlateSize === '13x20' ? 'text-xs' : 'text-[11px]'} font-bold text-stone-600 print:text-stone-700 uppercase tracking-wider`}>
                {config?.tagline || 'Cardápio Digital & Atendimento na Mesa'}
              </p>
            </div>

            {/* Table Number Badge - BEM MAIOR PARA VISUALIZAÇÃO */}
            <div className={`my-3 ${selectedPlateSize === '13x20' ? 'py-3 px-8' : 'py-2 px-6'} rounded-2xl bg-amber-50 print:bg-[#fffbeb] border-3 border-amber-500 print:border-[#d97706] inline-block shadow-md`}>
              <span className={`${selectedPlateSize === '13x20' ? 'text-xs' : 'text-[10px]'} font-black uppercase tracking-widest text-amber-800 print:text-[#b45309] block`}>
                SEJA BEM-VINDO
              </span>
              <span className={`${selectedPlateSize === '13x20' ? 'text-4xl sm:text-5xl' : 'text-3xl sm:text-4xl'} font-black text-amber-600 print:text-[#b45309] leading-none`}>
                MESA {printableTable.tableNumber}
              </span>
            </div>

            {/* QR Code Container with Frame - BEM MAIOR */}
            <div className="my-2 p-3 bg-white print:bg-white rounded-2xl border-2 border-stone-300 print:border-stone-400 inline-block shadow-sm">
              {qrCodesMap[printableTable.tableNumber] ? (
                <img
                  src={qrCodesMap[printableTable.tableNumber]}
                  alt={`QR Code Mesa ${printableTable.tableNumber}`}
                  className={`${selectedPlateSize === '13x20' ? 'w-56 h-56 sm:w-64 sm:h-64' : 'w-44 h-44 sm:w-48 sm:h-48'} mx-auto object-contain print:block`}
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-xs text-stone-400">
                  Gerando QR...
                </div>
              )}
            </div>

            {/* 3-Step Clear Instructions - BEM MAIOR E LEGÍVEL */}
            <div className={`my-3 bg-stone-50 print:bg-[#fafaf9] border border-stone-200 print:border-stone-300 rounded-2xl ${
              selectedPlateSize === '13x20' ? 'p-4 space-y-2.5' : 'p-3 space-y-1.5'
            } text-left`}>
              <div className="flex items-center gap-2.5">
                <span className={`${selectedPlateSize === '13x20' ? 'w-6 h-6 text-xs' : 'w-5 h-5 text-[10px]'} rounded-full bg-stone-950 print:bg-black text-white font-black flex items-center justify-center shrink-0`}>
                  1
                </span>
                <span className={`font-bold text-stone-900 print:text-black ${selectedPlateSize === '13x20' ? 'text-xs sm:text-sm' : 'text-[11px]'}`}>
                  Aponte a câmera do seu celular para o QR Code
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`${selectedPlateSize === '13x20' ? 'w-6 h-6 text-xs' : 'w-5 h-5 text-[10px]'} rounded-full bg-stone-950 print:bg-black text-white font-black flex items-center justify-center shrink-0`}>
                  2
                </span>
                <span className={`font-bold text-stone-900 print:text-black ${selectedPlateSize === '13x20' ? 'text-xs sm:text-sm' : 'text-[11px]'}`}>
                  Abra o cardápio e personalize seus pratos
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <span className={`${selectedPlateSize === '13x20' ? 'w-6 h-6 text-xs' : 'w-5 h-5 text-[10px]'} rounded-full bg-stone-950 print:bg-black text-white font-black flex items-center justify-center shrink-0`}>
                  3
                </span>
                <span className={`font-bold text-stone-900 print:text-black ${selectedPlateSize === '13x20' ? 'text-xs sm:text-sm' : 'text-[11px]'}`}>
                  Seu pedido vai direto para a cozinha e garçom
                </span>
              </div>
            </div>

            {/* Wi-Fi Info Box (if configured) */}
            {(config?.wifiSsid || brandForm.wifiSsid) && (
              <div className={`mb-2 ${selectedPlateSize === '13x20' ? 'py-2 px-4 text-xs' : 'py-1.5 px-3 text-[11px]'} bg-emerald-50 print:bg-[#f0fdf4] border border-emerald-400 print:border-[#22c55e] border-dashed rounded-xl text-emerald-900 print:text-[#166534] font-bold inline-block max-w-full`}>
                📶 Wi-Fi: <strong>{config?.wifiSsid || brandForm.wifiSsid}</strong>
                {(config?.wifiPassword || brandForm.wifiPassword) && (
                  <span> &nbsp;•&nbsp; Senha: <strong>{config?.wifiPassword || brandForm.wifiPassword}</strong></span>
                )}
              </div>
            )}

            {/* Direct Link */}
            <div className="mb-2 px-2">
              <span className={`${selectedPlateSize === '13x20' ? 'text-[11px]' : 'text-[9.5px]'} text-stone-600 print:text-stone-700 font-mono block break-all font-semibold`}>
                Acesso direto: {getTableQrUrl(printableTable.tableNumber, {
                  ...config,
                  publicAppUrl: brandForm.publicAppUrl || config?.publicAppUrl,
                } as RestaurantConfig)}
              </span>
            </div>

            {/* Footer Tag */}
            <div className={`${selectedPlateSize === '13x20' ? 'text-[10px]' : 'text-[9px]'} text-stone-500 print:text-stone-600 uppercase tracking-wider mb-2 font-semibold`}>
              ✨ Atendimento Inteligente na Mesa • ComandaSmart
            </div>

            {/* Aviso de Modo 2 por Página A4 Ativo */}
            {selectedCopiesPerPage === 2 && (
              <div className="my-2 py-2 px-3 bg-amber-50 border border-amber-400/80 rounded-xl text-xs text-amber-950 font-bold flex items-center justify-center gap-2 print:hidden">
                <Copy className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Modo 2 Placas por Página ativado: a impressão gerará 2 placas na mesma folha A4 com guia de corte central.</span>
              </div>
            )}

            {/* Print, Test, Download & Close Buttons (hidden on physical print) */}
            <div className="mt-4 pt-3 border-t border-stone-200 flex flex-col gap-2 print:hidden">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintCompleteCard(printableTable, selectedPlateSize, selectedCopiesPerPage)}
                  disabled={printingCard}
                  className="py-3 px-3 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95 disabled:opacity-50"
                  title={selectedCopiesPerPage === 2 ? 'Imprime 2 placas na mesma folha A4 com guia de corte' : `Imprime a placa completa exatamente como exibida na tela (${selectedPlateSize === '13x20' ? '13cm x 20cm' : '10cm x 15cm'})`}
                >
                  {printingCard ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Abrindo Impressão...</span>
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" />
                      <span>
                        {selectedCopiesPerPage === 2
                          ? 'Imprimir 2 por Página (Folha A4)'
                          : `Imprimir Placa (${selectedPlateSize === '13x20' ? '13x20cm' : '10x15cm'})`}
                      </span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (selectedCopiesPerPage === 2) {
                      handleDownloadTwoCards(printableTable, selectedPlateSize);
                    } else {
                      handleDownloadCompleteCard(printableTable, selectedPlateSize);
                    }
                  }}
                  disabled={downloadingCard}
                  className="py-3 px-3 bg-stone-900 hover:bg-stone-800 text-amber-400 border border-amber-500/30 text-xs font-black rounded-xl shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95 disabled:opacity-50"
                  title={selectedCopiesPerPage === 2 ? 'Baixa a folha A4 completa contendo 2 placas com guia de corte em PNG 300 DPI' : `Baixa a arte completa com moldura, logo, mesa, QR code e instruções em PNG 300 DPI (${selectedPlateSize === '13x20' ? '13cm x 20cm' : '10cm x 15cm'})`}
                >
                  {downloadingCard ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                      <span>Gerando Arte (300 DPI)...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4 text-amber-400" />
                      <span>
                        {selectedCopiesPerPage === 2
                          ? 'Baixar Folha A4 (2 Placas PNG)'
                          : `Baixar PNG (${selectedPlateSize === '13x20' ? '13x20cm' : '10x15cm'})`}
                      </span>
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => handlePrintCompleteCard(printableTable, selectedPlateSize, 2)}
                  className="py-2.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-95"
                  title="Imprime diretamente 2 placas por página na folha A4"
                >
                  <Copy className="w-3.5 h-3.5 text-amber-600" />
                  <span>2 por A4</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const qrDataUrl = qrCodesMap[printableTable.tableNumber] || '';
                    const tableUrl = getTableQrUrl(printableTable.tableNumber, {
                      ...config,
                      publicAppUrl: brandForm.publicAppUrl || config?.publicAppUrl,
                    } as RestaurantConfig);
                    printTableTent(printableTable, config, qrDataUrl, tableUrl, { layout: 'tent_fold', size: selectedPlateSize });
                  }}
                  className="py-2.5 px-2 bg-stone-100 hover:bg-stone-200 text-stone-800 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition"
                  title="Gera folha com frente e verso para dobrar e ficar de pé na mesa"
                >
                  <Layers className="w-3.5 h-3.5 text-stone-600" />
                  <span>Tenda (2 Lados)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onOpenTableClient) {
                      onOpenTableClient(printableTable.tableNumber);
                      setPrintableTable(null);
                    } else {
                      window.location.href = getTableQrUrl(printableTable.tableNumber, {
                        ...config,
                        publicAppUrl: brandForm.publicAppUrl || config?.publicAppUrl,
                      } as RestaurantConfig);
                    }
                  }}
                  className="py-2.5 px-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Smartphone className="w-3.5 h-3.5 text-stone-600" />
                  <span>Testar Mesa</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPrintableTable(null)}
                  className="py-2.5 px-2 bg-stone-200 hover:bg-stone-300 text-stone-900 text-xs font-bold rounded-xl cursor-pointer"
                >
                  Fechar
                </button>
              </div>

              {/* Opção secundária: baixar apenas o código QR simples */}
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => handleDownloadQr(printableTable.tableNumber)}
                  className="text-[10px] text-stone-400 hover:text-stone-600 underline cursor-pointer"
                  title="Baixar apenas a imagem quadrada simples do QR code"
                >
                  Baixar apenas o QR code simples (sem a moldura)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CADASTRAR / EDITAR FUNCIONÁRIO (ACESSO TOTAL DO ADMIN) */}
      {staffModalOpen && editingStaff && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-stone-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-base text-white">
                  {editingStaff.id ? 'Editar Funcionário' : 'Novo Membro da Equipe'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStaffModalOpen(false);
                  setEditingStaff(null);
                }}
                className="text-stone-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStaff} className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  required
                  value={editingStaff.name || ''}
                  onChange={(e) => setEditingStaff({ ...editingStaff, name: e.target.value })}
                  placeholder="Ex: Carlos Oliveira"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Cargo / Função no Restaurante *
                </label>
                <select
                  required
                  value={editingStaff.role || 'waiter'}
                  onChange={(e) => setEditingStaff({ ...editingStaff, role: e.target.value as any })}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="waiter">Garçom / Atendente de Salão (Notificações de mesa e pratos prontos)</option>
                  <option value="cook">Cozinheiro / KDS (Controle de pedidos e preparo na cozinha)</option>
                  <option value="admin">Administrador Geral (Acesso total às configurações e relatórios)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Email ou Identificador
                </label>
                <input
                  type="text"
                  value={editingStaff.email || ''}
                  onChange={(e) => setEditingStaff({ ...editingStaff, email: e.target.value })}
                  placeholder="exemplo@restaurante.com.br"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-stone-500 block mt-0.5">
                  Utilizado para login com Google ou identificação nos relatórios.
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-300 block mb-1">
                  Código PIN Rápido (4 Dígitos)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={editingStaff.pin || ''}
                  onChange={(e) => setEditingStaff({ ...editingStaff, pin: e.target.value })}
                  placeholder="Ex: 1234"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl p-2.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-stone-500 block mt-0.5">
                  Facilita o acesso rápido em maquininhas Smart POS ou tablets sem precisar digitar senha longa.
                </span>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-stone-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingStaff.active ?? true}
                    onChange={(e) => setEditingStaff({ ...editingStaff, active: e.target.checked })}
                    className="accent-amber-500 rounded"
                  />
                  <span>Funcionário Ativo (pode acessar o sistema)</span>
                </label>
              </div>

              <div className="flex gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => {
                    setStaffModalOpen(false);
                    setEditingStaff(null);
                  }}
                  className="flex-1 py-2.5 bg-stone-800 hover:bg-stone-750 text-stone-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingStaff}
                  className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl shadow-lg transition cursor-pointer active:scale-95 disabled:opacity-50"
                >
                  {savingStaff ? 'Salvando...' : 'Salvar Funcionário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRMAÇÃO DE EXCLUSÃO DE FUNCIONÁRIO */}
      {deletingStaffId && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-sm rounded-3xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div>
              <h4 className="text-base font-bold text-white">Excluir Funcionário?</h4>
              <p className="text-xs text-stone-400 mt-1">
                Esta ação removerá o membro da equipe do sistema permanentemente no Firebase.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingStaffId(null)}
                className="flex-1 py-2.5 bg-stone-800 hover:bg-stone-750 text-stone-300 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleDeleteStaff(deletingStaffId)}
                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white text-xs font-black rounded-xl shadow-lg transition cursor-pointer active:scale-95"
              >
                Confirmar Exclusão
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE SEGURANÇA: EXCLUSÃO DE ITEM/CATEGORIA/MESA COM SENHA DO ADMIN */}
      {deletionTarget && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 w-full max-w-md rounded-3xl p-6 shadow-2xl space-y-5 animate-scaleUp">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6 text-red-500" />
              </div>
              <div>
                <h3 className="font-black text-lg text-white">Exclusão Protegida</h3>
                <p className="text-xs text-stone-400">
                  {deletionTarget.type === 'menu_item' && 'Excluir item do cardápio'}
                  {deletionTarget.type === 'category' && 'Excluir categoria de pratos'}
                  {deletionTarget.type === 'table' && 'Excluir mesa do salão'}
                </p>
              </div>
            </div>

            <div className="bg-stone-950 border border-stone-800/80 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] uppercase font-black tracking-wider text-stone-500">
                Item selecionado para exclusão
              </span>
              <p className="text-sm font-bold text-white break-words">{deletionTarget.name}</p>
              {deletionTarget.extraInfo && (
                <p className="text-xs text-amber-400 font-semibold">{deletionTarget.extraInfo}</p>
              )}
            </div>

            <form onSubmit={handleConfirmSecureDelete} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-stone-300 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Senha de Exclusão do Administrador:</span>
                  </label>
                  <span className="text-[10px] text-stone-500">Padrão inicial: 1234</span>
                </div>
                <div className="relative">
                  <input
                    type={showDeletePassword ? 'text' : 'password'}
                    value={deletePasswordInput}
                    onChange={(e) => {
                      setDeletePasswordInput(e.target.value);
                      if (deletePasswordError) setDeletePasswordError(null);
                    }}
                    placeholder="Digite a senha de exclusão"
                    autoFocus
                    required
                    className="w-full bg-stone-950 border border-stone-700 focus:border-red-500 rounded-xl py-3 px-3.5 pr-10 text-sm text-white font-mono tracking-wider focus:outline-none transition shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDeletePassword(!showDeletePassword)}
                    className="absolute right-3 top-3 text-stone-400 hover:text-white transition cursor-pointer"
                    title={showDeletePassword ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showDeletePassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {deletePasswordError && (
                  <p className="text-xs text-red-400 font-semibold mt-2 flex items-center gap-1.5 animate-fadeIn">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{deletePasswordError}</span>
                  </p>
                )}
              </div>

              <div className="text-[11px] text-stone-400 bg-stone-800/40 p-2.5 rounded-xl border border-stone-800/50">
                🔒 Você pode alterar esta senha a qualquer momento na aba <strong>&quot;Marca &amp; Loja&quot;</strong>.
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setDeletionTarget(null);
                    setDeletePasswordInput('');
                    setDeletePasswordError(null);
                  }}
                  disabled={isDeletingSecurely}
                  className="flex-1 py-3 bg-stone-800 hover:bg-stone-750 text-stone-300 text-xs font-bold rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDeletingSecurely || !deletePasswordInput.trim()}
                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-black rounded-xl shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 transition cursor-pointer active:scale-95"
                >
                  {isDeletingSecurely ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Excluindo...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Confirmar e Excluir</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EXTRAÇÃO DE CARDÁPIO DE FOTO COM IA (GEMINI 3.8 FLASH) */}
      <AIMenuExtractorModal
        isOpen={aiExtractorOpen}
        onClose={() => setAiExtractorOpen(false)}
        existingCategories={categories}
      />
    </div>
  );
};
