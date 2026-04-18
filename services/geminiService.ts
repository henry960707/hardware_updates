import { GoogleGenAI } from "@google/genai";
import { Product, AiProductResult } from "../types";

export class GeminiInventoryService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  async analyzeInventory(products: Product[]): Promise<string> {
    const summary = products.map(p =>
      `${p.name}: 庫存 ${p.stock}, 成本 ${p.cost}, 售價 ${p.price}`
    ).join('\n');

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `你是一位專業的五金行經營顧問。以下是目前的庫存資料：\n${summary}\n\n請根據這些資料提供 3 個具體的經營建議（例如：哪些商品需要補貨、利潤分析、或是季節性銷售建議）。請用繁體中文回答。`,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    return response.text || "無法獲取分析結果。";
  }

  async getProductHelp(query: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `身為五金行助手，請回答使用者的問題：${query}`,
    });
    return response.text || "抱歉，我現在無法回答。";
  }

  /**
   * 🆕 拍照辨識商品
   * 傳入 base64 圖片（不含 data:image/jpeg;base64, 前綴），
   * 回傳 AI 辨識出的商品資訊。
   */
  async identifyProductFromPhoto(base64Image: string): Promise<AiProductResult> {
    const prompt = `你是一個台灣五金行的智慧助理，擅長辨識各種五金零件、工具和建材商品。

請仔細辨識這張照片裡的商品，並回傳以下 JSON 格式（只回傳 JSON，不要任何其他文字）：

{
  "name": "商品名稱（盡量詳細，例如：不鏽鋼六角螺絲 M5x20mm、10mm 鑽頭、PVC 水管 3分等）",
  "category": "分類（從以下選一個最合適的：螺絲螺帽/工具/水電材料/鐵材/塑膠製品/電氣材料/黏著劑/五金零件/建材/其他）",
  "estimatedCost": 預估台灣市場進貨成本（整數，新台幣元），
  "estimatedPrice": 預估建議零售售價（整數，新台幣元，通常比成本高 30~100%）,
  "description": "20字內的商品簡短特性描述"
}

如果看不清楚或無法辨識，name 填「未知商品」，其他數字填 0。`;

    const response = await this.ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
              }
            },
            { text: prompt }
          ]
        }
      ] as any,
      config: {
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    const text = response.text || '';

    // 解析 JSON（移除可能的 markdown code fence）
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI 回傳格式錯誤，請重試。');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      name: parsed.name || '未知商品',
      category: parsed.category || '五金零件',
      estimatedCost: Number(parsed.estimatedCost) || 0,
      estimatedPrice: Number(parsed.estimatedPrice) || 0,
      description: parsed.description || '',
    };
  }
}
