import React, { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, Link as LinkIcon, Trash2, RefreshCw, Check, UploadCloud, Video, X } from 'lucide-react';

interface ImageUploadCaptureProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  helperText?: string;
  placeholder?: string;
  aspectRatio?: 'square' | 'video' | 'auto';
  maxDimension?: number;
}

/**
 * Compresses an image file or bitmap to a lightweight data URL
 */
export async function compressImage(file: File, maxDim = 850, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
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
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        // Convert to high-efficiency JPEG
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };
      img.onerror = () => reject(new Error('Erro ao carregar a imagem para processamento.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo da foto.'));
    reader.readAsDataURL(file);
  });
}

export const ImageUploadCapture: React.FC<ImageUploadCaptureProps> = ({
  value,
  onChange,
  label,
  helperText,
  placeholder = 'https://...',
  aspectRatio = 'square',
  maxDimension = 850,
}) => {
  const [mode, setMode] = useState<'upload' | 'url'>('upload');
  const [urlInput, setUrlInput] = useState(value);
  const [compressing, setCompressing] = useState(false);
  const [liveCameraOpen, setLiveCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setCompressing(true);
      const dataUrl = await compressImage(file, maxDimension);
      onChange(dataUrl);
      setUrlInput(dataUrl);
    } catch (err) {
      console.error('Falha ao processar foto:', err);
      alert('Não foi possível processar a foto selecionada.');
    } finally {
      setCompressing(false);
      // Reset input value to allow re-selecting same file
      if (e.target) e.target.value = '';
    }
  };

  // Live in-browser camera for desktop / laptop webcam
  const startLiveWebcam = async () => {
    setCameraError(null);
    setLiveCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.warn('Webcam stream not accessible or declined:', err);
      setCameraError('Câmera direta indisponível. Utilize o botão "Tirar Foto no Celular".');
    }
  };

  const captureLiveWebcamPhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      onChange(dataUrl);
      setUrlInput(dataUrl);
    }
    stopLiveWebcam();
  };

  const stopLiveWebcam = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setLiveCameraOpen(false);
    setCameraError(null);
  };

  const handleUrlSubmit = () => {
    onChange(urlInput.trim());
  };

  const handleClear = () => {
    onChange('');
    setUrlInput('');
  };

  const isDataUrl = value?.startsWith('data:image');
  const previewRatioClass =
    aspectRatio === 'square' ? 'w-20 h-20' : aspectRatio === 'video' ? 'w-32 h-20' : 'w-24 h-24';

  return (
    <div className="space-y-2">
      {/* Hidden standard file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      {/* Native mobile camera capture */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {label && (
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-stone-300 block">{label}</label>
          <div className="flex items-center gap-1 text-[11px]">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className={`px-2 py-0.5 rounded-lg font-semibold transition ${
                mode === 'upload' ? 'bg-amber-500/20 text-amber-400' : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              Foto / Câmera
            </button>
            <span className="text-stone-700">|</span>
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`px-2 py-0.5 rounded-lg font-semibold transition ${
                mode === 'url' ? 'bg-amber-500/20 text-amber-400' : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              URL Externa
            </button>
          </div>
        </div>
      )}

      {/* Main container */}
      <div className="bg-stone-950 border border-stone-800 rounded-2xl p-3 space-y-3">
        <div className="flex items-center gap-3">
          {/* Thumbnail preview */}
          <div
            className={`${previewRatioClass} rounded-xl bg-stone-900 border border-stone-800 overflow-hidden shrink-0 flex items-center justify-center relative group shadow-inner`}
          >
            {compressing ? (
              <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
            ) : value ? (
              <>
                <img src={value} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-400 transition"
                  title="Remover foto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            ) : (
              <ImageIcon className="w-6 h-6 text-stone-700" />
            )}
          </div>

          {/* Action buttons */}
          <div className="flex-1 space-y-2">
            {mode === 'upload' ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {/* Tirar Foto (Câmera Mobile) */}
                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={compressing}
                    className="py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl flex items-center gap-1.5 transition active:scale-95 shadow cursor-pointer"
                    title="Abre a câmera do celular para tirar uma nova foto agora"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Tirar Foto (Câmera)</span>
                  </button>

                  {/* Escolher da Galeria / Arquivos */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={compressing}
                    className="py-1.5 px-3 bg-stone-800 hover:bg-stone-750 text-stone-200 hover:text-white border border-stone-700 font-bold text-xs rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                    <span>Galeria / Arquivo</span>
                  </button>

                  {/* Optional Live Webcam Viewfinder */}
                  <button
                    type="button"
                    onClick={startLiveWebcam}
                    className="py-1.5 px-2 bg-stone-900 hover:bg-stone-850 text-stone-400 hover:text-stone-200 border border-stone-800 rounded-xl text-xs flex items-center gap-1 transition"
                    title="Abrir visor da webcam ao vivo"
                  >
                    <Video className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[10px] text-stone-500">
                  {isDataUrl
                    ? 'Foto compactada e pronta para sincronização rápida.'
                    : 'A foto é ajustada automaticamente para carregar instantaneamente nos celulares.'}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-2.5 py-1.5 text-xs text-stone-200 focus:outline-none focus:border-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleUrlSubmit}
                    className="py-1.5 px-3 bg-amber-500 hover:bg-amber-400 text-stone-950 font-bold text-xs rounded-xl transition cursor-pointer"
                  >
                    Aplicar
                  </button>
                </div>
                <p className="text-[10px] text-stone-500">
                  Cole uma URL pública de imagem (Unsplash, CDN ou seu site).
                </p>
              </div>
            )}
          </div>
        </div>

        {value && (
          <div className="pt-2 border-t border-stone-900 flex items-center justify-between text-[11px] text-stone-400">
            <span className="flex items-center gap-1 text-emerald-400">
              <Check className="w-3 h-3" />
              <span>{isDataUrl ? 'Imagem capturada do dispositivo' : 'URL de imagem vinculada'}</span>
            </span>
            <button
              type="button"
              onClick={handleClear}
              className="text-stone-500 hover:text-red-400 transition text-[10px]"
            >
              Remover imagem
            </button>
          </div>
        )}
      </div>

      {helperText && <p className="text-[11px] text-stone-500">{helperText}</p>}

      {/* Live Webcam Modal */}
      {liveCameraOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 max-w-md w-full space-y-4 text-center">
            <div className="flex items-center justify-between border-b border-stone-800 pb-2">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Camera className="w-4 h-4 text-amber-400" />
                <span>Visor da Câmera</span>
              </h4>
              <button onClick={stopLiveWebcam} className="text-stone-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {cameraError ? (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs rounded-2xl space-y-3">
                <p>{cameraError}</p>
                <button
                  onClick={() => {
                    stopLiveWebcam();
                    cameraInputRef.current?.click();
                  }}
                  className="py-2 px-4 bg-amber-500 text-stone-950 font-bold text-xs rounded-xl"
                >
                  Abrir Câmera do Sistema
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden bg-black aspect-video border border-stone-800">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={stopLiveWebcam}
                    className="py-2 px-4 bg-stone-800 text-stone-300 font-bold text-xs rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={captureLiveWebcamPhoto}
                    className="py-2.5 px-6 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl flex items-center gap-2 shadow-lg"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Capturar Foto</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
