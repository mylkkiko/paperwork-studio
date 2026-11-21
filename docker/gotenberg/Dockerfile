# Gotenberg with a font-fallback config for Armenian documents. The stock image already ships
# Noto Serif/Sans Armenian and DejaVu; only the fallback order needs fixing (see fonts.conf).
FROM gotenberg/gotenberg:8.40.0
USER root
COPY fonts.conf /etc/fonts/local.conf
RUN fc-cache -f
USER gotenberg
