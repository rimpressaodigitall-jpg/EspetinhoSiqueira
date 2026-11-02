import { Order, OrderItem, RestaurantConfig, Table } from '../types';

/**
 * Robust HTML printer utility for restaurant POS, Table QR Tents, and Kitchen Tickets.
 * Uses a hidden sandboxed iframe first, with an infallible popup/new-tab fallback if
 * iframe printing is restricted in embedded environments (like AI Studio preview).
 */

interface PrintOptions {
  title: string;
  htmlContent: string;
}

export function executePrint({ title, htmlContent }: PrintOptions): Promise<boolean> {
  return new Promise((resolve) => {
    // 1. Try hidden iframe printing first
    try {
      const existingFrame = document.getElementById('comanda-smart-print-iframe');
      if (existingFrame) {
        existingFrame.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'comanda-smart-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.top = '-9999px';
      iframe.style.left = '-9999px';
      iframe.style.width = '800px';
      iframe.style.height = '1000px';
      iframe.style.border = 'none';
      iframe.style.opacity = '0';
      iframe.style.pointerEvents = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        throw new Error('Não foi possível acessar o documento de impressão do iframe');
      }

      const fullHtml = `
        <!DOCTYPE html>
        <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            @page {
              margin: 4mm;
              size: auto;
            }
            *, *::before, *::after {
              box-sizing: border-box;
            }
            body {
              margin: 0;
              padding: 0;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @media screen {
              body {
                padding: 16px;
                background: #f4f4f5 !important;
              }
              .print-container {
                background: #fff;
                padding: 20px;
                margin: 0 auto;
                max-width: 480px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                border-radius: 8px;
              }
              .screen-print-bar {
                display: block;
                text-align: center;
                margin-bottom: 16px;
              }
              .btn-print {
                background: #000;
                color: #fff;
                border: none;
                padding: 10px 20px;
                font-size: 14px;
                font-weight: bold;
                border-radius: 6px;
                cursor: pointer;
              }
            }
            @media print {
              .screen-print-bar {
                display: none !important;
              }
              body {
                background: #ffffff !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .print-container {
                width: 100% !important;
                max-width: 100% !important;
                margin: 0 auto !important;
                padding: 0 !important;
                box-shadow: none !important;
                border: none !important;
                background: transparent !important;
              }
              .complete-table-card {
                box-shadow: none !important;
                page-break-inside: avoid !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              .page-break {
                page-break-after: always;
                break-after: page;
              }
            }
            /* Thermal ticket helpers */
            .ticket-mono {
              font-family: "Courier New", Courier, monospace;
            }
          </style>
        </head>
        <body>
          <div class="screen-print-bar">
            <button class="btn-print" onclick="window.print()">🖨️ Imprimir Agora</button>
          </div>
          <div class="print-container">
            ${htmlContent}
          </div>
          <script>
            // Auto focus and print once loaded
            window.onload = function() {
              setTimeout(function() {
                try {
                  window.focus();
                  window.print();
                } catch(e) {
                  console.error('Auto print error', e);
                }
              }, 250);
            };
          </script>
        </body>
        </html>
      `;

      doc.open();
      doc.write(fullHtml);
      doc.close();

      // Wait for any images inside to load
      const images = Array.from(doc.images);
      const imagePromises = images.map((img) => {
        if (img.complete) return Promise.resolve();
        return new Promise((r) => {
          img.onload = r;
          img.onerror = r;
        });
      });

      Promise.all(imagePromises).then(() => {
        setTimeout(() => {
          try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
            resolve(true);
          } catch (printErr) {
            console.warn('Iframe print error, falling back to window.open', printErr);
            fallbackWindowPrint(title, fullHtml);
            resolve(true);
          }
        }, 300);
      });
    } catch (err) {
      console.warn('Standard iframe print failed, falling back to window.open', err);
      fallbackWindowPrint(title, htmlContent);
      resolve(true);
    }
  });
}

function fallbackWindowPrint(title: string, fullOrPartialHtml: string) {
  try {
    const printWin = window.open('', '_blank', 'width=650,height=800,menubar=no,toolbar=no,location=no');
    if (!printWin) {
      console.warn('Pop-up bloqueado pelo navegador ao tentar abrir janela de impressão');
      return;
    }

    if (fullOrPartialHtml.includes('<!DOCTYPE html>')) {
      printWin.document.open();
      printWin.document.write(fullOrPartialHtml);
      printWin.document.close();
    } else {
      printWin.document.open();
      printWin.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${title}</title>
          <style>
            @page { margin: 5mm; }
            body { font-family: sans-serif; margin: 0; padding: 20px; background: #fff; color: #000; }
            .btn-print { background: #000; color: #fff; border: 0; padding: 10px 20px; font-weight: bold; border-radius: 6px; cursor: pointer; margin-bottom: 20px; }
            @media print { .btn-print { display: none !important; } }
          </style>
        </head>
        <body>
          <button class="btn-print" onclick="window.print()">🖨️ Imprimir Cupom</button>
          ${fullOrPartialHtml}
          <script>
            window.onload = function() {
              setTimeout(function() { window.print(); }, 300);
            };
          </script>
        </body>
        </html>
      `);
      printWin.document.close();
    }
  } catch (e) {
    console.error('Fallback print window error', e);
  }
}

// ==========================================
// 1. TABLE TENT / DISPLAY QR CODE PRINT
// ==========================================
// 1. TABLE TENT / COMPLETE DISPLAY CARD PRINT
// ==========================================

export type TableCardSize = '10x15' | '13x20';

export interface TableTentOptions {
  layout?: 'single_card' | 'tent_fold' | 'two_per_page';
  size?: TableCardSize;
}

/**
 * Generates the complete HTML for a table display card (card completo de mesa)
 * Supports '10x15' and '13x20' with extra large fonts and QR code.
 */
export function renderSingleCardHtml(
  table: Table,
  config: RestaurantConfig | null,
  qrDataUrl: string,
  targetUrl: string,
  isMini = false,
  size: TableCardSize = '13x20'
): string {
  const restaurantName = config?.name || 'ComandaSmart';
  const tagline = config?.tagline || 'Cardápio Digital & Atendimento na Mesa';
  const is13x20 = size === '13x20' && !isMini;

  const logoTag = config?.logoUrl
    ? `<img src="${config.logoUrl}" alt="${restaurantName}" style="max-height: ${isMini ? '42px' : is13x20 ? '72px' : '56px'}; max-width: ${is13x20 ? '180px' : '140px'}; margin: 0 auto 6px auto; display: block; border-radius: 14px; object-fit: contain;" />`
    : `<div style="font-size: ${isMini ? '24px' : is13x20 ? '40px' : '32px'}; line-height: 1; margin-bottom: 4px;">🍽️</div>`;

  const wifiBox = config?.wifiSsid
    ? `
      <div style="margin: ${isMini ? '8px 0' : is13x20 ? '14px 0' : '12px 0'}; background: #f0fdf4; border: 1.5px dashed #22c55e; border-radius: 12px; padding: ${is13x20 ? '8px 16px' : '6px 12px'}; font-size: ${isMini ? '10px' : is13x20 ? '13px' : '11px'}; color: #166534; display: inline-block; max-width: 100%; box-sizing: border-box; font-weight: bold;">
        📶 Wi-Fi do Restaurante: <strong>${config.wifiSsid}</strong>${
          config.wifiPassword ? ` &nbsp;•&nbsp; Senha: <strong>${config.wifiPassword}</strong>` : ''
        }
      </div>
    `
    : '';

  return `
    <div class="complete-table-card" style="
      width: ${isMini ? '320px' : is13x20 ? '440px' : '360px'};
      margin: 0 auto;
      padding: ${isMini ? '16px 14px' : is13x20 ? '28px 24px' : '22px 18px'};
      border: ${is13x20 ? '4px' : '3px'} solid #18181b;
      border-radius: ${is13x20 ? '28px' : '22px'};
      background: #ffffff;
      box-sizing: border-box;
      text-align: center;
      position: relative;
      page-break-inside: avoid;
      box-shadow: 0 6px 24px rgba(0,0,0,0.08);
    ">
      <!-- Decorative Corner Guide -->
      <div style="position: absolute; top: 10px; left: 14px; font-size: 10px; color: #71717a; font-family: monospace; font-weight: bold;">✂️ Recorte</div>
      <div style="position: absolute; top: 10px; right: 14px; font-size: 10px; color: #71717a; font-family: monospace; font-weight: bold;">${is13x20 ? 'Display 13x20cm (Grande)' : 'Display 10x15cm (Padrão)'}</div>

      <!-- Restaurant Header -->
      <div style="margin-top: 10px; margin-bottom: 12px;">
        ${logoTag}
        <h1 style="margin: 0; font-size: ${isMini ? '18px' : is13x20 ? '26px' : '22px'}; font-weight: 900; letter-spacing: -0.5px; text-transform: uppercase; color: #18181b; line-height: 1.2;">
          ${restaurantName}
        </h1>
        <p style="margin: 3px 0 0 0; font-size: ${isMini ? '10px' : is13x20 ? '12px' : '11px'}; color: #71717a; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
          ${tagline}
        </p>
      </div>

      <!-- Table Badge -->
      <div style="
        background: #fffbeb;
        border: ${is13x20 ? '3px' : '2.5px'} solid #d97706;
        border-radius: ${is13x20 ? '20px' : '16px'};
        padding: ${isMini ? '6px 14px' : is13x20 ? '10px 24px' : '8px 18px'};
        display: inline-block;
        margin-bottom: 14px;
        box-shadow: 0 2px 10px rgba(217, 119, 6, 0.18);
      ">
        <span style="font-size: ${is13x20 ? '12px' : '10px'}; font-weight: 900; color: #b45309; text-transform: uppercase; letter-spacing: 2px; display: block;">
          SEJA BEM-VINDO
        </span>
        <span style="font-size: ${isMini ? '28px' : is13x20 ? '46px' : '34px'}; font-weight: 900; color: #b45309; line-height: 1.1; letter-spacing: -0.5px;">
          MESA ${table.tableNumber}
        </span>
      </div>

      <!-- QR Code with Frame and High Clarity -->
      <div style="margin-bottom: 14px;">
        <div style="
          background: #ffffff;
          padding: ${isMini ? '8px' : is13x20 ? '16px' : '12px'};
          border: 2px solid #e4e4e7;
          border-radius: ${is13x20 ? '24px' : '18px'};
          display: inline-block;
          box-shadow: inset 0 2px 6px rgba(0,0,0,0.04);
        ">
          ${
            qrDataUrl
              ? `<img src="${qrDataUrl}" alt="QR Code Mesa ${table.tableNumber}" style="width: ${isMini ? '170px' : is13x20 ? '260px' : '210px'}; height: ${isMini ? '170px' : is13x20 ? '260px' : '210px'}; display: block; image-rendering: pixelated;" />`
              : '<div style="width: 180px; height: 180px; line-height: 180px; color: #999;">Gerando QR Code...</div>'
          }
        </div>
      </div>

      <!-- Clear 3-Step Instructions (Extra Large & Legible) -->
      <div style="
        margin: ${isMini ? '8px 0' : is13x20 ? '14px 0' : '12px 0'};
        background: #fafaf9;
        border: 1.5px solid #e7e5e4;
        border-radius: ${is13x20 ? '18px' : '14px'};
        padding: ${isMini ? '8px 10px' : is13x20 ? '12px 14px' : '10px 12px'};
        text-align: left;
      ">
        <div style="display: flex; align-items: center; gap: ${is13x20 ? '10px' : '8px'}; margin-bottom: ${is13x20 ? '7px' : '5px'};">
          <span style="background: #18181b; color: #fff; font-size: ${is13x20 ? '12px' : '10px'}; font-weight: 900; width: ${is13x20 ? '20px' : '16px'}; height: ${is13x20 ? '20px' : '16px'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; shrink-0;">1</span>
          <span style="font-size: ${isMini ? '10px' : is13x20 ? '13px' : '11px'}; font-weight: 800; color: #18181b;">Aponte a câmera do seu celular para o QR Code</span>
        </div>
        <div style="display: flex; align-items: center; gap: ${is13x20 ? '10px' : '8px'}; margin-bottom: ${is13x20 ? '7px' : '5px'};">
          <span style="background: #18181b; color: #fff; font-size: ${is13x20 ? '12px' : '10px'}; font-weight: 900; width: ${is13x20 ? '20px' : '16px'}; height: ${is13x20 ? '20px' : '16px'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; shrink-0;">2</span>
          <span style="font-size: ${isMini ? '10px' : is13x20 ? '13px' : '11px'}; font-weight: 800; color: #18181b;">Abra o cardápio e personalize seus pratos</span>
        </div>
        <div style="display: flex; align-items: center; gap: ${is13x20 ? '10px' : '8px'};">
          <span style="background: #18181b; color: #fff; font-size: ${is13x20 ? '12px' : '10px'}; font-weight: 900; width: ${is13x20 ? '20px' : '16px'}; height: ${is13x20 ? '20px' : '16px'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; shrink-0;">3</span>
          <span style="font-size: ${isMini ? '10px' : is13x20 ? '13px' : '11px'}; font-weight: 800; color: #18181b;">Seu pedido vai direto para a cozinha e garçom</span>
        </div>
      </div>

      <!-- Wi-Fi Box (if configured) -->
      ${wifiBox}

      <!-- Direct Link for devices without camera -->
      <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #d4d4d8; font-size: ${isMini ? '8.5px' : is13x20 ? '11px' : '9.5px'}; color: #71717a; word-break: break-all; font-family: monospace;">
        Acesso direto: ${targetUrl}
      </div>

      <!-- Footer Brand & Usage Info -->
      <div style="margin-top: 10px; font-size: ${is13x20 ? '10px' : '8.5px'}; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.5px; font-weight: bold;">
        ✨ Atendimento Inteligente na Mesa • ComandaSmart
      </div>
    </div>
  `;
}

export function printTableTent(
  table: Table,
  config: RestaurantConfig | null,
  qrDataUrl: string,
  targetUrl: string,
  options: TableTentOptions = { layout: 'single_card' }
) {
  const restaurantName = config?.name || 'ComandaSmart';

  if (options.layout === 'two_per_page') {
    // 2 Placas idênticas por folha A4 com guia de corte ao meio
    const cardSideA = renderSingleCardHtml(table, config, qrDataUrl, targetUrl, true, options.size || '10x15');
    const cardSideB = renderSingleCardHtml(table, config, qrDataUrl, targetUrl, true, options.size || '10x15');

    const twoPerPageHtml = `
      <div style="max-width: 760px; margin: 0 auto; text-align: center;">
        <div style="margin-bottom: 8px; font-size: 11px; color: #71717a; font-weight: bold;">
          📄 2 PLACAS POR PÁGINA (FOLHA A4) — MESA ${table.tableNumber}
        </div>

        <div style="display: flex; flex-direction: column; align-items: center; justify-content: space-between; min-height: 275mm; gap: 8px;">
          <div style="width: 100%; display: flex; justify-content: center;">
            ${cardSideA}
          </div>

          <div style="width: 100%; border-top: 2px dashed #71717a; margin: 10px 0; position: relative; text-align: center;">
            <span style="background: #ffffff; padding: 2px 14px; font-size: 10px; color: #71717a; font-family: monospace; font-weight: bold; position: relative; top: -9px;">
              ✂️ LINHA DE CORTE • CORTE AO MEIO PARA SEPARAR AS 2 PLACAS ✂️
            </span>
          </div>

          <div style="width: 100%; display: flex; justify-content: center;">
            ${cardSideB}
          </div>
        </div>
      </div>
    `;

    return executePrint({
      title: `2 Placas por Página A4 - Mesa ${table.tableNumber} - ${restaurantName}`,
      htmlContent: twoPerPageHtml,
    });
  }

  if (options.layout === 'tent_fold') {
    // Double-sided folding tent card: Two identical cards printed on 1 page with a center fold line
    const cardSideA = renderSingleCardHtml(table, config, qrDataUrl, targetUrl, true);
    const cardSideB = renderSingleCardHtml(table, config, qrDataUrl, targetUrl, true);

    const foldHtml = `
      <div style="max-width: 720px; margin: 0 auto; text-align: center;">
        <div style="margin-bottom: 8px; font-size: 11px; color: #71717a; font-weight: bold;">
          📄 DISPLAY TENDA DE MESA DOBRÁVEL (FRENTE E VERSO) — MESA ${table.tableNumber}
        </div>

        <div style="display: flex; justify-content: center; gap: 20px; align-items: stretch; flex-wrap: wrap;">
          <div>
            <div style="font-size: 9px; font-weight: 800; color: #a1a1aa; text-transform: uppercase; margin-bottom: 4px;">[ FACE 1 - FRENTE ]</div>
            ${cardSideA}
          </div>

          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 0 10px;">
            <div style="border-left: 2px dashed #a1a1aa; height: 100%; min-height: 380px;"></div>
            <div style="font-size: 9px; color: #71717a; font-weight: bold; margin-top: 6px; writing-mode: vertical-rl; transform: rotate(180deg); letter-spacing: 1px;">
              ✂️ LINHA DE DOBRA NO MEIO
            </div>
          </div>

          <div>
            <div style="font-size: 9px; font-weight: 800; color: #a1a1aa; text-transform: uppercase; margin-bottom: 4px;">[ FACE 2 - VERSO ]</div>
            ${cardSideB}
          </div>
        </div>

        <div style="margin-top: 14px; font-size: 10px; color: #71717a; font-weight: 600;">
          💡 Como usar: Imprima em papel offset, sulfite encorpado ou papel cartão. Dobre na linha tracejada central para ficar de pé na mesa.
        </div>
      </div>
    `;

    return executePrint({
      title: `Tenda de Mesa Dobrável - Mesa ${table.tableNumber} - ${restaurantName}`,
      htmlContent: foldHtml,
    });
  }

  // Standard single complete card
  const cardSize = options.size || '13x20';
  const singleCardHtml = `
    <div style="display: flex; justify-content: center; align-items: center; min-height: 80vh;">
      ${renderSingleCardHtml(table, config, qrDataUrl, targetUrl, false, cardSize)}
    </div>
  `;

  return executePrint({
    title: `Card Completo de Mesa (${cardSize === '13x20' ? '13x20cm' : '10x15cm'}) - Mesa ${table.tableNumber} - ${restaurantName}`,
    htmlContent: singleCardHtml,
  });
}

export function printAllTableTents(
  tables: Table[],
  config: RestaurantConfig | null,
  qrMap: Record<string, string>,
  resolveTableUrl: (tableNum: string) => string
) {
  const restaurantName = config?.name || 'ComandaSmart';

  const cardsHtml = tables
    .map((table, idx) => {
      const qrDataUrl = qrMap[table.tableNumber] || '';
      const tableUrl = resolveTableUrl(table.tableNumber);

      return `
        <div style="width: 48%; display: inline-block; vertical-align: top; margin-bottom: 24px; box-sizing: border-box; page-break-inside: avoid;">
          ${renderSingleCardHtml(table, config, qrDataUrl, tableUrl, true)}
        </div>
        ${(idx + 1) % 2 === 0 ? '<div style="clear: both;"></div>' : ''}
        ${(idx + 1) % 4 === 0 && idx !== tables.length - 1 ? '<div class="page-break"></div>' : ''}
      `;
    })
    .join('');

  const fullContent = `
    <div style="max-width: 820px; margin: 0 auto; padding: 10px;">
      <div style="text-align: center; margin-bottom: 16px; border-bottom: 2px solid #18181b; padding-bottom: 10px;">
        <h1 style="margin: 0; font-size: 22px; font-weight: 900; text-transform: uppercase;">Cards Completos de Mesa com QR Code</h1>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #52525b;">${restaurantName} • Total de ${tables.length} mesas prontas para impressão e recorte</p>
      </div>
      <div style="display: flex; flex-wrap: wrap; justify-content: space-between;">
        ${cardsHtml}
      </div>
    </div>
  `;

  return executePrint({
    title: `Todos os Cards de Mesa - ${restaurantName}`,
    htmlContent: fullContent,
  });
}

// ==========================================
// 2. KITCHEN / BAR PRODUCTION TICKET (80mm / 58mm)
// ==========================================

export function printKitchenOrder(order: Order, config: RestaurantConfig | null) {
  let items: OrderItem[] = [];
  try {
    items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
  } catch (e) {
    items = [];
  }

  const restaurantName = config?.name || 'ComandaSmart';
  const orderTime = new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const orderDate = new Date(order.createdAt).toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });

  const itemsHtml = items
    .map((item) => {
      const optionsHtml =
        item.selectedOptions && item.selectedOptions.length > 0
          ? `<div style="font-size: 12px; font-weight: 600; padding-left: 12px; color: #333;">+ ${item.selectedOptions.join(', ')}</div>`
          : '';

      const notesHtml = item.notes
        ? `<div style="font-size: 12px; font-weight: 900; background: #000; color: #fff; padding: 2px 6px; border-radius: 4px; display: inline-block; margin-top: 3px;">⚠️ OBS: ${item.notes.toUpperCase()}</div>`
        : '';

      return `
        <div style="padding: 8px 0; border-bottom: 1px dashed #999;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between;">
            <div style="font-size: 17px; font-weight: 900; line-height: 1.2;">
              <span style="font-size: 20px; text-decoration: underline; margin-right: 6px;">[${item.quantity}x]</span>
              ${item.name.toUpperCase()}
            </div>
          </div>
          ${optionsHtml}
          ${notesHtml}
        </div>
      `;
    })
    .join('');

  const html = `
    <div class="ticket-mono" style="max-width: 320px; margin: 0 auto; padding: 6px 0; font-size: 13px; line-height: 1.3;">
      <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 6px;">
        <div style="font-size: 18px; font-weight: 900; text-transform: uppercase;">
          *** COZINHA / PRODUÇÃO ***
        </div>
        <div style="font-size: 12px; font-weight: bold;">${restaurantName}</div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; background: #000; color: #fff; padding: 6px 8px; border-radius: 6px; margin-bottom: 8px;">
        <div style="font-size: 26px; font-weight: 900; line-height: 1;">
          MESA ${order.tableNumber}
        </div>
        <div style="text-align: right; font-size: 11px;">
          <div>PEDIDO #${order.id.slice(-4).toUpperCase()}</div>
          <div style="font-weight: bold;">${orderTime} (${orderDate})</div>
        </div>
      </div>

      ${
        order.customerName
          ? `<div style="padding: 4px 0; font-size: 13px; border-bottom: 1px solid #ccc; margin-bottom: 6px;">
              CLIENTE: <strong>${order.customerName.toUpperCase()}</strong>
            </div>`
          : ''
      }

      ${
        order.generalNotes
          ? `<div style="padding: 6px; background: #e5e5e5; border-left: 4px solid #000; margin-bottom: 8px; font-size: 12px; font-weight: bold;">
              OBS GERAL: ${order.generalNotes.toUpperCase()}
            </div>`
          : ''
      }

      <div style="border-top: 1px solid #000; margin-bottom: 4px;">
        ${itemsHtml}
      </div>

      <div style="text-align: center; margin-top: 12px; padding-top: 8px; border-top: 2px dashed #000; font-size: 11px;">
        <div>Total de Itens: <strong>${items.reduce((acc, it) => acc + it.quantity, 0)}</strong></div>
        <div style="margin-top: 4px; font-size: 9px; letter-spacing: 1px;">================================</div>
        <div style="font-size: 10px; margin-top: 2px;">ComandaSmart • Sistema de Gestão</div>
      </div>
    </div>
  `;

  return executePrint({
    title: `Cozinha - Mesa ${order.tableNumber} (#${order.id.slice(-4)})`,
    htmlContent: html,
  });
}

// ==========================================
// 3. TABLE BILL & CLOSING RECEIPT (EXTRATO / CONFERÊNCIA)
// ==========================================

export interface BillReceiptData {
  tableNumber: string;
  items: { item: OrderItem; status?: string }[];
  subtotal: number;
  serviceFee: number;
  serviceTaxPercent: number;
  total: number;
  paymentMethod?: string;
  cashGiven?: number;
  changeDue?: number;
  type: 'conference' | 'receipt'; // 'conference' = conferência de mesa antes de pagar; 'receipt' = cupom após pagamento
  config: RestaurantConfig | null;
}

export function printTableBill(data: BillReceiptData) {
  const {
    tableNumber,
    items,
    subtotal,
    serviceFee,
    serviceTaxPercent,
    total,
    paymentMethod,
    cashGiven,
    changeDue,
    type,
    config,
  } = data;

  const restaurantName = config?.name || 'ComandaSmart';
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });

  const titleHeader =
    type === 'receipt'
      ? 'RECIBO DE PAGAMENTO'
      : 'CONFERÊNCIA DE MESA';

  const subtitle =
    type === 'receipt'
      ? 'Comprovante de Encerramento de Conta'
      : 'Extrato para Pagamento (Não é Cupom Fiscal)';

  const rowsHtml = items
    .map(({ item }) => {
      const itemTotal = (item.price * item.quantity).toFixed(2).replace('.', ',');
      const unitPrice = item.price.toFixed(2).replace('.', ',');

      return `
        <tr style="border-bottom: 1px dashed #d1d5db;">
          <td style="padding: 4px 0; vertical-align: top;">
            <div style="font-weight: bold; font-size: 13px;">${item.name}</div>
            <div style="font-size: 11px; color: #4b5563;">
              ${item.quantity} x R$ ${unitPrice}
              ${item.selectedOptions && item.selectedOptions.length > 0 ? ` (+${item.selectedOptions.join(', ')})` : ''}
            </div>
          </td>
          <td style="padding: 4px 0; vertical-align: top; text-align: right; font-weight: bold; font-size: 13px;">
            R$ ${itemTotal}
          </td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <div class="ticket-mono" style="max-width: 320px; margin: 0 auto; padding: 4px 0; font-size: 13px; line-height: 1.35; color: #000;">
      <!-- Restaurant Header -->
      <div style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px;">
        <h2 style="margin: 0; font-size: 17px; font-weight: 900; text-transform: uppercase;">
          ${restaurantName}
        </h2>
        ${config?.address ? `<div style="font-size: 10px; color: #374151;">${config.address}</div>` : ''}
        ${config?.phone ? `<div style="font-size: 10px; color: #374151;">Tel / WhatsApp: ${config.phone}</div>` : ''}
      </div>

      <!-- Ticket Title -->
      <div style="text-align: center; margin-bottom: 8px;">
        <div style="font-size: 14px; font-weight: 900; letter-spacing: 0.5px;">
          *** ${titleHeader} ***
        </div>
        <div style="font-size: 9px; color: #6b7280; text-transform: uppercase;">
          ${subtitle}
        </div>
      </div>

      <!-- Table & Time Banner -->
      <div style="display: flex; justify-content: space-between; border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 4px 0; margin-bottom: 8px; font-size: 12px; font-weight: bold;">
        <span>MESA ${tableNumber}</span>
        <span>${dateStr} ${timeStr}</span>
      </div>

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
        <thead>
          <tr style="border-bottom: 1px solid #000; font-size: 11px; text-transform: uppercase;">
            <th style="text-align: left; padding: 2px 0;">Item / Descrição</th>
            <th style="text-align: right; padding: 2px 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <!-- Totals Section -->
      <div style="border-top: 1px solid #000; padding-top: 6px; margin-bottom: 8px; font-size: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
          <span>Subtotal dos Itens:</span>
          <span style="font-weight: bold;">R$ ${subtotal.toFixed(2).replace('.', ',')}</span>
        </div>
        ${
          serviceFee > 0
            ? `<div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span>Taxa de Serviço (${serviceTaxPercent}%):</span>
                <span>R$ ${serviceFee.toFixed(2).replace('.', ',')}</span>
              </div>`
            : ''
        }
        <div style="display: flex; justify-content: space-between; font-size: 17px; font-weight: 900; border-top: 2px solid #000; padding-top: 4px; margin-top: 4px;">
          <span>TOTAL A PAGAR:</span>
          <span>R$ ${total.toFixed(2).replace('.', ',')}</span>
        </div>
      </div>

      <!-- Payment details if available -->
      ${
        paymentMethod
          ? `<div style="background: #f3f4f6; border-radius: 6px; padding: 6px; margin-bottom: 8px; font-size: 12px;">
              <div style="display: flex; justify-content: space-between;">
                <span>Forma de Pagamento:</span>
                <strong style="text-transform: uppercase;">${paymentMethod}</strong>
              </div>
              ${
                cashGiven && cashGiven > 0
                  ? `<div style="display: flex; justify-content: space-between; margin-top: 2px;">
                      <span>Valor Pago em Espécie:</span>
                      <span>R$ ${cashGiven.toFixed(2).replace('.', ',')}</span>
                    </div>`
                  : ''
              }
              ${
                changeDue && changeDue > 0
                  ? `<div style="display: flex; justify-content: space-between; margin-top: 2px; font-weight: bold; color: #047857;">
                      <span>Troco:</span>
                      <span>R$ ${changeDue.toFixed(2).replace('.', ',')}</span>
                    </div>`
                  : ''
              }
            </div>`
          : ''
      }

      <!-- PIX key if configured -->
      ${
        config?.pixKey
          ? `<div style="border: 1px dashed #000; padding: 6px; text-align: center; border-radius: 6px; margin-bottom: 8px; font-size: 11px;">
              <span style="font-weight: bold; display: block;">Chave PIX do Estabelecimento:</span>
              <span style="font-weight: bold; font-family: monospace;">${config.pixKey}</span>
            </div>`
          : ''
      }

      <!-- Footer Message -->
      <div style="text-align: center; border-top: 2px dashed #000; padding-top: 8px; font-size: 11px;">
        <div style="font-weight: bold;">Agradecemos a sua preferência!</div>
        <div style="font-size: 10px; color: #4b5563; margin-top: 2px;">Volte sempre!</div>
        <div style="margin-top: 6px; font-size: 8px; color: #9ca3af; letter-spacing: 1px;">================================</div>
      </div>
    </div>
  `;

  return executePrint({
    title: `${titleHeader} - Mesa ${tableNumber} - R$ ${total.toFixed(2)}`,
    htmlContent: html,
  });
}
