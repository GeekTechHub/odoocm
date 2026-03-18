# pos_invoice_print_button — v2 (Auto Print)

**Odoo 19 Community — Impresión Automática de Facturas POS**

Al validar un pago con la opción "Factura" activa, la factura se imprime
automáticamente al aparecer la pantalla de recibo — sin ningún clic adicional.

---

## Flujo completo

```
[Cajero valida pago con "Factura" ✔]
        │
        ▼
[POS crea account.move normalmente]
        │
        ▼
[ReceiptScreen monta — onMounted + 800ms delay]
        │
        ▼
[JS: ¿la orden tenía flag de factura?]
        │  Sí
        ▼
[RPC: pos.order.get_invoice_id_from_pos_order(orderId)]
        │
        ├─── Python busca en account_move (directo)
        ├─── Fallback: invoice_origin = order.name
        └─── Fallback: ref = order.name
        │
        ▼
[¿Factura encontrada?]
        │
        ├── No  → silencio, no hace nada
        │
        └── Sí  → iframe oculto carga /report/html/account.report_invoice_document/<id>
                        │
                        ▼
                  [iframe.onload → contentWindow.print()]
                        │
                        ▼
                  [Diálogo de impresora del SO aparece automáticamente]
                        │
                        ▼
                  [afterprint → iframe se elimina del DOM]
```

---

## ¿Por qué iframe HTML en vez de PDF?

Los navegadores renderizan los PDF con un plugin nativo que **no** expone
`contentWindow.print()`. El reporte HTML de Odoo es un documento DOM normal
cuyo `print()` funciona en todos los navegadores. El CSS de impresión del
reporte ya está optimizado para que la salida sea idéntica al PDF.

---

## Estructura

```
pos_invoice_print_button/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   └── pos_order.py                        ← RPC get_invoice_id_from_pos_order()
└── static/src/
    ├── js/pos_auto_invoice_print.js        ← OWL patch ReceiptScreen (auto print)
    └── xml/pos_auto_invoice_print.xml      ← placeholder (sin UI visual)
```

---

## Instalación

### Prerequisito obligatorio

En **POS → Configuración → Ajustes**, activar la opción **"Factura"**.
Sin esto el POS no crea `account.move` y no hay nada que imprimir.

---

### Docker / docker-compose

```bash
# 1. Copiar el módulo a tu carpeta de addons:
cp -r pos_invoice_print_button /ruta/a/tus/addons/

# 2. Instalar el módulo:
docker exec -it <contenedor_odoo> \
  odoo -d <base_de_datos> \
  --stop-after-init \
  -i pos_invoice_print_button
```

### Odoo.sh

```
1. Push el módulo a tu branch de Odoo.sh.
2. Odoo.sh reconstruye el contenedor automáticamente.
3. Apps → buscar "POS Auto Invoice Print" → Instalar.
```

### Bare-metal / servidor Linux

```bash
# Copiar módulo:
cp -r pos_invoice_print_button /opt/odoo/custom-addons/

# Reiniciar Odoo:
sudo systemctl restart odoo

# Instalar vía CLI:
/opt/odoo/odoo-bin \
  -d <base_de_datos> \
  -c /etc/odoo/odoo.conf \
  --stop-after-init \
  -i pos_invoice_print_button

# O instalar vía UI:
# Apps → Actualizar lista → buscar "POS Auto Invoice Print" → Instalar
```

### Modo desarrollo (más rápido para pruebas)

```bash
python odoo-bin \
  -d <base_de_datos> \
  -c odoo.conf \
  --stop-after-init \
  -u pos_invoice_print_button
```

---

## Troubleshooting

| Síntoma | Causa probable | Solución |
|---|---|---|
| No se abre el diálogo de impresora | Popup blocker activo | Permitir popups para el dominio de Odoo en el navegador |
| Se imprime dos veces | ReceiptScreen monta dos veces | El Set `PRINTED_INVOICE_IDS` evita esto — revisar logs |
| No imprime nada | Flag `is_to_invoice` no detectado | Ver consola del navegador, ajustar la lógica en `_orderIsToInvoice()` |
| "Error cargando reporte" | wkhtmltopdf / renderizado del report | Revisar logs del servidor Odoo |
| Imprime pero vacío | Orden no sincronizada al servidor aún | Aumentar `AUTO_PRINT_DELAY_MS` en el JS (default: 800ms) |

---

## Ajuste fino del delay

Si en tu entorno el servidor tarda más en confirmar la factura, aumenta
`AUTO_PRINT_DELAY_MS` en `pos_auto_invoice_print.js`:

```javascript
const AUTO_PRINT_DELAY_MS = 1500;  // aumentar si hay lag de red
```

---

## Licencia

LGPL-3
