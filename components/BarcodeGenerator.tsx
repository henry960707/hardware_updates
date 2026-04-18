
import React from 'react';

export const Barcode: React.FC<{ value: string; width?: number; height?: number }> = ({ 
  value, 
  width = 2, 
  height = 60 
}) => {
  // 使用 bwip-js 的 API 生成高質量的 Code 128 條碼
  // 增加 barcolor 以確保列印品質，並設置高度
  const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(value)}&scale=2&rotate=N&includetext=false&backgroundcolor=ffffff&paddingwidth=5&paddingheight=5`;

  return (
    <div className="flex flex-col items-center bg-white p-1 rounded">
      <img 
        src={barcodeUrl} 
        alt={`Barcode ${value}`} 
        className="max-w-full h-auto object-contain"
        style={{ minHeight: `${height}px` }}
        onError={(e) => {
          // 備用方案：如果 API 失敗，顯示文字
          e.currentTarget.style.display = 'none';
        }}
      />
      <span className="mt-1 text-[9px] font-mono font-bold text-gray-500 tracking-widest">{value}</span>
    </div>
  );
};
