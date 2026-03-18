/** @odoo-module **/

/**
 * POS Auto Invoice Print
 * ======================
 * Imprime la factura automáticamente en cuanto se muestra la pantalla de
 * recibo, si la orden tiene una factura generada.
 *
 * Flujo completo:
 *  1. ReceiptScreen monta (onMounted).
 *  2. Se verifica si la orden fue marcada para facturar.
 *  3. RPC → Python: get_invoice_id_from_pos_order(orderId).
 *  4. Se obtiene el ID de la factura.
 *  5. Se carga /report/html/account.report_invoice_document/<id> en un
 *     iframe oculto dentro del DOM.
 *  6. Al cargar el iframe: iframe.contentWindow.print() → diálogo impresora.
 *  7. window.onafterprint → el iframe se elimina del DOM.
 *
 * Anti-reimpresión:
 *  Un Set global (PRINTED_INVOICE_IDS) impide que la misma factura se
 *  imprima dos veces si el usuario navega atrás/adelante en la misma
 *  sesión de navegador.
 *
 * Compatibilidad: Odoo 19 Community — arquitectura OWL moderna.
 */

import { patch }         from "@web/core/utils/patch";
import { useService }    from "@web/core/utils/hooks";
import { onMounted }     from "@odoo/owl";
import { ReceiptScreen } from "@point_of_sale/app/screens/receipt_screen/receipt_screen";

// ---------------------------------------------------------------------------
// Registro global de facturas ya impresas en esta sesión de navegador.
// Evita doble impresión si ReceiptScreen re-monta (ej: hot reload, back).
// ---------------------------------------------------------------------------
const PRINTED_INVOICE_IDS = new Set();

// ---------------------------------------------------------------------------
// Tiempo de espera (ms) antes de intentar la impresión automática.
// Pequeño buffer para que el servidor termine de confirmar la factura antes
// de que el RPC la busque.
// ---------------------------------------------------------------------------
const AUTO_PRINT_DELAY_MS = 800;

// ---------------------------------------------------------------------------
// Patch principal
// ---------------------------------------------------------------------------
patch(ReceiptScreen.prototype, {

    // ── Lifecycle ────────────────────────────────────────────────────────────
    setup() {
        super.setup(...arguments);

        // Servicios OWL
        this.orm          = useService("orm");
        this.notification = useService("notification");

        // Al montar la pantalla, lanzar la detección automática.
        onMounted(() => {
            // Pequeño delay para asegurar que el account.move ya existe en BD.
            setTimeout(() => {
                this._autoDetectAndPrintInvoice();
            }, AUTO_PRINT_DELAY_MS);
        });
    },

    // ── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Obtiene el ID backend (numérico, > 0) de la orden POS activa.
     * @returns {number|null}
     */
    _getPosOrderBackendId() {
        const order = this.props.order ?? this.pos?.get_order?.();
        if (!order) return null;

        const id = order.id ?? order.backendId ?? null;
        if (!id || typeof id !== "number" || id <= 0) return null;
        return id;
    },

    /**
     * Determina si la orden fue configurada para generar factura.
     *
     * En Odoo 19 POS el flag puede estar en distintos atributos según
     * la versión/parche. Se comprueban todos los nombres conocidos.
     *
     * @returns {boolean}
     */
    _orderIsToInvoice() {
        const order = this.props.order ?? this.pos?.get_order?.();
        if (!order) return false;

        // Nombres conocidos del flag "invoicing" en el modelo JS de POS:
        if (typeof order.is_to_invoice === "function") return order.is_to_invoice();
        if (typeof order.is_to_invoice === "boolean")  return order.is_to_invoice;
        if (typeof order.isToInvoice   === "boolean")  return order.isToInvoice;
        if (typeof order.to_invoice    === "boolean")  return order.to_invoice;

        // Si no encontramos el flag, intentamos de todas formas (el RPC
        // devolverá False si no hay factura y no se imprimirá nada).
        return true;
    },

    // ── Core: detección automática e impresión ────────────────────────────────

    /**
     * Punto de entrada principal — invocado en onMounted con delay.
     *
     * Detecta si hay factura → la imprime automáticamente.
     */
    async _autoDetectAndPrintInvoice() {
        // 1. Verificar flag de facturación en la orden.
        if (!this._orderIsToInvoice()) {
            // Orden sin factura — no hacer nada.
            return;
        }

        // 2. Obtener ID backend de la orden.
        const orderId = this._getPosOrderBackendId();
        if (!orderId) {
            console.warn(
                "[pos_auto_invoice_print] No se pudo obtener el backend ID de la orden."
            );
            return;
        }

        // 3. RPC al backend para obtener el invoice_id.
        let invoiceId;
        try {
            invoiceId = await this.orm.call(
                "pos.order",
                "get_invoice_id_from_pos_order",
                [orderId],
                {}
            );
        } catch (err) {
            console.error(
                "[pos_auto_invoice_print] Error en RPC get_invoice_id_from_pos_order:",
                err
            );
            return;
        }

        if (!invoiceId) {
            // No se encontró factura — silencioso, sin notificación.
            console.info(
                "[pos_auto_invoice_print] Sin factura para order_id=%s — sin impresión.",
                orderId
            );
            return;
        }

        // 4. Anti-reimpresión: si ya imprimimos esta factura en la sesión, salir.
        if (PRINTED_INVOICE_IDS.has(invoiceId)) {
            console.info(
                "[pos_auto_invoice_print] Factura #%s ya fue impresa en esta sesión.",
                invoiceId
            );
            return;
        }

        // 5. Marcar como impresa ANTES de disparar para evitar race conditions.
        PRINTED_INVOICE_IDS.add(invoiceId);

        // 6. Disparar impresión automática.
        this._printInvoiceViaIframe(invoiceId);
    },

    /**
     * Imprime la factura cargando el reporte HTML en un iframe oculto y
     * llamando a contentWindow.print() cuando el documento está listo.
     *
     * ¿Por qué HTML y no PDF?
     * ────────────────────────
     * Los navegadores renderizan los PDF con un plugin nativo que NO expone
     * contentWindow.print(). En cambio, el reporte HTML de Odoo es un
     * documento DOM normal — print() funciona de forma fiable.
     *
     * El CSS de impresión del reporte HTML de Odoo ya está optimizado para
     * que la salida impresa sea idéntica al PDF.
     *
     * @param {number} invoiceId - ID de la account.move a imprimir.
     */
    _printInvoiceViaIframe(invoiceId) {
        const reportUrl =
            `/report/html/account.report_invoice_document/${invoiceId}`;

        console.info(
            "[pos_auto_invoice_print] Iniciando impresión automática → %s",
            reportUrl
        );

        // ── Crear iframe oculto ─────────────────────────────────────────────
        const iframe = document.createElement("iframe");

        // Oculto pero dentro del flujo de render (necesario para print()).
        iframe.setAttribute("id", `pos-invoice-print-frame-${invoiceId}`);
        iframe.style.cssText = [
            "position: fixed",
            "top: -9999px",
            "left: -9999px",
            "width: 1px",
            "height: 1px",
            "border: none",
            "visibility: hidden",
            "pointer-events: none",
        ].join("; ");

        // ── Callback: cuando el reporte HTML está completamente cargado ─────
        iframe.onload = () => {
            try {
                const win = iframe.contentWindow;
                if (!win) {
                    throw new Error("iframe.contentWindow no disponible.");
                }

                // Enfocar el iframe para que print() funcione en todos los
                // navegadores (Chrome requiere focus en el frame objetivo).
                win.focus();

                // Disparar el diálogo de impresora del sistema.
                win.print();

                // Limpiar el iframe después de que el usuario cierre
                // el diálogo de impresión.
                const cleanup = () => {
                    try {
                        document.body.removeChild(iframe);
                    } catch (_) {
                        // El iframe ya fue removido — ignorar.
                    }
                    win.removeEventListener("afterprint", cleanup);
                };

                // afterprint se dispara cuando el diálogo se cierra
                // (tanto si se imprime como si se cancela).
                win.addEventListener("afterprint", cleanup);

                // Fallback safety: remover el iframe a los 60s como máximo
                // por si afterprint no se dispara (ej: Safari < 13).
                setTimeout(cleanup, 60_000);

            } catch (printErr) {
                console.error(
                    "[pos_auto_invoice_print] Error al llamar print():",
                    printErr
                );
                // Fallback: abrir en nueva pestaña para que el usuario imprima
                // manualmente si el método iframe falla.
                window.open(
                    `/report/pdf/account.report_invoice_document/${invoiceId}`,
                    "_blank"
                );
                try { document.body.removeChild(iframe); } catch (_) {}
            }
        };

        // ── Callback de error ───────────────────────────────────────────────
        iframe.onerror = (e) => {
            console.error("[pos_auto_invoice_print] Error cargando el reporte:", e);
            try { document.body.removeChild(iframe); } catch (_) {}
        };

        // ── Asignar src e insertar en el DOM ────────────────────────────────
        iframe.src = reportUrl;
        document.body.appendChild(iframe);
    },
});
