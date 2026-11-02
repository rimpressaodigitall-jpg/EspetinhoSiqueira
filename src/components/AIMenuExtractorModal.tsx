import React, { useState } from 'react';
import { 
  Sparkles, 
  Camera, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Loader2, 
  Check, 
  Plus, 
  Trash2, 
  RefreshCw,
  RotateCw,
  UtensilsCrossed,
  DollarSign,
  Clock,
  Image as ImageIcon
} from 'lucide-react';
import { Category, MenuItem } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { compressImage } from './ImageUploadCapture';

interface AIMenuExtractorModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingCategories: Category[];
  onImportComplete?: () => void;
}

interface ExtractedItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  prepTimeMinutes: number;
  imageUrl?: string;
  selected: boolean;
}

export const AIMenuExtractorModal: React.FC<AIMenuExtractorModalProps> = ({
  isOpen,
  onClose,
  existingCategories,
  onImportComplete,
}) => {
  const [photoBase64, setPhotoBase64] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [extractedCategories, setExtractedCategories] = useState<string[]>([]);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [step, setStep] = useState<'upload' | 'review'>('upload');

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);

  // References and states for individual item photo selection (local files & mobile camera)
  const itemFileInputRef = React.useRef<HTMLInputElement>(null);
  const itemCameraInputRef = React.useRef<HTMLInputElement>(null);
  const [activePhotoItemId, setActivePhotoItemId] = useState<string | null>(null);
  const [compressingItemId, setCompressingItemId] = useState<string | null>(null);
  const [editingUrlItemId, setEditingUrlItemId] = useState<string | null>(null);

  if (!isOpen) return null;

  // Compress image to fast base64 with high OCR resolution
  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1600; // Crisp resolution for small print, multi-column and price OCR
        let width = img.width;
        let height = img.height;

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
          setPhotoBase64(dataUrl);
          setErrorMsg(null);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Rotate photo 90 degrees clockwise (useful for mobile photos taken sideways)
  const rotatePhoto90 = () => {
    if (!photoBase64) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.height;
      canvas.height = img.width;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate((90 * Math.PI) / 180);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        const rotatedUrl = canvas.toDataURL('image/jpeg', 0.90);
        setPhotoBase64(rotatedUrl);
      }
    };
    img.src = photoBase64;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  // Call Server-side Gemini AI extraction
  const handleAnalyzePhoto = async () => {
    if (!photoBase64) {
      setErrorMsg('Tire ou escolha uma foto do cardápio primeiro.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/ai/extract-menu', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageBase64: photoBase64,
          mimeType: 'image/jpeg',
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error || json.message || 'Falha ao analisar a foto do cardápio.');
      }

      const data = json.data;
      const categories: string[] = Array.isArray(data.categories) && data.categories.length > 0 
        ? data.categories 
        : ['Pratos Principais', 'Bebidas'];
      const rawItems: any[] = Array.isArray(data.items) ? data.items : [];

      if (rawItems.length === 0) {
        throw new Error('Nenhum item de cardápio foi reconhecido nesta foto. Verifique se o cardápio está bem iluminado e nítido.');
      }

      const formattedItems: ExtractedItem[] = rawItems.map((item, idx) => {
        let priceNum = typeof item.price === 'number' && !isNaN(item.price) ? item.price : 0;
        if (typeof item.price === 'string') {
          const cleaned = item.price.replace(/[^0-9,.]/g, '').replace(',', '.');
          priceNum = parseFloat(cleaned) || 0;
        }

        return {
          id: `extracted_${Date.now()}_${idx}`,
          name: String(item.name || 'Prato sem nome').trim(),
          description: String(item.description || '').trim(),
          price: Number(priceNum.toFixed(2)),
          category: String(item.category || categories[0] || 'Pratos Principais').trim(),
          prepTimeMinutes: typeof item.prepTimeMinutes === 'number' ? item.prepTimeMinutes : 15,
          imageUrl: item.imageUrl || '',
          selected: true,
        };
      });

      setExtractedCategories(categories);
      setExtractedItems(formattedItems);
      setStep('review');
    } catch (err: any) {
      console.error('Erro na análise da IA:', err);
      setErrorMsg(err.message || 'Erro ao processar imagem com a inteligência artificial.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddNewItem = () => {
    const newItem: ExtractedItem = {
      id: `extracted_manual_${Date.now()}`,
      name: 'Novo Prato / Bebida',
      description: '',
      price: 0,
      category: extractedCategories[0] || 'Pratos Principais',
      prepTimeMinutes: 15,
      imageUrl: '',
      selected: true,
    };
    setExtractedItems((prev) => [newItem, ...prev]);
  };

  const handleToggleSelectAll = (select: boolean) => {
    setExtractedItems((prev) => prev.map((item) => ({ ...item, selected: select })));
  };

  const handleUpdateItem = (id: string, field: keyof ExtractedItem, value: any) => {
    setExtractedItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleDeleteItem = (id: string) => {
    setExtractedItems((prev) => prev.filter((item) => item.id !== id));
  };

  // Trigger camera or local gallery selection for an individual item
  const triggerItemCamera = (itemId: string) => {
    setActivePhotoItemId(itemId);
    itemCameraInputRef.current?.click();
  };

  const triggerItemGallery = (itemId: string) => {
    setActivePhotoItemId(itemId);
    itemFileInputRef.current?.click();
  };

  const handleItemPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activePhotoItemId) return;

    const targetId = activePhotoItemId;
    setCompressingItemId(targetId);
    try {
      const dataUrl = await compressImage(file, 850, 0.82);
      handleUpdateItem(targetId, 'imageUrl', dataUrl);
    } catch (err) {
      console.error('Erro ao carregar foto do prato:', err);
      setErrorMsg('Não foi possível processar a foto do prato.');
    } finally {
      setCompressingItemId(null);
      if (e.target) e.target.value = '';
    }
  };

  // Import into Firestore
  const handleConfirmImport = async () => {
    const selectedItems = extractedItems.filter((i) => i.selected);
    if (selectedItems.length === 0) {
      setErrorMsg('Selecione pelo menos um item para importar.');
      return;
    }

    setIsImporting(true);
    setErrorMsg(null);

    try {
      // 1. Map or create categories
      const categoryMap = new Map<string, string>(); // categoryName -> categoryId
      existingCategories.forEach((c) => categoryMap.set(c.name.toLowerCase().trim(), c.id));

      const distinctCategories = Array.from(new Set(selectedItems.map((i) => i.category.trim())));

      let orderCounter = existingCategories.length;
      for (const catName of distinctCategories) {
        const lower = catName.toLowerCase().trim();
        if (!categoryMap.has(lower)) {
          const newCatId = `cat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          await setDoc(doc(db, 'categories', newCatId), {
            id: newCatId,
            name: catName,
            order: orderCounter++,
            active: true,
            updatedAt: new Date().toISOString(),
          });
          categoryMap.set(lower, newCatId);
        }
      }

      // 2. Insert menu items
      for (const item of selectedItems) {
        const catId = categoryMap.get(item.category.toLowerCase().trim()) || existingCategories[0]?.id || 'cat_default';
        const itemId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        await setDoc(doc(db, 'menu_items', itemId), {
          id: itemId,
          categoryId: catId,
          name: item.name,
          description: item.description,
          price: item.price,
          imageUrl: item.imageUrl?.trim() || 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80',
          available: true,
          prepTimeMinutes: item.prepTimeMinutes,
          featured: false,
          updatedAt: new Date().toISOString(),
        });
      }

      setSuccessMsg(`Sucesso! ${selectedItems.length} pratos foram adicionados ao cardápio com suas categorias.`);
      if (onImportComplete) {
        onImportComplete();
      }

      setTimeout(() => {
        onClose();
        // Reset state
        setPhotoBase64('');
        setExtractedItems([]);
        setStep('upload');
        setSuccessMsg(null);
      }, 2000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'importAIMenuItems');
      setErrorMsg('Erro ao salvar os novos itens no banco de dados.');
    } finally {
      setIsImporting(false);
    }
  };

  const selectedCount = extractedItems.filter((i) => i.selected).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-fadeIn">
      <div className="bg-stone-900 border border-stone-800 w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 border-b border-stone-800 flex items-center justify-between bg-stone-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="font-black text-base text-white flex items-center gap-2">
                <span>Copiar Cardápio de Foto com IA</span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Google Gemini IA
                </span>
              </h3>
              <p className="text-xs text-stone-400">
                Tire uma foto do cardápio físico ou lousa e a IA cadastra todos os pratos automaticamente
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-stone-800 text-stone-400 hover:text-white flex items-center justify-center transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden inputs for camera & gallery (menu scan) */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Hidden inputs for individual item photo selection (local files & mobile camera) */}
        <input
          ref={itemFileInputRef}
          type="file"
          accept="image/*"
          onChange={handleItemPhotoChange}
          className="hidden"
        />
        <input
          ref={itemCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleItemPhotoChange}
          className="hidden"
        />

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 text-red-300 rounded-2xl text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
              {photoBase64 && !isAnalyzing && (
                <button
                  type="button"
                  onClick={handleAnalyzePhoto}
                  className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded-lg font-bold text-[11px] shrink-0 transition"
                >
                  Tentar Novamente
                </button>
              )}
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 rounded-2xl text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {step === 'upload' && (
            <div className="space-y-6">
              {/* Photo Area */}
              <div className="border-2 border-dashed border-stone-800 hover:border-amber-500/50 rounded-3xl p-6 text-center transition bg-stone-950/60">
                {photoBase64 ? (
                  <div className="space-y-4">
                    <div className="max-h-64 max-w-sm mx-auto overflow-hidden rounded-2xl border border-stone-800 shadow-lg bg-black/40">
                      <img
                        src={photoBase64}
                        alt="Cardápio para análise"
                        className="w-full h-auto object-contain max-h-64 mx-auto"
                      />
                    </div>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={rotatePhoto90}
                        className="py-1.5 px-3 bg-stone-800 hover:bg-stone-750 text-stone-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                        title="Girar foto 90 graus no sentido horário"
                      >
                        <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                        <span>Girar 90°</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="py-1.5 px-3 bg-stone-800 hover:bg-stone-750 text-stone-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-amber-400" />
                        <span>Tirar Outra Foto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="py-1.5 px-3 bg-stone-800 hover:bg-stone-750 text-stone-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                      >
                        <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                        <span>Escolher Arquivo</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-4">
                    <div className="w-16 h-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                      <Camera className="w-8 h-8" />
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-white">Capture ou selecione a foto do cardápio</h4>
                      <p className="text-xs text-stone-400 max-w-md mx-auto mt-1">
                        Pode ser um cardápio impresso de mesa, folheto, lousa de parede ou foto salva na sua galeria.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="py-2.5 px-5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-2 cursor-pointer transition active:scale-95"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Tirar Foto com a Câmera</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="py-2.5 px-5 bg-stone-800 hover:bg-stone-750 text-white font-bold text-xs rounded-xl border border-stone-700 flex items-center gap-2 cursor-pointer transition"
                      >
                        <UploadCloud className="w-4 h-4 text-amber-400" />
                        <span>Escolher da Galeria</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Instructions banner */}
              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850 space-y-2">
                <h5 className="text-xs font-bold text-stone-200 flex items-center gap-1.5">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
                  <span>Dicas para melhor leitura da Inteligência Artificial:</span>
                </h5>
                <ul className="text-[11px] text-stone-400 space-y-1 list-disc list-inside">
                  <li>Mantenha a câmera firme e com iluminação adequada sobre o cardápio.</li>
                  <li>Se a foto foi tirada na horizontal, use o botão <strong>Girar 90°</strong> para alinhá-la na vertical.</li>
                  <li>A IA identifica automaticamente os nomes dos pratos, preços em Reais (R$) e categorias.</li>
                  <li>Você poderá revisar e editar valores ou nomes antes de salvar no sistema.</li>
                </ul>
              </div>

              {/* Action Button */}
              {photoBase64 && (
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleAnalyzePhoto}
                    disabled={isAnalyzing}
                    className="w-full sm:w-auto py-3 px-8 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-stone-950 font-black text-sm rounded-2xl shadow-xl flex items-center justify-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin text-stone-950" />
                        <span>Processando com Gemini IA...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-stone-950" />
                        <span>Analisar Cardápio com IA</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {step === 'review' && (
            <div className="space-y-4">
              {/* Summary toolbar */}
              <div className="bg-stone-950 p-4 rounded-2xl border border-stone-850 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>{extractedItems.length} pratos identificados</span>
                  </h4>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    Revise os nomes, valores e categorias antes de importar para o cardápio oficial.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddNewItem}
                    className="text-[11px] px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-stone-950 rounded-lg font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Adicionar Prato</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(true)}
                    className="text-[11px] px-2.5 py-1 bg-stone-800 hover:bg-stone-750 text-stone-300 rounded-lg font-semibold transition"
                  >
                    Marcar Todos
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(false)}
                    className="text-[11px] px-2.5 py-1 bg-stone-800 hover:bg-stone-750 text-stone-300 rounded-lg font-semibold transition"
                  >
                    Desmarcar
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('upload')}
                    className="text-[11px] px-2.5 py-1 bg-stone-900 text-stone-400 hover:text-white rounded-lg transition"
                  >
                    Trocar Foto
                  </button>
                </div>
              </div>

              {/* List of Extracted Items */}
              <div className="space-y-2.5 max-h-[48vh] overflow-y-auto pr-1">
                {extractedItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border transition ${
                      item.selected
                        ? 'bg-stone-950/80 border-stone-700/80'
                        : 'bg-stone-950/30 border-stone-850 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) => handleUpdateItem(item.id, 'selected', e.target.checked)}
                        className="mt-1.5 w-4 h-4 accent-amber-500 rounded cursor-pointer"
                      />

                      <div className="flex-1 space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                          {/* Name */}
                          <div className="sm:col-span-6">
                            <input
                              type="text"
                              value={item.name}
                              onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                              placeholder="Nome do prato"
                              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          {/* Category */}
                          <div className="sm:col-span-3">
                            <input
                              type="text"
                              value={item.category}
                              onChange={(e) => handleUpdateItem(item.id, 'category', e.target.value)}
                              placeholder="Categoria"
                              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-amber-400 font-semibold focus:outline-none focus:border-amber-500"
                            />
                          </div>

                          {/* Price */}
                          <div className="sm:col-span-3">
                            <div className="relative">
                              <span className="absolute left-2.5 top-1.5 text-xs text-stone-500 font-bold">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                value={item.price}
                                onChange={(e) =>
                                  handleUpdateItem(item.id, 'price', parseFloat(e.target.value) || 0)
                                }
                                placeholder="0.00"
                                className="w-full bg-stone-900 border border-stone-800 rounded-xl pl-8 pr-2 py-1.5 text-xs text-emerald-400 font-mono font-bold focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <div>
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => handleUpdateItem(item.id, 'description', e.target.value)}
                            placeholder="Descrição dos ingredientes ou acompanhamentos..."
                            className="w-full bg-stone-900/60 border border-stone-800/80 rounded-xl px-2.5 py-1.5 text-[11px] text-stone-300 focus:outline-none focus:border-amber-500"
                          />
                        </div>

                        {/* Campo para Colocar Foto (Arquivo Local ou Câmera do Celular) */}
                        <div className="pt-2 border-t border-stone-800/80 flex flex-wrap items-center gap-3">
                          {/* Thumbnail / Visualizador da Foto */}
                          <div className="w-14 h-14 rounded-xl bg-stone-900 border border-stone-800 overflow-hidden shrink-0 flex items-center justify-center relative group shadow-inner">
                            {compressingItemId === item.id ? (
                              <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
                            ) : item.imageUrl ? (
                              <>
                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItem(item.id, 'imageUrl', '')}
                                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-400 transition"
                                  title="Remover foto"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <ImageIcon className="w-5 h-5 text-stone-600" />
                            )}
                          </div>

                          {/* Controles de Ação de Foto */}
                          <div className="flex-1 min-w-[200px] space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-bold text-stone-300 flex items-center gap-1.5">
                                <Camera className="w-3.5 h-3.5 text-amber-400" />
                                <span>Foto do Prato:</span>
                              </span>
                              {item.imageUrl && (
                                <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-semibold">
                                  <Check className="w-3 h-3" /> Foto anexada
                                </span>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5">
                              {/* Tirar Foto na Câmera do Celular */}
                              <button
                                type="button"
                                onClick={() => triggerItemCamera(item.id)}
                                disabled={compressingItemId === item.id}
                                className="py-1 px-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-[11px] rounded-lg flex items-center gap-1 transition active:scale-95 cursor-pointer disabled:opacity-50"
                                title="Abrir a câmera do celular para fotografar este prato"
                              >
                                <Camera className="w-3 h-3 text-amber-400" />
                                <span>Câmera do Celular</span>
                              </button>

                              {/* Escolher da Galeria / Arquivos Locais */}
                              <button
                                type="button"
                                onClick={() => triggerItemGallery(item.id)}
                                disabled={compressingItemId === item.id}
                                className="py-1 px-2.5 bg-stone-900 hover:bg-stone-850 border border-stone-800 text-stone-300 hover:text-white font-semibold text-[11px] rounded-lg flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                                title="Escolher foto da galeria do aparelho ou computador"
                              >
                                <UploadCloud className="w-3 h-3 text-stone-400" />
                                <span>Galeria / Arquivo</span>
                              </button>

                              {/* URL Link Toggle */}
                              <button
                                type="button"
                                onClick={() => setEditingUrlItemId(editingUrlItemId === item.id ? null : item.id)}
                                className="py-1 px-1.5 text-[10px] text-stone-400 hover:text-stone-200 underline cursor-pointer"
                              >
                                {editingUrlItemId === item.id ? 'Fechar Link' : 'Colar Link'}
                              </button>

                              {item.imageUrl && (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItem(item.id, 'imageUrl', '')}
                                  className="py-1 px-1.5 text-[10px] text-stone-500 hover:text-red-400 transition cursor-pointer"
                                  title="Remover foto"
                                >
                                  Remover
                                </button>
                              )}
                            </div>

                            {/* Campo de URL Opcional */}
                            {editingUrlItemId === item.id && (
                              <div className="flex items-center gap-1.5 pt-1 animate-fadeIn">
                                <input
                                  type="url"
                                  value={item.imageUrl || ''}
                                  onChange={(e) => handleUpdateItem(item.id, 'imageUrl', e.target.value)}
                                  placeholder="https://exemplo.com/foto.jpg"
                                  className="flex-1 bg-stone-900 border border-stone-800 rounded-lg px-2 py-1 text-[11px] text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
                                />
                                <button
                                  type="button"
                                  onClick={() => setEditingUrlItemId(null)}
                                  className="px-2 py-1 bg-stone-800 hover:bg-stone-700 text-stone-200 text-[11px] rounded-lg"
                                >
                                  OK
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Delete item button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 text-stone-500 hover:text-red-400 rounded-lg hover:bg-stone-800 transition"
                        title="Remover item da importação"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-stone-800 bg-stone-950 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-stone-400">
            {step === 'review' && (
              <span>
                <strong className="text-white font-bold">{selectedCount}</strong> de {extractedItems.length} pratos selecionados
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="py-2.5 px-4 bg-stone-800 hover:bg-stone-750 text-stone-300 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              Cancelar
            </button>

            {step === 'review' && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting || selectedCount === 0}
                className="py-2.5 px-6 bg-amber-500 hover:bg-amber-400 text-stone-950 text-xs font-black rounded-xl shadow-lg flex items-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Importando para o Cardápio...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    <span>Importar {selectedCount} Itens para o Cardápio</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
