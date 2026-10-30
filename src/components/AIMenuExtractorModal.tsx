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
  UtensilsCrossed,
  DollarSign,
  Clock
} from 'lucide-react';
import { Category, MenuItem } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

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

  if (!isOpen) return null;

  // Compress image to fast base64
  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 1200; // Good resolution for OCR and text reading
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
          const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
          setPhotoBase64(dataUrl);
          setErrorMsg(null);
        }
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
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
      const categories: string[] = Array.isArray(data.categories) ? data.categories : [];
      const rawItems: any[] = Array.isArray(data.items) ? data.items : [];

      if (rawItems.length === 0) {
        throw new Error('Nenhum item de cardápio foi reconhecido nesta foto. Tente uma foto mais aproximada e iluminada.');
      }

      const formattedItems: ExtractedItem[] = rawItems.map((item, idx) => ({
        id: `extracted_${Date.now()}_${idx}`,
        name: String(item.name || 'Prato sem nome').trim(),
        description: String(item.description || '').trim(),
        price: typeof item.price === 'number' && !isNaN(item.price) ? item.price : 0,
        category: String(item.category || categories[0] || 'Geral').trim(),
        prepTimeMinutes: typeof item.prepTimeMinutes === 'number' ? item.prepTimeMinutes : 15,
        selected: true,
      }));

      setExtractedCategories(categories.length > 0 ? categories : ['Pratos Principais', 'Bebidas']);
      setExtractedItems(formattedItems);
      setStep('review');
    } catch (err: any) {
      console.error('Erro na análise da IA:', err);
      setErrorMsg(err.message || 'Erro ao processar imagem com a inteligência artificial.');
    } finally {
      setIsAnalyzing(false);
    }
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
          imageUrl: '', // default empty, user can attach photo afterwards
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
                  Gemini 3.8
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

        {/* Hidden inputs for camera & gallery */}
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

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 text-red-300 rounded-2xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
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
                    <div className="max-h-64 max-w-sm mx-auto overflow-hidden rounded-2xl border border-stone-800 shadow-lg">
                      <img
                        src={photoBase64}
                        alt="Cardápio para análise"
                        className="w-full h-auto object-contain max-h-64"
                      />
                    </div>
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="py-1.5 px-3 bg-stone-800 hover:bg-stone-750 text-stone-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
                      >
                        <Camera className="w-3.5 h-3.5 text-amber-400" />
                        <span>Tirar Outra Foto</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="py-1.5 px-3 bg-stone-800 hover:bg-stone-750 text-stone-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
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
                  <li>Mantenha a câmera estável e com boa iluminação.</li>
                  <li>Certifique-se de que os nomes dos pratos e preços estejam legíveis.</li>
                  <li>A IA detecta categorias, ingredientes e preços em Reais (R$) automaticamente.</li>
                  <li>Você poderá revisar e editar todos os itens antes de salvar.</li>
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

                <div className="flex items-center gap-2">
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
