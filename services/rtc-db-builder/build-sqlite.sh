#!/usr/bin/env bash
# ==============================================================================
# Script de Construção da Base SQLite Oficial RTC - Receita Federal do Brasil
# Governança: services/rfb-manifest.json
# ==============================================================================

set -euo pipefail

OUTPUT_DIR="/output"
TARGET_DB="${OUTPUT_DIR}/rtc-oficial.db"
TARGET_DB_ALIAS="${OUTPUT_DIR}/calculadora-pro.db"
SHA_FILE="${OUTPUT_DIR}/rtc-oficial.db.sha256"
META_FILE="${OUTPUT_DIR}/meta-rtc.json"
SQL_BASE_DIR="/app/sql"

COMMIT_REGIME_REGULAR="${COMMIT_REGIME_REGULAR:-f1eebd7ce3157423b1a6aaca7dc1d6c3395452c4}"

echo "======================================================================"
echo " [RTC DB BUILDER] Iniciando geração da base de dados SQLite oficial"
echo " Commit Regime Regular: ${COMMIT_REGIME_REGULAR}"
echo " Destino: ${TARGET_DB}"
echo "======================================================================"

mkdir -p "${OUTPUT_DIR}"

# Remove artefatos temporários ou incompletos anteriores
rm -f "${TARGET_DB}" "${TARGET_DB_ALIAS}" "${SHA_FILE}" "${META_FILE}"

# Localiza scripts de migração (suporta /app/sql ou /app/flyway/sql ou .upstream)
if [ -d "${SQL_BASE_DIR}/criacao" ]; then
    CRIACAO_DIR="${SQL_BASE_DIR}/criacao"
    MANUTENCAO_DIR="${SQL_BASE_DIR}/manutencao"
elif [ -d "/app/flyway/sql/criacao" ]; then
    CRIACAO_DIR="/app/flyway/sql/criacao"
    MANUTENCAO_DIR="/app/flyway/sql/manutencao"
elif [ -d "/app/.upstream/flyway/sql/criacao" ]; then
    CRIACAO_DIR="/app/.upstream/flyway/sql/criacao"
    MANUTENCAO_DIR="/app/.upstream/flyway/sql/manutencao"
else
    echo "[-] ERRO: Diretório de migrações Flyway não encontrado!"
    echo "    Procurado em: ${SQL_BASE_DIR}, /app/flyway/sql, /app/.upstream/flyway/sql"
    exit 1
fi

echo "[+] Diretório de criação: ${CRIACAO_DIR}"
echo "[+] Diretório de manutenção: ${MANUTENCAO_DIR}"

# 1. Executa beforeMigrate se existir
if [ -f "${CRIACAO_DIR}/beforeMigrate.sql" ]; then
    echo "[+] Executando callback beforeMigrate.sql..."
    sqlite3 "${TARGET_DB}" < "${CRIACAO_DIR}/beforeMigrate.sql"
fi

# 2. Executa Baseline B0001
BASELINE_SQL="${CRIACAO_DIR}/B0001__sistema_tributario_completo.sql"
if [ -f "${BASELINE_SQL}" ]; then
    echo "[+] Aplicando Baseline B0001__sistema_tributario_completo.sql..."
    sqlite3 "${TARGET_DB}" < "${BASELINE_SQL}"
else
    echo "[-] ERRO: Baseline B0001 não encontrado em ${CRIACAO_DIR}!"
    exit 1
fi

# 3. Executa Migrações Versionadas em ordem alfanumérica estrita (V0002 -> V0073+)
echo "[+] Aplicando migrações versionadas de manutenção..."
MIGRATION_COUNT=0
for sql_file in $(ls "${MANUTENCAO_DIR}"/V*.sql | sort -V); do
    if [ -f "${sql_file}" ]; then
        echo "    -> $(basename "${sql_file}")"
        sqlite3 "${TARGET_DB}" < "${sql_file}"
        MIGRATION_COUNT=$((MIGRATION_COUNT + 1))
    fi
done
echo "[+] Total de migrações V*.sql aplicadas: ${MIGRATION_COUNT}"

# 4. Executa afterMigrate se existir
if [ -f "${CRIACAO_DIR}/afterMigrate.sql" ]; then
    echo "[+] Executando callback afterMigrate.sql..."
    sqlite3 "${TARGET_DB}" < "${CRIACAO_DIR}/afterMigrate.sql"
fi

# 5. Otimização e Encolhimento Final (VACUUM + PRAGMA optimize)
echo "[+] Executando VACUUM e otimização de índices..."
sqlite3 "${TARGET_DB}" "VACUUM; PRAGMA optimize;"

# 6. Cria cópia / alias calculadora-pro.db para retrocompatibilidade com ADR001/ADR004
echo "[+] Gerando cópia/alias para calculadora-pro.db..."
cp "${TARGET_DB}" "${TARGET_DB_ALIAS}"

# 7. Calcula SHA-256
echo "[+] Calculando SHA-256 do arquivo gerado..."
sha256sum "${TARGET_DB}" > "${SHA_FILE}"
SHA_HASH=$(awk '{print $1}' "${SHA_FILE}")
echo "[+] Checksum SHA-256: ${SHA_HASH}"

# 8. Grava metadados meta-rtc.json
GERADO_EM=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
cat <<EOF > "${META_FILE}"
{
  "versaoManifesto": "1.0.0",
  "banco": "rtc-oficial.db",
  "alias": "calculadora-pro.db",
  "commitRegimeRegular": "${COMMIT_REGIME_REGULAR}",
  "geradoEm": "${GERADO_EM}",
  "sha256": "${SHA_HASH}",
  "totalMigracoesAplicadas": ${MIGRATION_COUNT},
  "modoAcessoRecomendado": "mode=ro"
}
EOF

# 9. Assegura permissões de leitura (chmod 644) para montagem :ro por usuários não-root
chmod 644 "${TARGET_DB}" "${TARGET_DB_ALIAS}" "${SHA_FILE}" "${META_FILE}"

echo "======================================================================"
echo " [RTC DB BUILDER] Base SQLite gerada com sucesso em ${TARGET_DB}!"
echo " Metadados salvos em ${META_FILE}"
echo "======================================================================"
exit 0
