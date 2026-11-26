# Script de Validação de Paridade RFB Sob Demanda (Windows + Docker)
# Uso: powershell -ExecutionPolicy Bypass -File scripts/paridade.ps1
$ErrorActionPreference = 'Stop'

Set-Location (Split-Path -Parent $PSScriptRoot)

Write-Host '=== Subindo sidecars oficiais RFB via Docker Compose ==='
docker compose up -d --wait rtc-regime-regular rtc-simples rtc-danfse
if ($LASTEXITCODE -ne 0) {
  throw "Falha ao subir containers RFB (exit $LASTEXITCODE)"
}

try {
  $env:RTC_LIVE_PROBE = 'true'
  if (-not $env:RTC_BASE_URL) { $env:RTC_BASE_URL = 'http://127.0.0.1:8080' }
  if (-not $env:RTC_REGIME_REGULAR_URL) { $env:RTC_REGIME_REGULAR_URL = 'http://127.0.0.1:8080/api' }
  if (-not $env:RTC_SIMPLES_URL) { $env:RTC_SIMPLES_URL = 'http://127.0.0.1:8082/api' }

  Write-Host '=== Executando bateria de paridade RFB vs. Motor Local ==='
  node scripts/run-paridade.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "Validação de paridade RFB falhou (exit $LASTEXITCODE)"
  }
  Write-Host '✓ Paridade RFB concluída sem divergências.'
}
finally {
  Write-Host '=== Derrubando containers RFB ==='
  docker compose down
}
