# syntax=docker/dockerfile:1
# ------------------------------------------------------------------------------
# Receita Federal do Brasil - Calculadora RTC (Regime Regular)
# Build multi-stage governado por services/rfb-manifest.json
# Commit oficial: f1eebd7ce3157423b1a6aaca7dc1d6c3395452c4
# ------------------------------------------------------------------------------

# --- Stage 1: Build do Artefato Executável JAR ---
FROM eclipse-temurin:25-jdk-alpine AS builder

WORKDIR /build

# Copia fontes upstream sincronizados
COPY .upstream/ .

# Concede permissão de execução ao Maven Wrapper e compila o projeto
RUN chmod +x ./mvnw && ./mvnw clean package -DskipTests

# --- Stage 2: Runtime Minimal e Seguro (Non-root, SQLite read-only) ---
FROM eclipse-temurin:25-jre-alpine AS runner

WORKDIR /app

# Usuário não-root seguro
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Cria pasta para montagem do volume SQLite da base oficial
RUN mkdir -p /app/calculadora/db && chown -R appuser:appgroup /app

# Copia artefato JAR gerado no stage anterior
COPY --from=builder --chown=appuser:appgroup /build/target/*.jar /app/app.jar

USER appuser

# Configuração de Ambiente Oficial:
# - Perfil offline ativado (execução local / isolada)
# - Limite de memória JVM controlado (-Xmx768m)
# - Datasource SQLite em modo somente leitura (mode=ro)
ENV SPRING_PROFILES_ACTIVE=offline \
    JAVA_TOOL_OPTIONS="-Xms256m -Xmx768m -XX:+UseG1GC" \
    SPRING_DATASOURCE_URL="jdbc:sqlite:file:/app/calculadora/db/rtc-oficial.db?mode=ro&date_class=TEXT&date_string_format=yyyy-MM-dd" \
    APPLICATION_DB_FILENAME="rtc-oficial.db"

EXPOSE 8080 9101

# Probe de saúde utilizando o endpoint canônico de versão de dados abertos
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:8080/api/calculadora/dados-abertos/versao || exit 1

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
