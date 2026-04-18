export interface Product {
  id: string; // Barcode number
  name: string;
  category: string;
  supplier: string;
  purchaseDate: string;
  cost: number;
  price: number;
  stock: number;
  minStock: number;
  description?: string;
  imageBase64?: string; // 拍照新增時儲存縮圖
}

export type ViewType = 'dashboard' | 'inventory' | 'scan' | 'add' | 'labels' | 'ai-assistant' | 'photo-add';

export interface AiProductResult {
  name: string;
  category: string;
  estimatedCost: number;
  estimatedPrice: number;
  description: string;
}
