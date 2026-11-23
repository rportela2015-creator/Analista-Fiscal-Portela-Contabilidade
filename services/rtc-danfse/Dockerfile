# syntax=docker/dockerfile:1
# ------------------------------------------------------------------------------
# Receita Federal do Brasil - Gerador de DANFSe (NFSe RTC)
# Baseado diretamente no Dockerfile oficial do repositório:
# ReceitaFederal/calculadora-rtc-gerador-danfse (Tag 1.0.0 / Commit 8d79e6b)
# ------------------------------------------------------------------------------

# --- Stage 1: Build do Binário Go ---
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Copia dependências e fontes upstream sincronizados
COPY .upstream/go.mod .upstream/go.sum ./
RUN go mod download

COPY .upstream/ .

# Instala gerador de swagger e compila o binário otimizado
RUN go install github.com/swaggo/swag/cmd/swag@v1.16.6 && \
    /go/bin/swag init -g cmd/danfse/main.go -o ./api/swagger && \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o danfse-service ./cmd/danfse

# --- Stage 2: Imagem Minimal de Runtime ---
FROM alpine:3.20

RUN apk update && apk add --no-cache \
    ca-certificates \
    tzdata

ENV TZ=America/Sao_Paulo \
    SERVER_PORT=8084 \
    LOG_LEVEL=info

WORKDIR /app

COPY --from=builder /app/danfse-service .

EXPOSE 8084

# Probe de saúde do ciclo de vida (/health/live) confirmado em internal/controller/health.go
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8084/health/live || exit 1

ENTRYPOINT ["./danfse-service"]
