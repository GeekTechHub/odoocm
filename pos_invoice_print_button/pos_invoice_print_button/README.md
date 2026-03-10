# pos_invoice_print_button

**Odoo 19 Community — POS Invoice Print Button**

Adds a **"Print Invoice"** button to the POS Receipt Screen that opens the
standard Odoo accounting invoice (`account.report_invoice_document`) as a PDF
in a new browser tab.

---

## Features

| Feature | Detail |
|---|---|
| Print Invoice button | Appears on the Receipt Screen next to "Print Receipt" |
| Loading spinner | Visible while the RPC call is in flight |
| Warning notification | Shown when no invoice is linked to the order |
| Error notification | Shown on RPC failures |
| Community-only | No Enterprise dependency |
| Odoo 19 OWL | Uses `patch()` + `useState` + `useService` |

---

## Requirements

- Odoo **19 Community** (or 17/18 with minor xpath adjustment)
- The **"Invoice"** option must be enabled in POS settings so that orders
  generate an `account.move` record upon payment.

---

## Module Structure

```
pos_invoice_print_button/
├── __init__.py
├── __manifest__.py
├── models/
│   ├── __init__.py
│   └── pos_order.py          ← RPC method get_invoice_id_from_pos_order()
└── static/
    └── src/
        ├── js/
        │   └── pos_invoice_button.js   ← OWL patch on ReceiptScreen
        └── xml/
            └── pos_invoice_button.xml  ← Template extension (xpath)
```

---

## How It Works

```
[Cashier clicks "Print Invoice"]
        │
        ▼
[JS: _getCurrentOrderBackendId()]
        │  Gets the server-side order.id from the current POS order
        ▼
[RPC: orm.call("pos.order", "get_invoice_id_from_pos_order", [orderId])]
        │
        ├─── Python searches account_move field (direct link)
        ├─── Fallback: searches account.move by invoice_origin = order.name
        └─── Fallback: searches account.move by ref = order.name
        │
        ▼
[Returns invoice_id  OR  False]
        │
        ├── False → notification.add("Invoice Not Found", type="warning")
        │
        └── Found → window.open("/report/pdf/account.report_invoice_document/<id>", "_blank")
```

---

## Installation

### Option A — Odoo.sh

1. Fork or push this module to your Odoo.sh repository branch.
2. In the Odoo.sh dashboard, go to **Settings → Branches → Your Branch**.
3. Click **Install** and wait for the build to complete.
4. Go to **Apps** in Odoo, search for `POS Invoice Print Button`, and install.

### Option B — Docker / docker-compose

```bash
# 1. Copy the module into your addons volume:
cp -r pos_invoice_print_button /path/to/your/addons/

# 2. Update the module list:
docker exec -it <odoo_container> odoo -d <database> --stop-after-init -u base

# 3. Install the module:
docker exec -it <odoo_container> \
  odoo -d <database> \
  --stop-after-init \
  -i pos_invoice_print_button
```

### Option C — Local / bare-metal Odoo

```bash
# 1. Copy module to your custom addons path:
cp -r pos_invoice_print_button /opt/odoo/custom-addons/

# 2. Restart Odoo to pick up the new addons path:
sudo systemctl restart odoo

# 3. Update module list via UI:
#    Settings → Technical → Update App List

# 4. Install via UI:
#    Apps → search "POS Invoice Print Button" → Install

# --- OR via CLI: ---
/opt/odoo/odoo-bin -d <database> \
  --addons-path=/opt/odoo/addons,/opt/odoo/custom-addons \
  --stop-after-init \
  -i pos_invoice_print_button
```

### Option D — Development mode (fastest)

```bash
# Activate developer mode in Odoo (Settings → Developer Tools)
# Then from the CLI:
python odoo-bin \
  -d <your_database> \
  -c /etc/odoo/odoo.conf \
  --stop-after-init \
  -u pos_invoice_print_button
```

---

## Configuration

1. Go to **Point of Sale → Configuration → Settings**.
2. Enable the **"Invoice"** option (usually under the Payments or Bills section).
3. Open the POS session.
4. On the payment screen, check **"Invoice"** before validating payment.
5. On the Receipt Screen the **"Print Invoice"** button will now be visible.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Button not visible | JS/XML not loaded | Clear browser cache, restart Odoo, check assets |
| "Invoice Not Found" warning | Invoice option was not enabled during payment | Enable Invoice in POS settings |
| "Invoice Not Found" warning | Order not yet synced | Wait for order to sync, or check internet |
| PDF blank / error | Report rendering issue | Check Odoo server logs for wkhtmltopdf errors |
| xpath not matching | Different Odoo version template | Update xpath in `pos_invoice_button.xml` |

### Checking the xpath

If the button is not injected, inspect the ReceiptScreen DOM in your browser
devtools and find the correct class name for the Print Receipt button, then
update the xpath in `pos_invoice_button.xml`:

```xml
<!-- Example if the class is different in your version: -->
<xpath expr="//button[hasclass('your-actual-class')]" position="after">
```

---

## License

LGPL-3
