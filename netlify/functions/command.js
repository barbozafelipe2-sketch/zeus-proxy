exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        status: 'error',
        message: 'Method not allowed. Use POST.'
      })
    };
  }

  try {
    const payload = JSON.parse(event.body || '{}');

    // Fluxo avançado de estoque e compras automáticas
    if (isInventoryRequest(payload)) {
      const summary = buildInventorySummary(payload);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'success',
          message: 'Sistema de estoque e compras processado com sucesso.',
          mode: 'inventory_control',
          result: summary
        })
      };
    }

    // Fluxo padrão de roteamento atual
    const input = String(payload.input || '').trim();
    const agent = String(payload.agent || 'zeus').trim().toLowerCase();
    const workspace = String(payload.workspace || 'Chat').trim();
    const source = String(payload.source || 'pegasus_webapp').trim();

    if (!input) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          status: 'error',
          message: 'Missing input.'
        })
      };
    }

    const lower = input.toLowerCase();

    let toolCall = {
      tool: 'route_command',
      args: { input, agent, workspace, source }
    };

    let message = `${capitalize(agent)} received your command and prepared Olympus execution.`;

    if (lower.includes('email') || lower.includes('send')) {
      toolCall = {
        tool: 'send_email',
        args: {
          to: 'contact@example.com',
          subject: 'Draft from Pegasus',
          body: input,
          requested_by: agent
        }
      };
      message = 'Hermes drafted the email payload and queued it for Olympus confirmation.';
    } else if (lower.includes('task') || lower.includes('tomorrow') || lower.includes('remind')) {
      toolCall = {
        tool: 'create_task',
        args: {
          title: input,
          due_hint: 'tomorrow',
          source,
          requested_by: agent
        }
      };
      message = 'Athena translated that into a task payload with timing context.';
    } else if (lower.includes('report') || agent === 'hades') {
      toolCall = {
        tool: 'load_report',
        args: {
          report_id: 'hiro-report',
          view: 'underworld_dashboard',
          query: input,
          requested_by: agent
        }
      };
      message = 'Hades is surfacing the Hiro Report workspace and preparing archive context.';
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: 'success',
        message,
        tool_call: toolCall,
        result: {
          execution_id: `exec_${Date.now()}`,
          mock: true
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        status: 'error',
        message: error.message || 'Unexpected server error.'
      })
    };
  }
};

function isInventoryRequest(payload) {
  if (payload.mode === 'inventory_control') return true;
  if (Array.isArray(payload.items)) return true;
  return Array.isArray(payload.inventory) || Array.isArray(payload.sales);
}

function buildInventorySummary(payload) {
  const items = normalizeItems(payload);
  const defaultDays = clampNumber(payload.analysis_days, 30, 1, 365);

  const autoPurchaseList = items
    .map((item) => {
      const projectedStock = item.stock - item.sold;
      const reorderNeeded = projectedStock <= item.minimum_stock;
      const reorderQty = reorderNeeded
        ? Math.max(item.minimum_stock + item.restock_buffer - projectedStock, 0)
        : 0;

      return {
        sku: item.sku,
        product_name: item.product_name,
        current_stock: item.stock,
        sold_qty: item.sold,
        minimum_stock: item.minimum_stock,
        projected_stock: projectedStock,
        suggested_purchase_qty: reorderQty,
        reorder_needed: reorderNeeded,
        spreadsheet_row: {
          product_name: item.product_name,
          current_stock: item.stock,
          sold_qty: item.sold,
          minimum_stock: item.minimum_stock,
          projected_stock: projectedStock,
          suggested_purchase_qty: reorderQty,
          reorder_needed: reorderNeeded ? 'YES' : 'NO'
        }
      };
    })
    .filter((item) => item.reorder_needed)
    .sort((a, b) => b.suggested_purchase_qty - a.suggested_purchase_qty);

  const shotEstimates = items
    .filter((item) => item.bottle_volume_ml > 0 && item.shot_size_ml > 0)
    .map((item) => {
      const shotsPerBottle = Number((item.bottle_volume_ml / item.shot_size_ml).toFixed(2));
      const approximateRevenue = Number((shotsPerBottle * item.price_per_shot).toFixed(2));

      return {
        sku: item.sku,
        product_name: item.product_name,
        bottle_volume_ml: item.bottle_volume_ml,
        shot_size_ml: item.shot_size_ml,
        estimated_shots_per_bottle: shotsPerBottle,
        estimated_revenue_per_bottle: approximateRevenue
      };
    });

  return {
    analysis_days: defaultDays,
    total_items_analyzed: items.length,
    auto_purchase_count: autoPurchaseList.length,
    auto_purchase_list: autoPurchaseList,
    shot_estimates: shotEstimates,
    spreadsheet_template: {
      tabs: [
        {
          name: 'Estoque',
          columns: ['sku', 'product_name', 'stock', 'minimum_stock', 'sold_qty']
        },
        {
          name: 'Compras Automáticas',
          columns: [
            'product_name',
            'current_stock',
            'sold_qty',
            'minimum_stock',
            'projected_stock',
            'suggested_purchase_qty',
            'reorder_needed'
          ]
        },
        {
          name: 'Shots por Garrafa',
          columns: [
            'product_name',
            'bottle_volume_ml',
            'shot_size_ml',
            'estimated_shots_per_bottle',
            'estimated_revenue_per_bottle'
          ]
        }
      ]
    }
  };
}

function normalizeItems(payload) {
  const rawItems = Array.isArray(payload.items)
    ? payload.items
    : mergeInventoryAndSales(payload.inventory, payload.sales);

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error('For inventory mode, provide items[] or inventory[] + sales[].');
  }

  return rawItems.map((item, index) => ({
    sku: String(item.sku || `ITEM-${index + 1}`).trim(),
    product_name: String(item.product_name || item.name || `Produto ${index + 1}`).trim(),
    stock: clampNumber(item.stock, 0),
    sold: clampNumber(item.sold_qty ?? item.sold ?? 0, 0),
    minimum_stock: clampNumber(item.minimum_stock ?? item.min_stock ?? 0, 0),
    restock_buffer: clampNumber(item.restock_buffer ?? 0, 0),
    bottle_volume_ml: clampNumber(item.bottle_volume_ml ?? item.volume_ml ?? 0, 0),
    shot_size_ml: clampNumber(item.shot_size_ml ?? 50, 1),
    price_per_shot: clampNumber(item.price_per_shot ?? 0, 0)
  }));
}

function mergeInventoryAndSales(inventory, sales) {
  const inventoryList = Array.isArray(inventory) ? inventory : [];
  const salesList = Array.isArray(sales) ? sales : [];

  const salesMap = new Map();

  for (const sale of salesList) {
    const sku = String(sale.sku || '').trim();
    if (!sku) continue;
    const current = salesMap.get(sku) || 0;
    salesMap.set(sku, current + clampNumber(sale.sold_qty ?? sale.qty ?? 0, 0));
  }

  return inventoryList.map((item) => {
    const sku = String(item.sku || '').trim();
    return {
      ...item,
      sold_qty: salesMap.get(sku) || 0
    };
  });
}

function clampNumber(value, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Zeus';
}
