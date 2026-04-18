import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  LayoutDashboard, Package, Scan, PlusCircle, Printer, Bot, Search,
  AlertTriangle, TrendingUp, ChevronRight, Trash2, X, DollarSign, Box,
  Smartphone, CheckCircle2, Wifi, WifiOff, RefreshCw, Camera, RefreshCcw,
  FileUp, Download, Info, FileSpreadsheet, Minus, Plus, Save, Sparkles
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Peer } from 'peerjs';
import { Product, ViewType } from './types';
import { Barcode } from './components/BarcodeGenerator';
import { Scanner } from './components/Scanner';
import { GeminiInventoryService } from './services/geminiService';
import PhotoAddView from './components/PhotoAddView';

const STORAGE_KEY = 'hardware_inventory_db';

const generateBatchId = (index: number = 0) => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const seq = index.toString().padStart(3, '0');
  return timestamp + random + seq;
};

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewType>('inventory');
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [flashEffect, setFlashEffect] = useState(false);
  const [nextId, setNextId] = useState(generateBatchId());

  // 連線狀態
  const [peerId, setPeerId] = useState<string>('');
  const [remoteConnected, setRemoteConnected] = useState(false);
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [isRemoteMode, setIsRemoteMode] = useState(false);
  
  const peerRef = useRef<any>(null);
  const connRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setProducts(JSON.parse(saved));

    const urlParams = new URLSearchParams(window.location.search);
    const pairId = urlParams.get('pair');
    
    if (pairId) {
      setIsRemoteMode(true);
      connectToHost(pairId);
    } else {
      initPeerAsHost();
    }

    return () => {
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  const initPeerAsHost = () => {
    if (peerRef.current) return;
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', (id) => setPeerId(id));
    peer.on('connection', (conn) => {
      connRef.current = conn;
      setRemoteConnected(true);
      conn.on('data', (data: any) => {
        if (data.type === 'scan') handleIncomingScan(data.code);
      });
      conn.on('close', () => setRemoteConnected(false));
    });
  };

  const connectToHost = (hostId: string) => {
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', () => {
      const conn = peer.connect(hostId);
      connRef.current = conn;
      conn.on('open', () => setRemoteConnected(true));
      conn.on('close', () => setRemoteConnected(false));
    });
  };

  const handleScan = (code: string) => {
    const cleanCode = code.trim();
    if (isRemoteMode && connRef.current) {
      connRef.current.send({ type: 'scan', code: cleanCode });
      setShowScanner(false);
      return;
    }
    handleIncomingScan(cleanCode);
    setShowScanner(false);
  };

  const handleIncomingScan = (code: string) => {
    const cleanCode = code.trim();
    const latestRaw = localStorage.getItem(STORAGE_KEY);
    const latestDb: Product[] = latestRaw ? JSON.parse(latestRaw) : [];
    setProducts(latestDb);

    const found = latestDb.find(p => p.id === cleanCode);
    if (found) {
      setFlashEffect(true);
      setTimeout(() => setFlashEffect(false), 800);
      setSelectedProduct(found);
      setActiveView('inventory');
      setShowPairingModal(false);
    } else {
      if (window.confirm(`找不到條碼 ${cleanCode}，要新增此商品嗎？`)) {
        setNextId(cleanCode);
        setActiveView('add');
        setShowPairingModal(false);
      }
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData: any[] = XLSX.utils.sheet_to_json(firstSheet);

        if (jsonData.length === 0) {
          alert("Excel 檔案裡沒有資料。");
          return;
        }

        const existingIds = new Set(products.map(p => p.id));
        const seenInBatch = new Set<string>();
        const uniqueToImport: Product[] = [];

        jsonData.forEach((row, index) => {
          const name = row['品名'] || row['名稱'] || row['商品名稱'] || row['name'] || '未命名商品';
          const barcode = (row['條碼'] || row['ID'] || row['條碼編號'] || row['code'] || generateBatchId(index)).toString();
          
          if (!existingIds.has(barcode) && !seenInBatch.has(barcode)) {
            const cost = Number(row['成本'] || row['進價'] || row['cost'] || 0);
            const price = Number(row['售價'] || row['單價'] || row['價錢'] || row['price'] || 0);
            const stock = Number(row['庫存'] || row['庫存量'] || row['數量'] || row['stock'] || 0);
            const category = row['分類'] || row['類別'] || row['category'] || '五金';
            const supplier = row['供應商'] || row['廠商'] || row['supplier'] || '-';

            uniqueToImport.push({
              id: barcode,
              name: name.toString(),
              category: category.toString(),
              supplier: supplier.toString(),
              purchaseDate: new Date().toISOString().split('T')[0],
              cost,
              price,
              stock,
              minStock: 5,
            });
            seenInBatch.add(barcode);
          }
        });

        if (uniqueToImport.length === 0) {
          alert("匯入完成：檔案中的商品全部都已經存在於系統中，或是檔案內容重複，因此沒有新增任何項目。");
        } else {
          saveProducts([...products, ...uniqueToImport]);
          const skippedCount = jsonData.length - uniqueToImport.length;
          alert(`成功匯入 ${uniqueToImport.length} 筆商品！${skippedCount > 0 ? `(自動跳過了 ${skippedCount} 筆重複的資料)` : ''}`);
        }
      } catch (err) {
        alert("檔案讀取錯誤，請確定是 Excel 檔。");
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const templateData = [
      { "品名": "範例商品(會生條碼)", "成本": 10, "售價": 20, "庫存": 100, "分類": "零件", "供應商": "批發商" },
      { "品名": "已有條碼商品", "條碼": "666777888", "成本": 100, "售價": 200, "庫存": 50, "分類": "工具", "供應商": "大廠" }
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "商品資料");
    XLSX.writeFile(wb, "五金行匯入範本.xlsx");
  };

  const saveProducts = (newProducts: Product[]) => {
    setProducts(newProducts);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProducts));
  };

  const updateProduct = (updatedProduct: Product) => {
    const newProducts = products.map(p => p.id === updatedProduct.id ? updatedProduct : p);
    saveProducts(newProducts);
  };

  const stats = useMemo(() => {
    const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock), 0);
    const totalCost = products.reduce((sum, p) => sum + (p.cost * p.stock), 0);
    const lowStockCount = products.filter(p => p.stock <= p.minStock).length;
    return { 
      totalValue, 
      totalCost,
      totalProfit: totalValue - totalCost,
      lowStockCount, 
      count: products.length 
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => p.name.includes(searchTerm) || p.id.includes(searchTerm));
  }, [products, searchTerm]);

  // 拍照新增：儲存並切換到庫存清單
  const handlePhotoSave = (product: Product) => {
    saveProducts([...products, product]);
    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 800);
    setActiveView('inventory');
  };

  if (isRemoteMode) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col p-6 items-center justify-center text-center">
        <div className="w-full max-sm space-y-10">
          <div className="flex flex-col items-center gap-4">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${remoteConnected ? 'bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.5)]' : 'bg-slate-700 animate-pulse'}`}>
              {remoteConnected ? <Wifi size={40} /> : <WifiOff size={40} />}
            </div>
            <h2 className="text-2xl font-black">{remoteConnected ? '連線成功' : '連線中...'}</h2>
            <p className="text-slate-400 text-sm">請爸爸對準商品條碼</p>
          </div>
          <button onClick={() => setShowScanner(true)} disabled={!remoteConnected} className="w-full py-24 bg-blue-600 rounded-[48px] font-black text-4xl shadow-2xl active:scale-95 disabled:opacity-20 transition-all flex flex-col items-center gap-4 border-4 border-blue-400/30">
            <Camera size={64} />掃描條碼
          </button>
          <button onClick={() => window.location.search = ''} className="text-slate-500 font-bold underline">退出遠端模式</button>
        </div>
        {showScanner && <Scanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex flex-col md:flex-row bg-slate-50 transition-colors duration-500 ${flashEffect ? 'bg-emerald-100' : ''}`}>
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-72 bg-slate-900 text-white p-8 sticky top-0 h-screen no-print shadow-2xl z-50">
        <div className="flex items-center gap-4 mb-14">
          <div className="bg-blue-600 p-2.5 rounded-2xl shadow-lg shadow-blue-600/30"><Package size={28} /></div>
          <h1 className="text-2xl font-black tracking-tighter">五金庫存王</h1>
        </div>
        <nav className="flex-1 space-y-3">
          <NavItem active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} icon={<LayoutDashboard size={22}/>} label="店面現況" />
          <NavItem active={activeView === 'inventory'} onClick={() => setActiveView('inventory')} icon={<Package size={22}/>} label="商品清單" />
          <NavItem active={activeView === 'add'} onClick={() => { setNextId(generateBatchId()); setActiveView('add'); }} icon={<PlusCircle size={22}/>} label="手動新增" />
          {/* 🆕 拍照辨識 */}
          <NavItem
            active={activeView === 'photo-add'}
            onClick={() => setActiveView('photo-add')}
            icon={<Sparkles size={22}/>}
            label="拍照辨識"
            badge="AI"
          />
          <NavItem active={activeView === 'labels'} onClick={() => setActiveView('labels')} icon={<Printer size={22}/>} label="印條碼標籤" />
          <NavItem active={activeView === 'ai-assistant'} onClick={() => setActiveView('ai-assistant')} icon={<Bot size={22}/>} label="AI 店長" />
        </nav>
        <div className="mt-auto space-y-4 pt-6 border-t border-slate-800">
          <button onClick={() => setShowPairingModal(true)} className={`w-full py-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all ${remoteConnected ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-slate-800 text-slate-500 hover:bg-slate-700'}`}>
            <Smartphone size={18}/> {remoteConnected ? '手機已連線' : '配對爸爸的手機'}
          </button>
          <button onClick={() => setShowScanner(true)} className="w-full py-5 bg-blue-600 rounded-2xl font-black flex items-center justify-center gap-2 hover:bg-blue-700 shadow-xl shadow-blue-900/40 transition-all active:scale-95">
            <Scan size={24} /> 本機掃描
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 md:p-12 overflow-y-auto">
        {activeView === 'dashboard' && (
          <div className="space-y-12 animate-in fade-in duration-700">
            <header>
              <h2 className="text-5xl font-black text-slate-900 tracking-tighter">營運概況</h2>
              <p className="text-slate-500 text-xl font-bold mt-2">目前總共管理 {products.length} 樣五金商品</p>
            </header>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              <StatCard title="商品種類" value={stats.count.toString()} icon={<Box className="text-purple-600"/>} />
              <StatCard title="庫存總市值" value={`$${stats.totalValue.toLocaleString()}`} icon={<TrendingUp className="text-emerald-600"/>} />
              <StatCard title="進貨總成本" value={`$${stats.totalCost.toLocaleString()}`} icon={<Download className="text-slate-400"/>} />
              <StatCard title="預估總毛利" value={`$${stats.totalProfit.toLocaleString()}`} icon={<DollarSign className="text-blue-600"/>} trend="賺錢中" />
            </div>

            {/* 🆕 快速入口：拍照新增 */}
            <div
              onClick={() => setActiveView('photo-add')}
              className="cursor-pointer bg-gradient-to-br from-violet-600 to-purple-700 rounded-[48px] p-10 text-white flex items-center gap-8 shadow-2xl shadow-violet-900/30 hover:shadow-violet-900/50 hover:scale-[1.01] transition-all group"
            >
              <div className="bg-white/20 p-6 rounded-3xl group-hover:bg-white/30 transition-all">
                <Camera size={48} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-3xl font-black">拍照辨識新增商品</h3>
                  <span className="bg-white/20 px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest">AI 新功能</span>
                </div>
                <p className="text-violet-200 font-bold text-lg">拍一張照片，AI 自動幫你填品名、分類、售價，超快速！</p>
              </div>
              <ChevronRight size={32} className="text-white/50 group-hover:translate-x-2 transition-transform" />
            </div>
          </div>
        )}

        {activeView === 'inventory' && (
          <div className="space-y-8 animate-in slide-in-from-bottom-4">
            <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
              <div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tight">庫存清單</h2>
                <div className="flex gap-4 mt-2">
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-black">共 {products.length} 品項</span>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-black">庫存價值 ${stats.totalValue.toLocaleString()}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative group mr-2">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input type="text" placeholder="搜尋商品或條碼..." className="pl-12 pr-6 py-4 bg-white border-2 border-slate-200 rounded-2xl outline-none w-80 focus:border-blue-500 focus:shadow-lg transition-all font-black text-lg" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                
                <div className="flex gap-2">
                  <button onClick={downloadTemplate} className="p-4 bg-slate-100 text-slate-600 rounded-2xl font-black flex items-center gap-2 hover:bg-slate-200" title="下載 Excel 範本">
                    <FileSpreadsheet size={20}/> 下載範本
                  </button>
                  <input type="file" ref={fileInputRef} onChange={handleImportExcel} accept=".xlsx, .xls" className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} className="px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black flex items-center gap-2 hover:bg-emerald-700 shadow-lg shadow-emerald-900/20 transition-all"><FileUp size={22}/> 丟入 Excel</button>
                </div>

                {/* 🆕 拍照快速入口 */}
                <button
                  onClick={() => setActiveView('photo-add')}
                  className="px-6 py-4 bg-violet-600 text-white rounded-2xl font-black flex items-center gap-2 hover:bg-violet-700 shadow-lg shadow-violet-900/20 transition-all active:scale-95"
                >
                  <Camera size={20}/> 拍照新增
                </button>

                <button onClick={() => { setNextId(generateBatchId()); setActiveView('add'); }} className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl hover:bg-blue-700 transition-all active:scale-95">手動新增</button>
              </div>
            </header>

            <div className="bg-white rounded-[40px] border-4 border-slate-100 overflow-hidden shadow-sm">
              <table className="w-full text-left">
                <thead className="bg-slate-900 text-[11px] font-black text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-8 py-6">條碼</th>
                    <th className="px-8 py-6">品名</th>
                    <th className="px-8 py-6 text-right">成本</th>
                    <th className="px-8 py-6 text-right">售價</th>
                    <th className="px-8 py-6 text-right">利潤</th>
                    <th className="px-8 py-6 text-right">庫存</th>
                    <th className="px-8 py-6 text-center">刪除</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-slate-50">
                  {filteredProducts.map(p => (
                    <tr key={p.id} onClick={() => setSelectedProduct(p)} className="cursor-pointer hover:bg-blue-50/70 transition-colors group">
                      <td className="px-8 py-7 font-mono text-xs font-black text-blue-500/60">{p.id}</td>
                      <td className="px-8 py-7">
                        <div className="flex items-center gap-3">
                          {/* 🆕 如果是拍照新增的商品，顯示縮圖 */}
                          {p.imageBase64 && (
                            <img src={p.imageBase64} alt={p.name} className="w-10 h-10 rounded-xl object-cover border-2 border-slate-100 flex-shrink-0" />
                          )}
                          <div>
                            <p className="font-black text-slate-900 text-xl group-hover:text-blue-600 transition-colors">{p.name}</p>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded uppercase">{p.category}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-7 text-right font-bold text-slate-400 text-lg">${p.cost}</td>
                      <td className="px-8 py-7 text-right font-black text-emerald-600 text-2xl tracking-tighter">${p.price}</td>
                      <td className="px-8 py-7 text-right font-black text-blue-600 text-xl">${p.price - p.cost}</td>
                      <td className={`px-8 py-7 text-right font-black text-2xl ${p.stock <= p.minStock ? 'text-red-500' : 'text-slate-900'}`}>{p.stock}</td>
                      <td className="px-8 py-7 text-center" onClick={e => e.stopPropagation()}>
                        <button onClick={() => { if(window.confirm(`確定要刪除 ${p.name}？`)) saveProducts(products.filter(x => x.id !== p.id)); }} className="text-slate-300 hover:text-red-500 p-3 bg-slate-50 rounded-xl hover:bg-red-50 transition-all"><Trash2 size={24}/></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredProducts.length === 0 && (
                <div className="p-32 text-center space-y-4">
                  <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto text-slate-200"><Package size={48} /></div>
                  <p className="text-slate-400 font-black text-2xl">目前沒有商品，趕快點「拍照新增」或「丟入 Excel」吧！</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'add' && <AddProductForm defaultId={nextId} onCancel={() => setActiveView('inventory')} onSubmit={(p: Product) => { saveProducts([...products, p]); setActiveView('inventory'); }} onOpenScanner={() => setShowScanner(true)} />}

        {/* 🆕 拍照辨識新增頁面 */}
        {activeView === 'photo-add' && (
          <PhotoAddView
            onSave={handlePhotoSave}
            onCancel={() => setActiveView('inventory')}
            generateId={generateBatchId}
          />
        )}

        {activeView === 'labels' && <LabelsView products={products} />}
        {activeView === 'ai-assistant' && <AiAssistantView products={products} />}
      </main>

      {/* 配對 Modal */}
      {showPairingModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
          <div className="bg-white w-full max-w-sm rounded-[56px] p-12 text-center space-y-10 shadow-2xl animate-in zoom-in-95">
            <div className="flex justify-between items-center"><h3 className="text-3xl font-black text-slate-900">手機掃碼連線</h3><button onClick={() => setShowPairingModal(false)} className="text-slate-300 hover:text-slate-900"><X size={32}/></button></div>
            <div className="bg-slate-50 p-10 rounded-[48px] flex flex-col items-center gap-8 border-4 border-white shadow-inner">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(window.location.origin + window.location.pathname + '?pair=' + peerId)}`} className="w-56 h-56 border-8 border-white shadow-xl rounded-3xl" />
              <p className="text-base text-slate-500 font-bold leading-relaxed">請爸爸用手機掃描這格 QR Code<br/>連線後手機就會變身掃描器！</p>
            </div>
            <div className={`p-5 rounded-[28px] font-black text-lg flex items-center justify-center gap-3 transition-all ${remoteConnected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 animate-pulse'}`}>
              {remoteConnected ? <><CheckCircle2 size={24}/> 爸爸已連線！</> : '正在等待爸爸連線...'}
            </div>
          </div>
        </div>
      )}

      {selectedProduct && <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} onUpdate={updateProduct} />}
      {showScanner && <Scanner onScan={handleScan} onClose={() => setShowScanner(false)} />}
    </div>
  );
};

// 輔助組件
const NavItem = ({ active, onClick, icon, label, badge }: any) => (
  <button onClick={onClick} className={`w-full flex items-center gap-4 p-5 rounded-[24px] transition-all font-black text-lg ${active ? 'bg-blue-600 text-white shadow-2xl shadow-blue-600/40 translate-x-2' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}>
    {icon}
    <span className="flex-1 text-left">{label}</span>
    {badge && <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${active ? 'bg-white/20 text-white' : 'bg-violet-600/20 text-violet-400'}`}>{badge}</span>}
  </button>
);

const StatCard = ({ title, value, icon, urgent, trend }: any) => (
  <div className="bg-white p-10 rounded-[48px] border-4 border-slate-100 shadow-sm group hover:border-blue-200 hover:shadow-xl transition-all">
    <div className="flex justify-between items-start mb-8">
      <div className={`p-5 rounded-3xl ${urgent ? 'bg-red-50 text-red-500' : 'bg-slate-50 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all'}`}>{icon}</div>
      {trend && <span className="text-[11px] font-black bg-blue-50 text-blue-600 px-4 py-2 rounded-full uppercase tracking-widest">{trend}</span>}
    </div>
    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{title}</h4>
    <p className={`text-5xl font-black tracking-tighter ${urgent ? 'text-red-500' : 'text-slate-900'}`}>{value}</p>
  </div>
);

const AddProductForm = ({ defaultId, onCancel, onSubmit, onOpenScanner }: any) => {
  const [id, setId] = useState(defaultId);
  useEffect(() => setId(defaultId), [defaultId]);
  
  return (
    <div className="max-w-4xl mx-auto animate-in slide-in-from-bottom-8">
      <h2 className="text-4xl font-black mb-10 text-slate-900">手動新增商品</h2>
      <form onSubmit={(e: any) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        onSubmit({
          id: fd.get('id'), name: fd.get('name'), category: fd.get('category'), supplier: fd.get('supplier'),
          purchaseDate: new Date().toISOString().split('T')[0], cost: Number(fd.get('cost')),
          price: Number(fd.get('price')), stock: Number(fd.get('stock')), minStock: Number(fd.get('minStock'))
        });
      }} className="bg-white p-12 rounded-[56px] border-8 border-slate-100 shadow-sm space-y-10">
        <div className="space-y-4">
          <label className="text-sm font-black text-slate-400 uppercase tracking-widest">條碼編號 (ID)</label>
          <div className="flex gap-4">
            <input name="id" value={id} onChange={(e) => setId(e.target.value)} required className="flex-1 p-6 bg-slate-50 border-4 border-transparent rounded-3xl font-mono text-blue-600 font-black text-2xl focus:border-blue-500 outline-none" />
            <button type="button" onClick={() => setId(generateBatchId())} className="p-6 bg-slate-100 rounded-3xl text-slate-600 hover:bg-slate-200 transition-all"><RefreshCcw size={28}/></button>
            <button type="button" onClick={onOpenScanner} className="p-6 bg-slate-100 rounded-3xl text-slate-600 hover:bg-slate-200 transition-all"><Scan size={28}/></button>
          </div>
        </div>
        <div className="space-y-4"><label className="text-sm font-black text-slate-400 uppercase tracking-widest">商品名稱</label><input name="name" required placeholder="例如：1吋不鏽鋼螺絲" className="w-full p-6 bg-slate-50 border-4 border-transparent rounded-3xl font-black text-2xl focus:border-blue-500 outline-none" /></div>
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-4"><label className="text-sm font-black text-slate-400 uppercase tracking-widest">成本 ($)</label><input name="cost" type="number" step="0.1" required className="w-full p-6 bg-slate-50 border-4 border-transparent rounded-3xl font-black text-2xl focus:border-blue-500 outline-none" /></div>
          <div className="space-y-4"><label className="text-sm font-black text-slate-400 uppercase tracking-widest">售價 ($)</label><input name="price" type="number" step="0.1" required className="w-full p-6 bg-slate-50 border-4 border-transparent rounded-3xl font-black text-2xl text-emerald-600 focus:border-blue-500 outline-none" /></div>
        </div>
        <div className="grid grid-cols-2 gap-8">
          <div className="space-y-4"><label className="text-sm font-black text-slate-400 uppercase tracking-widest">現有庫存</label><input name="stock" type="number" required className="w-full p-6 bg-slate-50 border-4 border-transparent rounded-3xl font-black text-2xl focus:border-blue-500 outline-none" /></div>
          <div className="space-y-4"><label className="text-sm font-black text-slate-400 uppercase tracking-widest">分類</label><input name="category" placeholder="螺絲/水電/工具" className="w-full p-6 bg-slate-50 border-4 border-transparent rounded-3xl font-bold text-xl" /></div>
        </div>
        <div className="flex gap-8 pt-8">
          <button type="button" onClick={onCancel} className="flex-1 py-6 bg-slate-100 font-black rounded-[32px] text-slate-500 hover:bg-slate-200 transition-all text-xl">取消</button>
          <button type="submit" className="flex-[2] py-6 bg-blue-600 text-white font-black rounded-[32px] shadow-2xl hover:bg-blue-700 transition-all text-2xl active:scale-95">儲存商品</button>
        </div>
      </form>
    </div>
  );
};

const ProductModal = ({ product, onClose, onUpdate }: any) => {
  const [stock, setStock] = useState(product.stock);
  const [price, setPrice] = useState(product.price);
  const [cost, setCost] = useState(product.cost);

  const profit = price - cost;
  const margin = price > 0 ? ((profit / price) * 100).toFixed(1) : 0;

  const handleSave = () => {
    onUpdate({ ...product, stock, price, cost });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl">
      <div className="bg-white w-full max-w-xl rounded-[64px] overflow-hidden shadow-2xl animate-in zoom-in-95 border-[12px] border-white">
        <div className="bg-slate-900 p-10 flex flex-col items-center gap-4 text-white relative">
          <button onClick={onClose} className="absolute top-8 right-8 text-white/20 hover:text-white transition-colors"><X size={32}/></button>
          {/* 🆕 拍照商品顯示縮圖 */}
          {product.imageBase64 && (
            <img src={product.imageBase64} alt={product.name} className="w-24 h-24 rounded-3xl object-cover border-4 border-white/20" />
          )}
          <span className="text-[10px] bg-blue-600 px-4 py-1 rounded-full font-black uppercase tracking-widest shadow-lg shadow-blue-600/30">{product.category}</span>
          <h3 className="text-4xl font-black text-center tracking-tighter">{product.name}</h3>
          <p className="text-slate-500 font-mono text-xs tracking-widest">ID: {product.id}</p>
          {product.description && <p className="text-slate-400 text-sm font-bold text-center">{product.description}</p>}
        </div>
        <div className="p-12 space-y-10 bg-white">
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest text-center">進貨成本</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                <input type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} className="w-full pl-7 pr-3 py-4 bg-slate-50 rounded-2xl font-black text-xl text-slate-600 outline-none focus:ring-2 ring-blue-500/20" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest text-center">建議售價</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 font-bold">$</span>
                <input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} className="w-full pl-7 pr-3 py-4 bg-slate-50 rounded-2xl font-black text-2xl text-emerald-600 outline-none focus:ring-2 ring-emerald-500/20" />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-[11px] text-slate-400 font-black uppercase tracking-widest text-center">目前庫存</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setStock(Math.max(0, stock - 1))} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200 text-slate-600"><Minus size={16}/></button>
                <input type="number" value={stock} onChange={(e) => setStock(Number(e.target.value))} className={`flex-1 min-w-0 text-center py-4 bg-slate-50 rounded-2xl font-black text-2xl outline-none ${stock <= product.minStock ? 'text-red-500' : 'text-slate-900'}`} />
                <button onClick={() => setStock(stock + 1)} className="p-3 bg-slate-100 rounded-xl hover:bg-slate-200 text-slate-600"><Plus size={16}/></button>
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center bg-blue-50 p-6 rounded-[32px] border-2 border-blue-100">
            <div className="flex items-center gap-3 text-blue-700 font-black text-xl"><DollarSign size={20}/> 預估獲利：${profit}</div>
            <div className="text-blue-500 font-black bg-white px-4 py-1.5 rounded-full text-xs shadow-sm">毛利率 {margin}%</div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => { setStock(Math.max(0, stock - 1)); onUpdate({ ...product, stock: Math.max(0, stock - 1), price, cost }); alert('已賣出 1 件商品，庫存自動更新！'); onClose(); }} className="py-6 bg-slate-100 text-slate-600 font-black rounded-3xl text-xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-all">
              <Minus size={24}/> 賣出 -1 件
            </button>
            <button onClick={handleSave} className="py-6 bg-blue-600 text-white font-black rounded-3xl text-xl flex items-center justify-center gap-2 shadow-xl hover:bg-blue-700 transition-all shadow-blue-600/30">
              <Save size={24}/> 儲存所有修改
            </button>
          </div>

          <div className="bg-slate-50 p-6 rounded-[32px] border-4 border-dashed border-slate-200 flex flex-col items-center gap-4 group hover:border-blue-300 transition-all">
            <Barcode value={product.id} height={80} />
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em]">商品條碼</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const LabelsView = ({ products }: any) => (
  <div className="space-y-12 animate-in fade-in">
    <div className="flex justify-between items-center no-print">
      <div>
        <h2 className="text-4xl font-black text-slate-900">條碼標籤中心</h2>
        <p className="text-slate-500 font-bold text-lg">系統已為所有匯入商品自動生成條碼</p>
      </div>
      <button onClick={() => window.print()} className="bg-slate-900 text-white px-10 py-5 rounded-[28px] font-black shadow-2xl flex items-center gap-3 hover:bg-slate-800 transition-all active:scale-95"><Printer size={24}/> 開始列印全部</button>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8 print:grid-cols-3 print:gap-10">
      {products.map((p: any) => (
        <div key={p.id} className="bg-white border-4 border-slate-100 rounded-[40px] p-8 flex flex-col items-center gap-6 print:border-slate-200 print:rounded-none shadow-sm hover:shadow-xl transition-all">
          <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest w-full text-center border-b-2 pb-3">{p.category}</p>
          {/* 🆕 拍照商品在標籤上顯示縮圖 */}
          {p.imageBase64 && <img src={p.imageBase64} alt={p.name} className="w-16 h-16 rounded-2xl object-cover" />}
          <p className="font-black text-slate-900 text-center text-xl h-14 flex items-center justify-center leading-tight">{p.name}</p>
          <div className="bg-white p-2 rounded-xl">
            <Barcode value={p.id} height={70} />
          </div>
          <p className="font-black text-3xl text-slate-900 tracking-tighter">${p.price}</p>
        </div>
      ))}
      {products.length === 0 && <div className="col-span-full py-40 text-center text-slate-300 font-black text-3xl border-8 border-dashed border-slate-100 rounded-[64px]">庫存是空的，請先匯入商品資料。</div>}
    </div>
  </div>
);

const AiAssistantView = ({ products }: any) => {
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const runAnalysis = async () => {
    if (products.length === 0) return alert('沒有資料可以分析喔');
    setIsAnalyzing(true);
    try {
      const service = new GeminiInventoryService();
      setAiAnalysis(await service.analyzeInventory(products));
    } catch (error) {
      setAiAnalysis("AI 目前連線異常，請稍後。");
    } finally { setIsAnalyzing(false); }
  };
  return (
    <div className="max-w-4xl mx-auto space-y-14 text-center py-10 animate-in fade-in">
      <div className="bg-blue-600 w-28 h-28 rounded-[40px] flex items-center justify-center mx-auto shadow-2xl shadow-blue-400/50">
        <Bot size={56} className="text-white" />
      </div>
      <div>
        <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-4">AI 店長顧問</h2>
        <p className="text-slate-500 font-bold text-xl">幫爸爸分析哪些東西賣比較好，哪些該補貨了。</p>
      </div>
      <button onClick={runAnalysis} disabled={isAnalyzing} className="bg-white px-16 py-8 rounded-[48px] border-8 border-slate-50 hover:border-blue-100 hover:shadow-2xl transition-all font-black text-3xl flex items-center gap-5 mx-auto disabled:opacity-50">
        {isAnalyzing ? <RefreshCw className="animate-spin text-blue-500" /> : <ChevronRight className="text-blue-500" />}
        {isAnalyzing ? '正在分析中...' : '開始分析庫存'}
      </button>
      {aiAnalysis && <div className="bg-white p-14 rounded-[64px] border-4 border-slate-50 text-left leading-relaxed shadow-sm font-bold text-2xl text-slate-700 whitespace-pre-wrap animate-in slide-in-from-top-10">{aiAnalysis}</div>}
    </div>
  );
};

export default App;
