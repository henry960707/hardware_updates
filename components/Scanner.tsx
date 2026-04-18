
import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, AlertCircle, RefreshCw } from 'lucide-react';

interface ScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export const Scanner: React.FC<ScannerProps> = ({ onScan, onClose }) => {
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader-container";

  useEffect(() => {
    let isMounted = true;

    const startScanner = async () => {
      // 延遲一下下，給瀏覽器一點緩衝時間
      await new Promise(r => setTimeout(r, 500));
      
      if (!isMounted) return;

      try {
        const html5QrCode = new Html5Qrcode(containerId);
        scannerRef.current = html5QrCode;

        const config = { 
          fps: 10, 
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0
        };

        await html5QrCode.start(
          { facingMode: "environment" }, 
          config, 
          (decodedText) => {
            if (isMounted) {
              // 掃描成功，先震動再回傳
              if ('vibrate' in navigator) navigator.vibrate(100);
              stopAndClose(decodedText);
            }
          },
          () => { /* 忽略掃描中的細微錯誤 */ }
        );
        
        if (isMounted) setIsInitializing(false);
      } catch (err: any) {
        console.error("Scanner Error:", err);
        if (isMounted) {
          setIsInitializing(false);
          const msg = err?.toString() || "";
          if (msg.includes("Permission")) {
            setError("請允許相機權限。");
          } else if (!window.isSecureContext) {
            setError("需要 HTTPS 連線才能掃描。");
          } else {
            setError("找不到相機或相機被佔用中。");
          }
        }
      }
    };

    startScanner();

    return () => {
      isMounted = false;
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  const stopAndClose = async (text?: string) => {
    if (scannerRef.current && scannerRef.current.isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (e) {}
    }
    if (text) onScan(text);
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      <div className="p-4 flex justify-between items-center text-white bg-slate-900">
        <div className="flex items-center gap-2">
          <Camera size={20} className="text-blue-500" />
          <span className="font-bold">對準條碼</span>
        </div>
        <button onClick={() => stopAndClose()} className="p-2">
          <X size={24} />
        </button>
      </div>

      <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
        <div id={containerId} className="w-full h-full"></div>
        
        {/* 掃描輔助框 */}
        {!error && !isInitializing && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-[260px] h-[260px] border-2 border-blue-500/50 rounded-3xl">
              <div className="w-full h-1 bg-blue-500/80 animate-pulse mt-[130px]" />
            </div>
          </div>
        )}

        {isInitializing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-white gap-4 bg-slate-900">
            <RefreshCw className="animate-spin text-blue-500" size={32} />
            <p className="font-bold">相機啟動中...</p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 bg-slate-900 p-8 flex flex-col items-center justify-center text-center gap-4">
            <AlertCircle size={48} className="text-red-500" />
            <p className="text-white font-bold">{error}</p>
            <button onClick={onClose} className="px-6 py-2 bg-blue-600 text-white rounded-xl">返回</button>
          </div>
        )}
      </div>
    </div>
  );
};
