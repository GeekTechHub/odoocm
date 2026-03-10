FROM odoo:19.0
USER root
RUN pip3 install --target=/opt/qiflibs qifparse --break-system-packages
ENV PYTHONPATH="/opt/qiflibs:$PYTHONPATH"
USER odoo
