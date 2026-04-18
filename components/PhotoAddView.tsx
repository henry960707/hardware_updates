import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera, X, RefreshCw, Sparkles, CheckCircle2,
  AlertCircle, RotateCcw, Save, ChevronRight, Package
} from 'lucide-react';
import { Product, AiProductResult } from '../types';
import { GeminiInventoryService } from '../services/geminiService';

interface PhotoAddViewProps {
  onSave: (product: Product) => void;
  onCancel: () => void;
  generateId: () => string;
}

type PhotoStep = 'camera' | 'preview' | 'analyzing' | 'confirm' | 'error';

const PhotoAddView: React.FC<PhotoAddViewProps> = ({ onSave, onCancel, generateId }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [step, setStep] = useState<PhotoStep>('camera');
  const [capturedImage, setCapturedImage] = useState<string>(''); // data URL
  const [aiResult, setAiResult] = useState<AiProductResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [cameraError, setCameraError] = useState('');

  // 表單欄位（可讓使用者修改 AI 辨識結果）
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [cost, setCost] = useState(0);
  const [price, setPrice] = useState(0);
  const [stock, setStock] = useState(1);

  // 啟動相機
  const startCamera = useCallback(async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: any) {
      const msg = err?.toString() || '';
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setCameraError('請允許相機權限後重新整理。');
      } else if (!window.isSecureContext) {
        setCameraError('需要 HTTPS 連線才能使用相機。');
      } else {
        setCameraError('找不到相機，或相機已被其他應用程式佔用。');
      }
    }
  }, []);

  // 關閉相機串流
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // 拍照
  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    stopCamera();
    setStep('preview');

    if ('vibrate' in navigator) navigator.vibrate([50, 30, 50]);
  };

  // 送 AI 辨識
  const analyzePhoto = async () => {
    setStep('analyzing');
    try {
      const service = new GeminiInventoryService();
      // 移除 data:image/jpeg;base64, 前綴
      const base64 = capturedImage.split(',')[1];
      const result = await service.identifyProductFromPhoto(base64);
      setAiResult(result);
      setName(result.name);
      setCategory(result.category);
      setCost(result.estimatedCost);
      setPrice(result.estimatedPrice);
      setStep('confirm');
    } catch (err: any) {
      setErrorMsg(err?.message || 'AI 辨識失敗，請重試。');
      setStep('error');
    }
  };

  // 重拍
  const retake = () => {
    setCapturedImage('');
    setAiResult(null);
    setStep('camera');
    startCamera();
  };

  // 儲存商品
  const handleSave = () => {
    if (!name.trim()) return;
    const product: Product = {
      id: generateId(),
      name: name.trim(),
      category: category || '五金零件',
      supplier: '-',
      purchaseDate: new Date().toISOString().split('T')[0],
      cost,
      price,
      stock,
      minStock: 5,
      description: aiResult?.description,
      imageBase64: capturedImage,
    };
    onSave(product);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom-4">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <Camera className="text-violet-600" size={36} /> 拍照辨識新增
          </h2>
          <p className="text-slate-500 font-bold mt-1">
            {step === 'camera' && '對準商品拍照，AI 自動幫你填寫資料'}
            {step === 'preview' && '確認照片後，點擊「AI 辨識商品」'}
            {step === 'analyzing' && 'AI 正在辨識中，請稍候...'}
            {step === 'confirm' && 'AI 辨識完成！確認或修改後儲存'}
            {step === 'error' && '辨識發生錯誤'}
          </p>
        </div>
        <button onClick={onCancel} className="p-3 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-2xl transition-all">
          <X size={28} />
        </button>
      </header>

      {/* 步驟指示 */}
      <div className="flex items-center gap-3">
        {['拍照', 'AI辨識', '確認儲存'].map((label, i) => {
          const stepIndex = step === 'camera' ? 0 : step === 'preview' ? 0 : step === 'analyzing' ? 1 : 2;
          const isError = step === 'error';
          const active = i <= stepIndex;
          return (
            <React.Fragment key={label}>
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-black transition-all ${active && !isError ? 'bg-violet-600 text-white' : isError && i === 1 ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                <span>{i + 1}</span>
                <span>{label}</span>
              </div>
              {i < 2 && <ChevronRight size={16} className="text-slate-300 flex-shrink-0" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* 主畫面 */}
      <div className="bg-white rounded-[48px] border-4 border-slate-100 overflow-hidden shadow-sm">

        {/* ── 相機畫面 ── */}
        {step === 'camera' && (
          <div className="space-y-0">
            <div className="relative bg-slate-900 aspect-[4/3] flex items-center justify-center overflow-hidden">
              {cameraError ? (
                <div className="flex flex-col items-center gap-4 text-center p-10">
                  <AlertCircle size={48} className="text-red-400" />
                  <p className="text-white font-bold">{cameraError}</p>
                  <button onClick={startCamera} className="px-6 py-3 bg-violet-600 text-white rounded-2xl font-black">重試</button>
                </div>
              ) : (
                <>
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                  {/* 取景框提示 */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-64 h-64 border-4 border-violet-400/60 rounded-3xl relative">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-violet-400 rounded-tl-2xl" />
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-violet-400 rounded-tr-2xl" />
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-violet-400 rounded-bl-2xl" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-violet-400 rounded-br-2xl" />
                      <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-violet-400/50 -translate-y-1/2 animate-pulse" />
                    </div>
                  </div>
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
                    <p className="text-white/70 text-sm font-bold bg-black/40 px-4 py-1 rounded-full">
                      將商品放入框內
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="p-8 flex justify-center">
              <button
                onClick={capturePhoto}
                disabled={!!cameraError}
                className="w-24 h-24 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-2xl shadow-violet-600/40 hover:bg-violet-700 active:scale-95 transition-all disabled:opacity-30 border-4 border-violet-400/30"
              >
                <Camera size={40} />
              </button>
            </div>
          </div>
        )}

        {/* ── 預覽確認 ── */}
        {(step === 'preview' || step === 'analyzing') && (
          <div className="space-y-0">
            <div className="relative aspect-[4/3] overflow-hidden bg-slate-900">
              <img src={capturedImage} alt="拍攝的商品" className="w-full h-full object-cover" />
              {step === 'analyzing' && (
                <div className="absolute inset-0 bg-slate-950/70 backdrop-blur flex flex-col items-center justify-center gap-5">
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-violet-600/20 border-4 border-violet-500/40 animate-pulse" />
                    <Sparkles size={36} className="text-violet-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-bounce" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-black text-2xl">AI 辨識中...</p>
                    <p className="text-slate-400 font-bold mt-1">正在分析商品照片</p>
                  </div>
                </div>
              )}
            </div>
            {step === 'preview' && (
              <div className="p-8 flex gap-4">
                <button onClick={retake} className="flex-1 py-5 bg-slate-100 text-slate-600 font-black rounded-3xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-all text-lg">
                  <RotateCcw size={22} /> 重拍
                </button>
                <button onClick={analyzePhoto} className="flex-[2] py-5 bg-violet-600 text-white font-black rounded-3xl flex items-center justify-center gap-2 hover:bg-violet-700 shadow-xl shadow-violet-600/30 transition-all text-lg active:scale-95">
                  <Sparkles size={22} /> AI 辨識商品
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── AI 辨識成功 → 確認表單 ── */}
        {step === 'confirm' && (
          <div className="p-10 space-y-8">
            {/* 縮圖 + AI 辨識結果徽章 */}
            <div className="flex gap-6 items-start">
              <img src={capturedImage} alt="商品" className="w-28 h-28 object-cover rounded-3xl border-4 border-violet-100 flex-shrink-0" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={18} className="text-emerald-500" />
                  <span className="text-xs font-black text-emerald-600 uppercase tracking-widest">AI 辨識完成</span>
                </div>
                {aiResult?.description && (
                  <p className="text-slate-500 font-bold text-sm bg-slate-50 px-4 py-3 rounded-2xl">
                    {aiResult.description}
                  </p>
                )}
                <p className="text-xs text-slate-400 font-bold mt-2">※ 以下資料可直接修改</p>
              </div>
            </div>

            {/* 商品名稱 */}
            <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">商品名稱</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full p-5 bg-slate-50 border-4 border-transparent rounded-3xl font-black text-2xl focus:border-violet-400 outline-none transition-all"
                placeholder="商品名稱"
              />
            </div>

            {/* 分類 */}
            <div className="space-y-3">
              <label className="text-xs font-black text-slate-400 uppercase tracking-widest">分類</label>
              <input
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full p-5 bg-slate-50 border-4 border-transparent rounded-3xl font-bold text-xl focus:border-violet-400 outline-none transition-all"
                placeholder="商品分類"
              />
            </div>

            {/* 成本 / 售價 / 庫存 */}
            <div className="grid grid-cols-3 gap-5">
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">成本 ($)</label>
                <input
                  type="number"
                  value={cost}
                  onChange={e => setCost(Number(e.target.value))}
                  className="w-full p-5 bg-slate-50 border-4 border-transparent rounded-3xl font-black text-2xl focus:border-violet-400 outline-none"
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">售價 ($)</label>
                <input
                  type="number"
                  value={price}
                  onChange={e => setPrice(Number(e.target.value))}
                  className="w-full p-5 bg-slate-50 border-4 border-transparent rounded-3xl font-black text-2xl text-emerald-600 focus:border-violet-400 outline-none"
                />
              </div>
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">數量</label>
                <input
                  type="number"
                  value={stock}
                  onChange={e => setStock(Number(e.target.value))}
                  className="w-full p-5 bg-slate-50 border-4 border-transparent rounded-3xl font-black text-2xl focus:border-violet-400 outline-none"
                />
              </div>
            </div>

            {/* 操作按鈕 */}
            <div className="flex gap-4 pt-2">
              <button onClick={retake} className="flex-1 py-5 bg-slate-100 text-slate-500 font-black rounded-3xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-all">
                <RotateCcw size={20} /> 重拍
              </button>
              <button
                onClick={handleSave}
                disabled={!name.trim()}
                className="flex-[2] py-5 bg-violet-600 text-white font-black rounded-3xl flex items-center justify-center gap-2 shadow-xl shadow-violet-600/30 hover:bg-violet-700 transition-all text-xl active:scale-95 disabled:opacity-40"
              >
                <Save size={22} /> 儲存商品
              </button>
            </div>
          </div>
        )}

        {/* ── 錯誤畫面 ── */}
        {step === 'error' && (
          <div className="p-14 flex flex-col items-center gap-6 text-center">
            <AlertCircle size={56} className="text-red-400" />
            <div>
              <p className="font-black text-2xl text-slate-900 mb-2">辨識失敗</p>
              <p className="text-slate-500 font-bold">{errorMsg}</p>
            </div>
            <div className="flex gap-4">
              <button onClick={retake} className="px-8 py-4 bg-slate-100 text-slate-600 font-black rounded-2xl flex items-center gap-2 hover:bg-slate-200 transition-all">
                <RotateCcw size={18} /> 重新拍照
              </button>
              <button onClick={analyzePhoto} className="px-8 py-4 bg-violet-600 text-white font-black rounded-2xl flex items-center gap-2 shadow-lg hover:bg-violet-700 transition-all">
                <RefreshCw size={18} /> 重試辨識
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 隱藏的 canvas 用於拍照 */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default PhotoAddView;
