# -*- coding: utf-8 -*-
{
    'name': 'POS Auto Invoice Print',
    'version': '19.0.2.0.0',
    'summary': 'Imprime la factura automáticamente al generarse desde el POS',
    'description': """
        POS Auto Invoice Print
        ======================
        Cuando el POS genera una factura al cerrar una orden, este módulo
        la imprime automáticamente — sin ninguna acción del usuario.

        Comportamiento:
        ──────────────
        1. El cajero valida el pago con la opción "Factura" activa.
        2. El POS crea el account.move normalmente.
        3. La pantalla de recibo aparece.
        4. El módulo detecta automáticamente la factura generada.
        5. Abre la factura en HTML en un iframe oculto.
        6. Dispara window.print() → aparece el diálogo de impresora.
        7. Al cerrar el diálogo, el iframe se elimina del DOM.

        Notas:
        ──────
        - Sin botón, sin clics adicionales.
        - Protección anti-reimpresión: cada factura se imprime una sola vez
          por sesión de navegador.
        - Si no hay factura vinculada, no hace nada.
        - Solo Community, sin Enterprise.
    """,
    'category': 'Point of Sale',
    'author': 'Custom Development',
    'license': 'LGPL-3',
    'depends': [
        'point_of_sale',
        'account',
    ],
    'data': [],
    'assets': {
        'point_of_sale.assets': [
            'pos_invoice_print_button/static/src/js/pos_auto_invoice_print.js',
            'pos_invoice_print_button/static/src/xml/pos_auto_invoice_print.xml',
        ],
    },
    'installable': True,
    'auto_install': False,
    'application': False,
}
