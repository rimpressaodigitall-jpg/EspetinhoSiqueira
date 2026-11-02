import { Table, RestaurantConfig } from '../types';

export type TableCardSize = '10x15' | '13x20';

export interface CardDimensionConfig {
  width: number;
  height: number;
  margin: number;
  logoSize: number;
  titleFontSize: number;
  taglineFontSize: number;
  badgeW: number;
  badgeH: number;
  welcomeFontSize: number;
  tableNumFontSize: number;
  qrBoxSize: number;
  instBoxH: number;
  instCircleRadius: number;
  instNumFontSize: number;
  instTextFontSize: number;
  instLineHeight: number;
  wifiFontSize: number;
  urlFontSize: number;
  printWidthMm: number;
  label: string;
}

const SIZE_CONFIGS: Record<TableCardSize, CardDimensionConfig> = {
  '13x20': {
    width: 1560,
    height: 2400,
    margin: 55,
    logoSize: 170,
    titleFontSize: 60,
    taglineFontSize: 26,
    badgeW: 580,
    badgeH: 165,
    welcomeFontSize: 28,
    tableNumFontSize: 92,
    qrBoxSize: 760,
    instBoxH: 240,
    instCircleRadius: 24,
    instNumFontSize: 26,
    instTextFontSize: 30,
    instLineHeight: 66,
    wifiFontSize: 28,
    urlFontSize: 24,
    printWidthMm: 128,
    label: '13cm x 20cm (Grande / Destaque)',
  },
  '10x15': {
    width: 1200,
    height: 1800,
    margin: 45,
    logoSize: 130,
    titleFontSize: 48,
    taglineFontSize: 22,
    badgeW: 460,
    badgeH: 135,
    welcomeFontSize: 22,
    tableNumFontSize: 74,
    qrBoxSize: 600,
    instBoxH: 195,
    instCircleRadius: 20,
    instNumFontSize: 22,
    instTextFontSize: 25,
    instLineHeight: 54,
    wifiFontSize: 23,
    urlFontSize: 20,
    printWidthMm: 98,
    label: '10cm x 15cm (Padrão)',
  },
};

/**
 * Generates a high-resolution 300 DPI Canvas containing the complete plate artwork,
 * supporting 10x15cm and 13x20cm dimensions with enlarged, crisp fonts and QR.
 */
export async function generateTableCardCanvas(
  table: Table,
  config: RestaurantConfig | null,
  qrDataUrl: string,
  targetUrl: string,
  size: TableCardSize = '13x20'
): Promise<HTMLCanvasElement> {
  const cfg = SIZE_CONFIGS[size] || SIZE_CONFIGS['13x20'];
  const canvas = document.createElement('canvas');
  canvas.width = cfg.width;
  canvas.height = cfg.height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Não foi possível inicializar o canvas 2D');
  }

  // 1. Background (Pristine White)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, cfg.width, cfg.height);

  // Helper for rounded rectangles
  const roundRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    radius: number,
    fill = false,
    stroke = true
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) ctx.fill();
    if (stroke) ctx.stroke();
  };

  // 2. Main Outer Card Border (Luxury Display Stand Frame)
  const cardW = cfg.width - cfg.margin * 2;
  const cardH = cfg.height - cfg.margin * 2;
  ctx.strokeStyle = '#18181b';
  ctx.lineWidth = size === '13x20' ? 12 : 10;
  roundRect(cfg.margin, cfg.margin, cardW, cardH, size === '13x20' ? 56 : 48, false, true);

  // 3. Cut & Stand Guide Header
  const cutHeaderY = cfg.margin + (size === '13x20' ? 75 : 65);
  ctx.save();
  ctx.setLineDash([14, 12]);
  ctx.strokeStyle = '#d4d4d8';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cfg.margin + 40, cutHeaderY);
  ctx.lineTo(cfg.width - cfg.margin - 40, cutHeaderY);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#71717a';
  ctx.font = `bold ${size === '13x20' ? 24 : 20}px monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('✂️ LINHA DE CORTE', cfg.margin + 45, cutHeaderY - 18);

  ctx.textAlign = 'right';
  ctx.fillText('✂️ RECORTE AQUI', cfg.width - cfg.margin - 45, cutHeaderY - 18);

  // Badge in center of cut line
  const cutBadgeW = size === '13x20' ? 520 : 420;
  const cutBadgeH = size === '13x20' ? 50 : 42;
  ctx.fillStyle = '#fef3c7';
  roundRect(cfg.width / 2 - cutBadgeW / 2, cutHeaderY - cutBadgeH / 2, cutBadgeW, cutBadgeH, cutBadgeH / 2, true, false);
  ctx.fillStyle = '#92400e';
  ctx.font = `900 ${size === '13x20' ? 22 : 19}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`DISPLAY DE MESA (${size === '13x20' ? '13x20cm' : '10x15cm'} / ACRÍLICO)`, cfg.width / 2, cutHeaderY + (size === '13x20' ? 8 : 7));

  // 4. Restaurant Logo / Icon
  let currentY = cutHeaderY + (size === '13x20' ? 45 : 35);
  const restaurantName = (config?.name || 'ComandaSmart').toUpperCase();
  const tagline = (config?.tagline || 'CARDÁPIO DIGITAL & ATENDIMENTO NA MESA').toUpperCase();

  if (config?.logoUrl) {
    try {
      const logoImg = await loadImage(config.logoUrl);
      const logoSize = cfg.logoSize;
      const logoX = cfg.width / 2 - logoSize / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cfg.width / 2, currentY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, logoX, currentY, logoSize, logoSize);
      ctx.restore();

      ctx.strokeStyle = '#e4e4e7';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cfg.width / 2, currentY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.stroke();

      currentY += logoSize + (size === '13x20' ? 30 : 20);
    } catch {
      ctx.font = `${size === '13x20' ? 85 : 70}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🍽️', cfg.width / 2, currentY + (size === '13x20' ? 70 : 60));
      currentY += size === '13x20' ? 95 : 80;
    }
  } else {
    ctx.font = `${size === '13x20' ? 85 : 70}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('🍽️', cfg.width / 2, currentY + (size === '13x20' ? 70 : 60));
    currentY += size === '13x20' ? 95 : 80;
  }

  // 5. Restaurant Title & Tagline
  ctx.fillStyle = '#09090b';
  ctx.font = `900 ${cfg.titleFontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(restaurantName, cfg.width / 2, currentY);
  currentY += size === '13x20' ? 46 : 38;

  ctx.fillStyle = '#52525b';
  ctx.font = `bold ${cfg.taglineFontSize}px sans-serif`;
  ctx.fillText(tagline, cfg.width / 2, currentY);
  currentY += size === '13x20' ? 50 : 38;

  // 6. Table Number Badge (High Contrast Amber Banner)
  const badgeX = cfg.width / 2 - cfg.badgeW / 2;
  ctx.fillStyle = '#fffbeb';
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = size === '13x20' ? 8 : 6;
  roundRect(badgeX, currentY, cfg.badgeW, cfg.badgeH, size === '13x20' ? 34 : 28, true, true);

  ctx.fillStyle = '#b45309';
  ctx.font = `900 ${cfg.welcomeFontSize}px sans-serif`;
  ctx.letterSpacing = '3px';
  ctx.fillText('SEJA BEM-VINDO', cfg.width / 2, currentY + (size === '13x20' ? 48 : 42));

  ctx.fillStyle = '#b45309';
  ctx.font = `900 ${cfg.tableNumFontSize}px sans-serif`;
  ctx.fillText(`MESA ${table.tableNumber}`, cfg.width / 2, currentY + (size === '13x20' ? 132 : 110));
  currentY += cfg.badgeH + (size === '13x20' ? 44 : 34);

  // 7. QR Code in Framed Container
  const qrBoxX = cfg.width / 2 - cfg.qrBoxSize / 2;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#e4e4e7';
  ctx.lineWidth = size === '13x20' ? 6 : 5;
  roundRect(qrBoxX, currentY, cfg.qrBoxSize, cfg.qrBoxSize, size === '13x20' ? 42 : 36, true, true);

  try {
    const qrImg = await loadImage(qrDataUrl);
    const qrPadding = size === '13x20' ? 36 : 28;
    ctx.drawImage(
      qrImg,
      qrBoxX + qrPadding,
      currentY + qrPadding,
      cfg.qrBoxSize - qrPadding * 2,
      cfg.qrBoxSize - qrPadding * 2
    );
  } catch (err) {
    console.error('Failed to draw QR code on canvas', err);
  }
  currentY += cfg.qrBoxSize + (size === '13x20' ? 46 : 32);

  // 8. 3-Step Clear Instructions Box
  const instBoxW = cardW - (size === '13x20' ? 80 : 70);
  const instBoxX = cfg.width / 2 - instBoxW / 2;

  ctx.fillStyle = '#fafaf9';
  ctx.strokeStyle = '#e7e5e4';
  ctx.lineWidth = 4;
  roundRect(instBoxX, currentY, instBoxW, cfg.instBoxH, size === '13x20' ? 28 : 24, true, true);

  const steps = [
    { num: '1', text: 'Aponte a câmera do seu celular para o QR Code' },
    { num: '2', text: 'Abra o cardápio e personalize seus pratos' },
    { num: '3', text: 'Seu pedido vai direto para a cozinha e garçom' },
  ];

  let stepY = currentY + (size === '13x20' ? 56 : 46);
  steps.forEach((step) => {
    // Circle with step number
    ctx.fillStyle = '#18181b';
    ctx.beginPath();
    ctx.arc(instBoxX + (size === '13x20' ? 54 : 45), stepY - 10, cfg.instCircleRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = `900 ${cfg.instNumFontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(step.num, instBoxX + (size === '13x20' ? 54 : 45), stepY - 1);

    // Step Text
    ctx.fillStyle = '#18181b';
    ctx.font = `bold ${cfg.instTextFontSize}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(step.text, instBoxX + (size === '13x20' ? 98 : 80), stepY);

    stepY += cfg.instLineHeight;
  });
  currentY += cfg.instBoxH + (size === '13x20' ? 36 : 26);

  // 9. Wi-Fi Box (if configured)
  const wifiSsid = config?.wifiSsid;
  const wifiPassword = config?.wifiPassword;
  if (wifiSsid) {
    const wifiText = `📶 Wi-Fi do Restaurante: ${wifiSsid}${wifiPassword ? `  •  Senha: ${wifiPassword}` : ''}`;
    ctx.font = `bold ${cfg.wifiFontSize}px sans-serif`;
    const textWidth = ctx.measureText(wifiText).width;
    const wifiBoxW = Math.min(cardW - 80, textWidth + (size === '13x20' ? 70 : 60));
    const wifiBoxX = cfg.width / 2 - wifiBoxW / 2;
    const wifiBoxH = size === '13x20' ? 68 : 55;

    ctx.save();
    ctx.setLineDash([10, 8]);
    ctx.fillStyle = '#f0fdf4';
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    roundRect(wifiBoxX, currentY, wifiBoxW, wifiBoxH, 20, true, true);
    ctx.restore();

    ctx.fillStyle = '#166534';
    ctx.textAlign = 'center';
    ctx.fillText(wifiText, cfg.width / 2, currentY + (size === '13x20' ? 44 : 36));
    currentY += wifiBoxH + (size === '13x20' ? 30 : 20);
  }

  // 10. Direct URL Link
  ctx.fillStyle = '#71717a';
  ctx.font = `${cfg.urlFontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(`Acesso direto: ${targetUrl}`, cfg.width / 2, currentY);
  currentY += size === '13x20' ? 46 : 38;

  // 11. Footer Branding
  ctx.fillStyle = '#a1a1aa';
  ctx.font = `bold ${size === '13x20' ? 22 : 18}px sans-serif`;
  ctx.fillText('✨ ATENDIMENTO INTELIGENTE NA MESA • COMANDASMART', cfg.width / 2, currentY);

  return canvas;
}

/**
 * Helper to load an image source into an HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/**
 * Generates an A4 sheet canvas containing 2 identical cards (top and bottom) with a central cutting line.
 * Designed for 300 DPI A4 print standard (1240 x 1754 px at 150 DPI or 2480 x 3508 px at 300 DPI).
 */
export async function generateTwoCardsA4Canvas(
  table: Table,
  config: RestaurantConfig | null,
  qrDataUrl: string,
  targetUrl: string,
  size: TableCardSize = '10x15'
): Promise<HTMLCanvasElement> {
  const singleCardCanvas = await generateTableCardCanvas(table, config, qrDataUrl, targetUrl, size);

  // A4 standard at ~150-200 DPI for crisp rendering: 1414 x 2000 px
  const a4Width = 1414;
  const a4Height = 2000;

  const a4Canvas = document.createElement('canvas');
  a4Canvas.width = a4Width;
  a4Canvas.height = a4Height;
  const ctx = a4Canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível inicializar o canvas A4.');

  // Fill White Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, a4Width, a4Height);

  // Calculate target dimensions for each card to fit half of A4 comfortably
  const availableHalfHeight = a4Height / 2 - 50;
  const cardAspectRatio = singleCardCanvas.width / singleCardCanvas.height;
  let targetH = availableHalfHeight * 0.94;
  let targetW = targetH * cardAspectRatio;
  if (targetW > a4Width - 80) {
    targetW = a4Width - 80;
    targetH = targetW / cardAspectRatio;
  }

  // Draw Top Card
  const topX = (a4Width - targetW) / 2;
  const topY = (a4Height / 2 - targetH) / 2 - 10;
  ctx.drawImage(singleCardCanvas, topX, topY, targetW, targetH);

  // Draw Middle Dashed Cutting Line
  const midY = a4Height / 2;
  ctx.save();
  ctx.strokeStyle = '#a1a1aa';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.beginPath();
  ctx.moveTo(40, midY);
  ctx.lineTo(a4Width - 40, midY);
  ctx.stroke();

  // Cut text badge in center
  ctx.setLineDash([]);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(a4Width / 2 - 180, midY - 18, 360, 36);
  ctx.strokeStyle = '#d4d4d8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(a4Width / 2 - 180, midY - 18, 360, 36);

  ctx.fillStyle = '#71717a';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✂️ LINHA DE CORTE • 2 POR FOLHA A4 ✂️', a4Width / 2, midY);
  ctx.restore();

  // Draw Bottom Card
  const bottomX = (a4Width - targetW) / 2;
  const bottomY = a4Height / 2 + (a4Height / 2 - targetH) / 2 + 10;
  ctx.drawImage(singleCardCanvas, bottomX, bottomY, targetW, targetH);

  return a4Canvas;
}

/**
 * Downloads the 2-in-1 A4 sheet image containing two complete table cards
 */
export async function downloadTwoCardsA4Png(
  table: Table,
  config: RestaurantConfig | null,
  qrDataUrl: string,
  targetUrl: string,
  size: TableCardSize = '10x15'
): Promise<void> {
  const canvas = await generateTwoCardsA4Canvas(table, config, qrDataUrl, targetUrl, size);
  const dataUrl = canvas.toDataURL('image/png', 1.0);

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `folha-a4-2-placas-mesa-${table.tableNumber}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Downloads the complete card artwork as a 300 DPI high-resolution PNG image
 */
export async function downloadCompleteCardPng(
  table: Table,
  config: RestaurantConfig | null,
  qrDataUrl: string,
  targetUrl: string,
  size: TableCardSize = '13x20'
): Promise<void> {
  const canvas = await generateTableCardCanvas(table, config, qrDataUrl, targetUrl, size);
  const dataUrl = canvas.toDataURL('image/png', 1.0);

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `placa-${size}-mesa-${table.tableNumber}.png`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Opens the complete card in a dedicated printable new tab / window with the complete art.
 * Supports both single card mode and 2 cards per page (A4) mode.
 */
export async function openCardInPrintWindow(
  table: Table,
  config: RestaurantConfig | null,
  qrDataUrl: string,
  targetUrl: string,
  size: TableCardSize = '13x20',
  copiesPerPage: 1 | 2 = 1
): Promise<void> {
  const canvas = await generateTableCardCanvas(table, config, qrDataUrl, targetUrl, size);
  const dataUrl = canvas.toDataURL('image/png', 1.0);
  const is13x20 = size === '13x20';
  const sizeLabel = is13x20 ? '13cm x 20cm (Grande)' : '10cm x 15cm (Padrão)';
  const printWidthMm = is13x20 ? 128 : 98;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <title>Placa ${sizeLabel} - Mesa ${table.tableNumber} - ${config?.name || 'ComandaSmart'}</title>
      <style>
        @page {
          margin: 4mm;
          size: A4 portrait;
        }
        *, *::before, *::after {
          box-sizing: border-box;
        }
        body {
          margin: 0;
          padding: 24px;
          background: #27272a;
          display: flex;
          flex-direction: column;
          align-items: center;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          min-height: 100vh;
        }
        .header-bar {
          background: #18181b;
          color: #fff;
          padding: 14px 24px;
          border-radius: 16px;
          margin-bottom: 24px;
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          align-items: center;
          justify-content: center;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
          max-width: 780px;
          width: 100%;
        }
        .size-badge {
          background: #d97706;
          color: #fff;
          font-size: 11px;
          font-weight: 900;
          padding: 4px 10px;
          border-radius: 9999px;
          text-transform: uppercase;
        }
        .layout-toggle {
          display: inline-flex;
          background: #09090b;
          padding: 3px;
          border-radius: 10px;
          border: 1px solid #3f3f46;
          gap: 4px;
        }
        .layout-btn {
          background: transparent;
          color: #a1a1aa;
          border: none;
          font-size: 12px;
          font-weight: bold;
          padding: 6px 12px;
          border-radius: 7px;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .layout-btn.active {
          background: #f59e0b;
          color: #09090b;
          font-weight: 900;
        }
        .btn-print {
          background: #f59e0b;
          color: #18181b;
          border: none;
          font-weight: 900;
          font-size: 14px;
          padding: 9px 20px;
          border-radius: 10px;
          cursor: pointer;
          transition: transform 0.1s ease;
        }
        .btn-print:hover {
          background: #fbbf24;
          transform: scale(1.02);
        }
        .btn-save {
          background: #3f3f46;
          color: #fff;
          border: 1px solid #52525b;
          font-weight: bold;
          font-size: 13px;
          padding: 9px 16px;
          border-radius: 10px;
          cursor: pointer;
          text-decoration: none;
        }
        .btn-save:hover {
          background: #52525b;
        }
        .preview-sheet {
          background: #ffffff;
          padding: 16px;
          border-radius: 12px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.6);
          max-width: 520px;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .card-single {
          width: 100%;
          text-align: center;
        }
        .card-img {
          width: 100%;
          height: auto;
          border-radius: 16px;
          display: block;
        }
        /* 2 Per Page Layout */
        .cards-two-up {
          display: none;
          width: 100%;
          flex-direction: column;
          align-items: center;
          gap: 12px;
        }
        .card-slot {
          width: 100%;
          display: flex;
          justify-content: center;
        }
        .card-slot img {
          max-height: 380px;
          width: auto;
          max-width: 100%;
          border-radius: 12px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .cut-line {
          width: 100%;
          border-top: 2px dashed #71717a;
          margin: 8px 0;
          position: relative;
          text-align: center;
        }
        .cut-line span {
          background: #ffffff;
          padding: 0 10px;
          font-size: 11px;
          font-weight: bold;
          font-family: monospace;
          color: #71717a;
          position: relative;
          top: -9px;
        }

        /* PRINT STYLES */
        @media print {
          body {
            background: #ffffff !important;
            padding: 0 !important;
            min-height: auto !important;
          }
          .header-bar {
            display: none !important;
          }
          .preview-sheet {
            background: transparent !important;
            padding: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            max-width: 100% !important;
            width: 100% !important;
          }
          /* Mode Single */
          body.mode-single .card-single {
            display: block !important;
          }
          body.mode-single .card-img {
            max-width: 100% !important;
            width: ${printWidthMm}mm !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body.mode-single .cards-two-up {
            display: none !important;
          }

          /* Mode Two Per Page (A4) */
          body.mode-two .card-single {
            display: none !important;
          }
          body.mode-two .cards-two-up {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            align-items: center !important;
            height: 285mm !important;
            max-height: 285mm !important;
            page-break-inside: avoid !important;
            gap: 0 !important;
          }
          body.mode-two .card-slot {
            height: 136mm !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
          }
          body.mode-two .card-slot img {
            max-height: 135mm !important;
            height: 135mm !important;
            width: auto !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            object-fit: contain !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body.mode-two .cut-line {
            width: 100% !important;
            margin: 2mm 0 !important;
            border-top: 1.5px dashed #71717a !important;
          }
          body.mode-two .cut-line span {
            font-size: 8px !important;
            top: -7px !important;
            background: #fff !important;
          }
        }
      </style>
    </head>
    <body class="${copiesPerPage === 2 ? 'mode-two' : 'mode-single'}">
      <div class="header-bar">
        <span>📄 <strong>Mesa ${table.tableNumber}</strong></span>
        <span class="size-badge">${sizeLabel}</span>

        <!-- Layout Selector Buttons -->
        <div class="layout-toggle">
          <button type="button" class="layout-btn ${copiesPerPage === 1 ? 'active' : ''}" onclick="setLayout(1)">
            📄 1 por Página
          </button>
          <button type="button" class="layout-btn ${copiesPerPage === 2 ? 'active' : ''}" onclick="setLayout(2)">
            📄📄 2 por Página (A4)
          </button>
        </div>

        <button class="btn-print" onclick="window.print()">🖨️ Imprimir Agora</button>
        <a class="btn-save" href="${dataUrl}" download="placa-${size}-mesa-${table.tableNumber}.png">💾 Baixar PNG</a>
      </div>

      <div class="preview-sheet">
        <!-- Single Card Mode View -->
        <div id="view-single" class="card-single" style="display: ${copiesPerPage === 1 ? 'block' : 'none'};">
          <img src="${dataUrl}" class="card-img" alt="Placa Completa Mesa ${table.tableNumber}" />
        </div>

        <!-- Two Cards Per Page Mode View -->
        <div id="view-two" class="cards-two-up" style="display: ${copiesPerPage === 2 ? 'flex' : 'none'};">
          <div class="card-slot">
            <img src="${dataUrl}" alt="Placa Mesa ${table.tableNumber} - Cópia 1" />
          </div>
          <div class="cut-line">
            <span>✂️ LINHA DE CORTE (2 PLACAS POR FOLHA A4) ✂️</span>
          </div>
          <div class="card-slot">
            <img src="${dataUrl}" alt="Placa Mesa ${table.tableNumber} - Cópia 2" />
          </div>
        </div>
      </div>

      <script>
        function setLayout(num) {
          if (num === 2) {
            document.body.classList.remove('mode-single');
            document.body.classList.add('mode-two');
            document.getElementById('view-single').style.display = 'none';
            document.getElementById('view-two').style.display = 'flex';
          } else {
            document.body.classList.remove('mode-two');
            document.body.classList.add('mode-single');
            document.getElementById('view-single').style.display = 'block';
            document.getElementById('view-two').style.display = 'none';
          }
          const buttons = document.querySelectorAll('.layout-btn');
          buttons[0].classList.toggle('active', num === 1);
          buttons[1].classList.toggle('active', num === 2);
        }

        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 350);
        };
      </script>
    </body>
    </html>
  `;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);

  const printWin = window.open(blobUrl, '_blank');
  if (!printWin) {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

