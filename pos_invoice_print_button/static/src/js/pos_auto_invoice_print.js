/** @odoo-module **/

import { patch }         from "@web/core/utils/patch";
import { useService }    from "@web/core/utils/hooks";
import { onMounted }     from "@odoo/owl";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";

// ---------------------------------------------------------------------------
// Registro global para evitar reimpresión
// ---------------------------------------------------------------------------
const PRINTED_INVOICE_IDS = new Set();

// ---------------------------------------------------------------------------
// Patch principal
// ---------------------------------------------------------------------------
patch(ReceiptScreen.prototype, {

    setup() {
        super.setup(...arguments);

        this.orm          = useService("orm");
        this.notification = useService("notification");

        onMounted(() => {
            this._retryAutoPrint(5); // 🔥 retry inteligente
        });
    },

    // -----------------------------------------------------------------------
    // Retry logic (SOLUCIÓN CLAVE)
    // -----------------------------------------------------------------------
    async _retryAutoPrint(retries) {
        for (let i = 0; i < retries; i++) {

            const success = await this._autoDetectAndPrintInvoice();

            if (success) {
                console.log("[pos_auto_invoice_print] Impresión exitosa");
                return;
            }

            console.warn(`[pos_auto_invoice_print] Reintento ${i + 1}/${retries}`);
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        console.warn("[pos_auto_invoice_print] No se pudo imprimir la factura");

        this.notification.add(
            "No se pudo imprimir la factura automáticamente",
            { type: "warning" }
        );
    },

    // -----------------------------------------------------------------------
    // Obtener ID backend de la orden (FIX robusto)
    // -----------------------------------------------------------------------
    _getPosOrderBackendId() {
        const order = this.props.order ?? this.pos?.get_order?.();
        if (!order) return null;

        return order.server_id || order.backendId || order.id || null;
    },

    // -----------------------------------------------------------------------
    // Verificar si la orden es para facturar
    // -----------------------------------------------------------------------
    _orderIsToInvoice() {
        const order = this.props.order ?? this.pos?.get_order?.();
        if (!order) return false;

        if (typeof order.is_to_invoice === "function") return order.is_to_invoice();
        if (typeof order.is_to_invoice === "boolean")  return order.is_to_invoice;
        if (typeof order.isToInvoice   === "boolean")  return order.isToInvoice;
        if (typeof order.to_invoice    === "boolean")  return order.to_invoice;

        return true;
    },

    // -----------------------------------------------------------------------
    // Core
    // -----------------------------------------------------------------------
    async _autoDetectAndPrintInvoice() {

        if (!this._orderIsToInvoice()) {
            return false;
        }

        const orderId = this._getPosOrderBackendId();
        if (!orderId) {
            console.warn("[pos_auto_invoice_print] No hay orderId");
            return false;
        }

        let invoiceId;

        try {
            invoiceId = await this.orm.call(
                "pos.order",
                "get_invoice_id_from_pos_order",
                [orderId],
                {}
            );
        } catch (err) {
            console.error("[pos_auto_invoice_print] Error RPC:", err);
            return false;
        }

        if (!invoiceId) {
            console.log("[pos_auto_invoice_print] Factura aún no disponible");
            return false;
        }

        if (PRINTED_INVOICE_IDS.has(invoiceId)) {
            console.log("[pos_auto_invoice_print] Ya impresa:", invoiceId);
            return true;
        }

        PRINTED_INVOICE_IDS.add(invoiceId);

        this._printInvoiceViaIframe(invoiceId);

        return true;
    },

    // -----------------------------------------------------------------------
    // Impresión por iframe (correcto)
    // -----------------------------------------------------------------------
    _printInvoiceViaIframe(invoiceId) {

        const reportUrl = `/report/html/account.report_invoice_document/${invoiceId}`;

        console.log("[pos_auto_invoice_print] Imprimiendo:", reportUrl);

        const iframe = document.createElement("iframe");

        iframe.style.cssText = `
            position: fixed;
            top: -9999px;
            left: -9999px;
            width: 1px;
            height: 1px;
            border: none;
            visibility: hidden;
        `;

        iframe.onload = () => {
            try {
                const win = iframe.contentWindow;

                if (!win) throw new Error("No contentWindow");

                win.focus();
                win.print();

                const cleanup = () => {
                    try {
                        document.body.removeChild(iframe);
                    } catch (_) {}
                    win.removeEventListener("afterprint", cleanup);
                };

                win.addEventListener("afterprint", cleanup);

                setTimeout(cleanup, 60000);

            } catch (err) {
                console.error("[pos_auto_invoice_print] Error print:", err);

                window.open(
                    `/report/pdf/account.report_invoice_document/${invoiceId}`,
                    "_blank"
                );

                try { document.body.removeChild(iframe); } catch (_) {}
            }
        };

        iframe.onerror = () => {
            console.error("[pos_auto_invoice_print] Error cargando iframe");
            try { document.body.removeChild(iframe); } catch (_) {}
        };

        iframe.src = reportUrl;

        document.body.appendChild(iframe);
    },

});
