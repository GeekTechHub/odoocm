FROM odoo:19.0
USER root

# Instalamos librerías necesarias
RUN pip3 install --target=/opt/qiflibs qifparse --break-system-packages
ENV PYTHONPATH="/opt/qiflibs:$PYTHONPATH"

# COPIAMOS tus módulos del repo a la carpeta de Odoo
COPY ./base_accounting_kit /usr/lib/python3/dist-packages/odoo/addons/base_accounting_kit
COPY ./base_account_budget /usr/lib/python3/dist-packages/odoo/addons/base_account_budget

# Aseguramos permisos
RUN chown -R odoo:odoo /usr/lib/python3/dist-packages/odoo/addons/base_accounting_kit
RUN chown -R odoo:odoo /usr/lib/python3/dist-packages/odoo/addons/base_account_budget

USER odoo
