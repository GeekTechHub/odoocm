/** @odoo-module **/

/**
 * POS Invoice Print Button
 * ========================
 * Patches the ReceiptScreen component to add a "Print Invoice" button.
 *
 * Flow:
 *  1. User presses "Print Invoice" on the Receipt Screen.
 *  2. JS calls the Python RPC method `get_invoice_id_from_pos_order`
 *     on the `pos.order` model, passing the backend order ID.
 *  3. Python returns the linked account.move ID (or False).
 *  4. If found, opens /report/pdf/account.report_invoice_document/<id>
 *     in a new browser tab.
 *  5. If not found, shows a warning notification.
 *
 * Compatible with: Odoo 19 Community — OWL-based POS architecture.
 */

import { patch }           from "@web/core/utils/patch";
import { useService }      from "@web/core/utils/hooks";
import { useState }        from "@odoo/owl";
import { ReceiptScreen }   from "@point_of_sale/app/screens/receipt_screen/receipt_screen";

// ---------------------------------------------------------------------------
// Patch ReceiptScreen
// ---------------------------------------------------------------------------
patch(ReceiptScreen.prototype, {

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------
    setup() {
        // Always call super.setup() first so all original services are wired.
        super.setup(...arguments);

        // ORM service for backend RPC calls.
        this.orm = useService("orm");

        // Notification service for user-visible feedback.
        this.notification = useService("notification");

        // Local reactive state for the loading spinner.
        // `isLoadingInvoice` is true while waiting for the RPC response.
        this.invoicePrintState = useState({
            isLoadingInvoice: false,
        });
    },

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    /**
     * Returns the backend (server) ID of the current POS order.
     *
     * In Odoo 19 POS, after an order is synced / finalised it receives a
     * numeric `id` from the server.  The field is stored directly on the
     * order object as `order.id` (the JS model mirrors the Python model's id).
     *
     * @returns {number|null}
     */
    _getCurrentOrderBackendId() {
        // In the ReceiptScreen the order is available via:
        //   - this.props.order   (passed explicitly in some flows), or
        //   - this.pos.get_order() (the current active order on the POS model).
        const order = this.props.order ?? this.pos?.get_order?.();

        if (!order) {
            return null;
        }

        // `order.id` is the numeric backend ID once the order has been saved.
        // `order.backendId` is used in some Odoo versions as an alias.
        const backendId = order.id ?? order.backendId ?? null;

        // Filter out client-side temporary IDs which are negative integers or
        // non-numeric strings in some OWL POS implementations.
        if (!backendId || typeof backendId !== "number" || backendId <= 0) {
            return null;
        }

        return backendId;
    },

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    /**
     * Handler for the "Print Invoice" button click.
     *
     * Fetches the related invoice ID via RPC and opens the PDF in a new tab.
     */
    async printInvoice() {
        // Prevent double-clicks while loading.
        if (this.invoicePrintState.isLoadingInvoice) {
            return;
        }

        const orderId = this._getCurrentOrderBackendId();

        if (!orderId) {
            this.notification.add(
                this.env._t
                    ? this.env._t("This order has not been synced to the server yet. Please try again.")
                    : "This order has not been synced to the server yet. Please try again.",
                {
                    type: "warning",
                    title: this.env._t ? this.env._t("No Order Found") : "No Order Found",
                }
            );
            return;
        }

        this.invoicePrintState.isLoadingInvoice = true;

        try {
            // ----------------------------------------------------------------
            // RPC call → Python: pos.order.get_invoice_id_from_pos_order(id)
            // ----------------------------------------------------------------
            const invoiceId = await this.orm.call(
                "pos.order",
                "get_invoice_id_from_pos_order",
                [orderId],
                {}
            );

            if (!invoiceId) {
                // No invoice linked to this POS order.
                this.notification.add(
                    this.env._t
                        ? this.env._t(
                              "No invoice was found for this order. Make sure the 'Invoice' option was enabled before payment."
                          )
                        : "No invoice was found for this order. Make sure the 'Invoice' option was enabled before payment.",
                    {
                        type: "warning",
                        title: this.env._t ? this.env._t("Invoice Not Found") : "Invoice Not Found",
                    }
                );
                return;
            }

            // ----------------------------------------------------------------
            // Build the PDF report URL and open in a new tab.
            // Format: /report/pdf/<report_action_xml_id>/<record_id>
            // ----------------------------------------------------------------
            const reportUrl = `/report/pdf/account.report_invoice_document/${invoiceId}`;
            window.open(reportUrl, "_blank");

        } catch (error) {
            // Surface RPC / server errors gracefully.
            console.error("[pos_invoice_print_button] Error fetching invoice:", error);
            this.notification.add(
                this.env._t
                    ? this.env._t("An error occurred while retrieving the invoice. Please try again.")
                    : "An error occurred while retrieving the invoice. Please try again.",
                {
                    type: "danger",
                    title: this.env._t ? this.env._t("Error") : "Error",
                }
            );
        } finally {
            // Always reset the loading state.
            this.invoicePrintState.isLoadingInvoice = false;
        }
    },
});
