import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Port must strictly be 3000 as required by the AI Studio runtime environment
const port = 3000;

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception in server process:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Allow large image uploads (base64 pictures from mobile phone cameras)
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));

// Initialize shared Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// API: AI Menu Extraction from Photo
app.post('/api/ai/extract-menu', async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Nenhuma foto do cardápio foi enviada.' 
      });
    }

    // Detect actual mime type if header present
    let detectedMime = mimeType || 'image/jpeg';
    const mimeMatch = imageBase64.match(/^data:([a-zA-Z0-9/+-]+);base64,/);
    if (mimeMatch && mimeMatch[1]) {
      detectedMime = mimeMatch[1];
    }

    // Clean base64 header
    const cleanBase64 = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '').trim();
    if (!cleanBase64) {
      return res.status(400).json({ 
        success: false, 
        error: 'Arquivo de imagem inválido ou vazio.' 
      });
    }

    const prompt = `Você é um sistema especialista em OCR e digitalização de cardápios de restaurantes, bares, lanchonetes e pizzarias.
Analise com máxima atenção a imagem deste cardápio físico (impresso, lousa, folheto ou banner).
Seu objetivo principal é identificar TODOS os produtos com seus respectivos NOMES e VALORES (preços) e categorizá-los.

DIRETRIZES DE EXTRAÇÃO:
1. Nomes dos Produtos:
   - Extraia o nome exato e apetitoso de cada prato, porção, lanche ou bebida (ex: "X-Salada Especial", "Picanha na Chapa 500g", "Suco Natural 400ml", "Chopp Pilsen").
   - Se houver variações de tamanho ou porção no mesmo item (ex: Meia / Inteira, P / M / G), crie itens separados com o tamanho indicado no nome (ex: "Batata Frita (Meia Porção)" e "Batata Frita (Porção Inteira)").

2. Preços (Valores):
   - Localize o valor de cada produto, mesmo que esteja alinhado à direita ou abaixo do nome.
   - Converta os valores monetários brasileiros (ex: "R$ 45,90", "45,90", "R$ 30", "30,00", "28.-") em um número decimal float (ex: 45.90, 30.00, 28.00).
   - O campo "price" DEVE ser obrigatoriamente um número float positivo (nunca negativo).
   - Se o preço estiver difícil de enxergar, estime um valor coerente com os demais itens da categoria (nunca deixe zero se for um prato visível).

3. Categorias:
   - Agrupe os itens pelas seções visíveis no cardápio (ex: "Entradas & Petiscos", "Pratos Principais", "Hambúrgueres", "Massas & Risotos", "Pizzas", "Sobremesas", "Bebidas", "Drinks & Coquetéis").
   - Preencha a lista "categories" com todos os nomes das categorias encontradas.

4. Descrição & Tempo de Preparo:
   - Extraia os ingredientes ou acompanhamentos informados no campo "description". Caso não haja, escreva uma breve descrição apetitosa em português brasileiro.
   - "prepTimeMinutes": Tempo estimado em minutos (ex: 5 para bebidas, 15 para petiscos/lanches, 25 para pratos principais).

Retorne ESTRITAMENTE um objeto JSON válido no formato:
{
  "categories": ["Nome da Categoria 1", "Nome da Categoria 2"],
  "items": [
    {
      "name": "Nome do Prato",
      "description": "Ingredientes e acompanhamentos",
      "price": 38.50,
      "category": "Nome da Categoria 1",
      "prepTimeMinutes": 20
    }
  ]
}
Não inclua nenhuma palavra ou markdown fora do bloco JSON.`;

    // Cascade models: gemini-3.1-flash-lite provides ultra-fast response without 503 spikes; gemini-3.8-flash as fallback/alternative
    const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
    let lastError: any = null;
    let responseText = '';
    let usedModel = '';

    for (const model of candidateModels) {
      try {
        console.log(`[AI Menu OCR] Analisando cardápio com modelo ${model}...`);
        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: detectedMime,
                  data: cleanBase64,
                },
              },
              {
                text: prompt,
              },
            ],
          },
          config: {
            responseMimeType: 'application/json',
          },
        });

        if (response.text) {
          responseText = response.text;
          usedModel = model;
          console.log(`[AI Menu OCR] Sucesso com modelo ${model}! Tamanho da resposta: ${responseText.length}`);
          break;
        }
      } catch (err: any) {
        console.warn(`[AI Menu OCR] Modelo ${model} falhou:`, err?.status || err?.message || err);
        lastError = err;
      }
    }

    if (!responseText) {
      throw lastError || new Error('Não foi possível obter resposta do serviço de IA.');
    }

    // Sanitize possible markdown formatting
    let cleanJson = responseText.trim();
    if (cleanJson.startsWith('```')) {
      cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    let parsedData: any = null;
    try {
      parsedData = JSON.parse(cleanJson);
    } catch {
      const match = cleanJson.match(/\{[\s\S]*\}/);
      if (match) {
        parsedData = JSON.parse(match[0]);
      } else {
        throw new Error('A resposta da IA não pôde ser convertida para JSON.');
      }
    }

    // Normalize categories
    const categories: string[] = Array.isArray(parsedData?.categories)
      ? parsedData.categories.map((c: any) => String(c).trim()).filter(Boolean)
      : ['Pratos Principais', 'Bebidas'];

    // Normalize items
    const rawItems: any[] = Array.isArray(parsedData?.items) ? parsedData.items : [];
    const items = rawItems.map((item: any) => {
      let price = item.price;
      if (typeof price === 'string') {
        // Convert "R$ 45,90" or "45,90" to 45.90
        const sanitized = price.replace(/[^0-9,.]/g, '').replace(',', '.');
        price = parseFloat(sanitized);
      }
      if (typeof price !== 'number' || isNaN(price) || price < 0) {
        price = 0;
      }

      let prepTime = parseInt(String(item.prepTimeMinutes || 15), 10);
      if (isNaN(prepTime) || prepTime <= 0) prepTime = 15;

      const categoryName = String(item.category || categories[0] || 'Pratos Principais').trim();

      return {
        name: String(item.name || 'Item do Cardápio').trim(),
        description: String(item.description || '').trim(),
        price: Number(price.toFixed(2)),
        category: categoryName,
        prepTimeMinutes: prepTime,
      };
    }).filter((item) => item.name.length > 0);

    return res.json({
      success: true,
      modelUsed: usedModel,
      data: {
        categories: categories.length > 0 ? categories : ['Pratos Principais'],
        items,
      },
    });
  } catch (error: any) {
    console.error('Erro na extração de cardápio com Gemini:', error);
    const errorMessage = error?.message || 'Falha ao processar a foto do cardápio com inteligência artificial.';
    return res.status(500).json({
      success: false,
      error: errorMessage,
      message: errorMessage,
      code: error?.status || error?.code || 500,
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: new Date().toISOString() });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`ComandaSmart Server rodando em http://0.0.0.0:${port}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Porta ${port} já está em uso, aguardando liberação...`);
    } else {
      console.error('Erro no servidor HTTP:', err);
    }
  });
}

startServer();
