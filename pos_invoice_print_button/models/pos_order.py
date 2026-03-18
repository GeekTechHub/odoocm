# -*- coding: utf-8 -*-
from odoo import models, api
import logging

_logger = logging.getLogger(__name__)


class PosOrder(models.Model):
    """
    Extiende pos.order para exponer el método RPC que el frontend OWL
    invoca de forma automática al cargar la pantalla de recibo.
    """
    _inherit = 'pos.order'

    @api.model
    def get_invoice_id_from_pos_order(self, order_id):
        """
        Retorna el ID de la factura (account.move) vinculada a la orden POS.

        Estrategia de búsqueda (triple fallback):
          1. Campo account_move  → Many2one directo (Odoo 16+/19 estándar)
          2. invoice_origin      → nombre de la orden en el campo de origen
          3. ref                 → referencia de la orden en la factura

        :param order_id: int — ID backend de la pos.order
        :return: int | False
        """
        if not order_id:
            return False

        order = self.browse(order_id)
        if not order.exists():
            _logger.warning(
                "[pos_auto_invoice_print] order_id=%s no existe", order_id
            )
            return False

        # ── 1. Enlace directo account_move ──────────────────────────────────
        if order.account_move and order.account_move.exists():
            _logger.info(
                "[pos_auto_invoice_print] Factura encontrada via account_move: "
                "move_id=%s | order_id=%s",
                order.account_move.id, order_id,
            )
            return order.account_move.id

        # ── 2. Búsqueda por invoice_origin ──────────────────────────────────
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
                    "[pos_auto_invoice_print] Factura encontrada via invoice_origin: "
                    "move_id=%s | order=%s",
                    invoice.id, order.name,
                )
                return invoice.id

        # ── 3. Búsqueda por ref ─────────────────────────────────────────────
        if order.name:
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
                    "[pos_auto_invoice_print] Factura encontrada via ref: "
                    "move_id=%s | order=%s",
                    invoice.id, order.name,
                )
                return invoice.id

        _logger.info(
            "[pos_auto_invoice_print] Sin factura para pos.order id=%s name=%s",
            order_id, order.name,
        )
        return False
