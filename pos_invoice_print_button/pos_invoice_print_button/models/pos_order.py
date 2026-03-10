# -*- coding: utf-8 -*-
from odoo import models, api
import logging

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    """
    Extends pos.order to expose an RPC method that returns the
    related account.move (invoice) ID for a given POS order.

    This is called from the POS frontend (OWL) via orm.call().
    """
    _inherit = 'pos.order'

    @api.model
    def get_invoice_id_from_pos_order(self, order_id):
        """
        Returns the ID of the invoice (account.move) linked to a POS order.

        The POS order can be linked to an invoice in two ways:
          1. Via the `account_move` Many2one field (direct link, set when
             the order is invoiced from the POS with the Invoice option ON).
          2. Via `invoice_origin`, which stores the POS order name/reference
             (fallback search when the direct link is missing).

        :param order_id: (int) The backend ID of the pos.order record.
        :return: (int|False) The ID of the linked account.move, or False.
        """
        if not order_id:
            _logger.warning("get_invoice_id_from_pos_order called with no order_id")
            return False

        order = self.browse(order_id)

        if not order.exists():
            _logger.warning(
                "get_invoice_id_from_pos_order: order_id %s does not exist", order_id
            )
            return False

        # ------------------------------------------------------------------
        # 1. Primary path: direct Many2one on pos.order → account.move
        #    Field name is `account_move` in Odoo 16+ / 19.
        # ------------------------------------------------------------------
        if order.account_move and order.account_move.exists():
            _logger.info(
                "Invoice found via account_move field: move_id=%s for order_id=%s",
                order.account_move.id,
                order_id,
            )
            return order.account_move.id

        # ------------------------------------------------------------------
        # 2. Fallback: search by invoice_origin matching the POS order name
        #    Some flows (e.g. batch invoicing) set invoice_origin instead of
        #    the direct Many2one.
        # ------------------------------------------------------------------
        if order.name:
            invoice = self.env['account.move'].search(
                [
                    ('move_type', 'in', ['out_invoice', 'out_refund']),
                    ('invoice_origin', '=', order.name),
                    ('state', '!=', 'cancel'),
                ],
                limit=1,
                order='id desc',
            )
            if invoice:
                _logger.info(
                    "Invoice found via invoice_origin: move_id=%s for order=%s",
                    invoice.id,
                    order.name,
                )
                return invoice.id

        # ------------------------------------------------------------------
        # 3. Last resort: search by pos_reference stored in the move
        #    (used by some community/custom flows that populate pos_reference).
        # ------------------------------------------------------------------
        invoice = self.env['account.move'].search(
            [
                ('move_type', 'in', ['out_invoice', 'out_refund']),
                ('ref', '=', order.name),
                ('state', '!=', 'cancel'),
            ],
            limit=1,
            order='id desc',
        )
        if invoice:
            _logger.info(
                "Invoice found via ref field: move_id=%s for order=%s",
                invoice.id,
                order.name,
            )
            return invoice.id

        _logger.info(
            "No invoice found for pos.order id=%s name=%s", order_id, order.name
        )
        return False
