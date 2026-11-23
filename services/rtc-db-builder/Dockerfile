# syntax=docker/dockerfile:1
# ------------------------------------------------------------------------------
# Receita Federal do Brasil - Gerador da Base SQLite Oficial RTC
# Aplica migrações Flyway (Baseline B0001 + V0002..V0073+) em rtc-oficial.db
# Governança: services/rfb-manifest.json
# ------------------------------------------------------------------------------
FROM alpine:3.20

RUN apk add --no-cache \
    sqlite \
    bash \
    coreutils \
    jq \
    tzdata

ENV TZ=America/Sao_Paulo

WORKDIR /app

# Copia script de build
COPY build-sqlite.sh /app/build-sqlite.sh
RUN chmod +x /app/build-sqlite.sh

# Copia scripts SQL sincronizados (se existirem na raiz de build)
# Podem vir de sql/ ou .upstream/flyway/sql/
COPY sql/ /app/sql/

VOLUME ["/output"]

ENTRYPOINT ["/app/build-sqlite.sh"]
