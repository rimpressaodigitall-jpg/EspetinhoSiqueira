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
const port = parseInt(process.env.PORT || '3000', 10);

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
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'Nenhuma foto do cardápio foi enviada.' });
    }

    // Clean base64 header if present
    const cleanBase64 = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');

    const prompt = `Você é um assistente especialista em digitalizar e extrair cardápios de restaurantes e bares a partir de fotografias.
Analise com extrema precisão a imagem deste cardápio físico (impresso, lousa, folheto ou banner).
Identifique:
1. As categorias principais encontradas (ex: "Entradas", "Pratos Principais", "Massas", "Carnes & Grelhados", "Hambúrgueres", "Pizzas", "Sobremesas", "Bebidas", "Drinks").
2. Todos os itens individuais do cardápio:
   - "name": Nome claro, apetitoso e padronizado do prato/bebida (ex: "Filé à Parmegiana", "Chopp Artesanal 500ml").
   - "description": Ingredientes, acompanhamentos ou detalhes informados. Se o cardápio não trouxer descrição, crie uma breve descrição convidativa e realista em português brasileiro.
   - "price": Preço como número decimal float (ex: 49.90). Extraia o valor numérico, removendo "R$" e substituindo vírgula por ponto. Se for ilegível, estime um valor razoável para a categoria (nunca deixe negativo).
   - "category": O nome da categoria a qual o prato pertence (deve coincidir com a lista de categorias).
   - "prepTimeMinutes": Tempo estimado de preparo em minutos (número inteiro razoável, ex: 10 para bebidas/sobremesas, 15 para petiscos, 25 para pratos elaborados).

Retorne ESTRITAMENTE um objeto JSON válido seguindo este formato exato:
{
  "categories": ["Nome da Categoria 1", "Nome da Categoria 2"],
  "items": [
    {
      "name": "Nome do Prato",
      "description": "Descrição detalhada dos ingredientes e acompanhamentos",
      "price": 35.50,
      "category": "Nome da Categoria 1",
      "prepTimeMinutes": 20
    }
  ]
}
Não inclua nenhum texto introdutório ou conclusivo fora do JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
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

    const responseText = response.text || '{}';
    let parsedData: any = null;

    try {
      parsedData = JSON.parse(responseText);
    } catch {
      const match = responseText.match(/\{[\s\S]*\}/);
      if (match) {
        parsedData = JSON.parse(match[0]);
      } else {
        throw new Error('Formato JSON não pôde ser interpretado da resposta da IA.');
      }
    }

    return res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Erro na extração de cardápio com Gemini:', error);
    return res.status(500).json({
      error: 'Não foi possível extrair o cardápio da foto com a IA.',
      message: error?.message || String(error),
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
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`ComandaSmart Server rodando em http://0.0.0.0:${port}`);
  });
}

startServer();
