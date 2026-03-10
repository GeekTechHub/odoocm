# -*- coding: utf-8 -*-
{
    'name': 'POS Invoice Print Button',
    'version': '19.0.1.0.0',
    'summary': 'Adds a Print Invoice button on the POS Receipt Screen',
    'description': """
        POS Invoice Print Button
        ========================
        This module adds a "Print Invoice" button on the POS Receipt Screen.
        When the POS generates an invoice for an order, this button allows
        the cashier to immediately print the accounting invoice (account.move)
        as a PDF using the standard Odoo report: account.report_invoice_document.

        Features:
        - Print Invoice button on the Receipt Screen
        - Loading spinner while fetching the invoice
        - Warning notification if no invoice is linked
        - Opens PDF in a new browser tab
        - Compatible with Odoo 19 Community OWL architecture
    """,
    'category': 'Point of Sale',
    'author': 'Custom Development',
    'website': '',
    'license': 'LGPL-3',
    'depends': [
        'point_of_sale',
        'account',
    ],
    'data': [],
    'assets': {
        'point_of_sale.assets': [
            'pos_invoice_print_button/static/src/js/pos_invoice_button.js',
            'pos_invoice_print_button/static/src/xml/pos_invoice_button.xml',
        ],
    },
    'installable': True,
    'auto_install': False,
    'application': False,
}
