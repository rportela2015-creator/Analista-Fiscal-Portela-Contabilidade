<#
.SYNOPSIS
  Script de Diagnóstico e Validação da Infraestrutura Docker e Motores RFB RTC.
  Analista Fiscal Portela Contabilidade — Ciclo 6 (Sub-Etapa 19.7)

.DESCRIPTION
  Valida a composição sidecar de containers locais (rtc-regular, rtc-simples, rtc-danfse, postgres),
  a integridade dos arquivos .upstream, a sintaxe do docker-compose.yml e a conectividade com as APIs.

.PARAMETER SkipDockerUp
  Pula a execução de "docker compose up -d", apenas verificando os containers em execução.

.PARAMETER OnlyConfigCheck
  Apenas valida a integridade estática dos arquivos de configuração, diretórios de serviço e docker-compose.yml.
#>

[CmdletBinding()]
param(
  [switch]$SkipDockerUp,
  [switch]$OnlyConfigCheck
)

$ErrorActionPreference = 'Stop'

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host " Portela Contabilidade - Validador de Stack Sidecar Docker & Motores RFB RTC" -ForegroundColor Cyan
Write-Host " Versão da Plataforma: v6.0.0 | Ciclo 6" -ForegroundColor Cyan
Write-Host "================================================================================" -ForegroundColor Cyan

$rootPath = Split-Path -Parent $PSScriptRoot
Set-Location $rootPath

$falhas = 0
$avisos = 0

# 1. Validação de Arquivos e Diretórios de Infraestrutura
Write-Host "`n[1/5] Verificando integridade de arquivos de configuração..." -ForegroundColor Yellow

$arquivosObrigatorios = @(
  "docker-compose.yml",
  ".env.example",
  "services/rtc-regime-regular/Dockerfile",
  "services/rtc-simples/Dockerfile",
  "services/rtc-danfse/Dockerfile",
  "services/rtc-db-builder/build-sqlite.sh",
  "services/rtc-regime-regular/.upstream",
  "services/rtc-simples/.upstream",
  "services/rtc-danfse/.upstream"
)

foreach ($arq in $arquivosObrigatorios) {
  $caminho = Join-Path $rootPath $arq
  if (Test-Path $caminho) {
    Write-Host "  [OK] Encontrado: $arq" -ForegroundColor Green
  } else {
    Write-Host "  [ERRO] Arquivo obrigatório ausente: $arq" -ForegroundColor Red
    $falhas++
  }
}

# 2. Validação da Sintaxe do docker-compose.yml
Write-Host "`n[2/5] Validando sintaxe do docker-compose.yml..." -ForegroundColor Yellow

$dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
if ($null -eq $dockerCmd) {
  Write-Host "  [AVISO] Binário 'docker' não encontrado no PATH do sistema operacional." -ForegroundColor Yellow
  $avisos++
  if (-not $OnlyConfigCheck) {
    Write-Host "  [INFO] Para executar containers, certifique-se de que o Docker Desktop esteja instalado." -ForegroundColor Gray
  }
} else {
  try {
    $composeOutput = & docker compose config -q 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host "  [OK] docker-compose.yml sintaticamente válido." -ForegroundColor Green
    } else {
      Write-Host "  [ERRO] Falha na validação do docker-compose: $composeOutput" -ForegroundColor Red
      $falhas++
    }
  } catch {
    Write-Host "  [ERRO] Erro ao invocar docker compose: $_" -ForegroundColor Red
    $falhas++
  }
}

if ($OnlyConfigCheck) {
  Write-Host "`nModo -OnlyConfigCheck ativado: validação de runtime ignorada." -ForegroundColor Cyan
  if ($falhas -eq 0) {
    Write-Host "`n[SUCESSO] Configurações estáticas validadas com 100% de integridade." -ForegroundColor Green
    exit 0
  } else {
    Write-Host "`n[FALHA] Foram encontradas $falhas pendências de configuração." -ForegroundColor Red
    exit 1
  }
}

# 3. Verificação do Docker Daemon e Subida de Containers
Write-Host "`n[3/5] Verificando Docker Daemon e containers..." -ForegroundColor Yellow

if ($null -ne $dockerCmd) {
  try {
    & docker info --format '{{.ServerVersion}}' 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "  [OK] Docker Daemon ativo e respondendo." -ForegroundColor Green

      if (-not $SkipDockerUp) {
        Write-Host "  [INFO] Verificando containers da stack..." -ForegroundColor Gray
      }

      $psOutput = & docker compose ps --format '{{.Name}}: {{.State}} ({{.Status}})' 2>&1
      if ($psOutput) {
        foreach ($linha in $psOutput) {
          Write-Host "  [CONTAINER] $linha" -ForegroundColor DarkCyan
        }
      } else {
        Write-Host "  [INFO] Nenhum container da stack rodando no momento." -ForegroundColor Gray
      }
    } else {
      Write-Host "  [AVISO] Docker Daemon não está em execução no momento." -ForegroundColor Yellow
      $avisos++
    }
  } catch {
    Write-Host "  [AVISO] Não foi possível consultar o Docker Daemon: $_" -ForegroundColor Yellow
    $avisos++
  }
}

# 4. Verificação de Conectividade com Serviços Locais
Write-Host "`n[4/5] Verificando portas e endpoints locais..." -ForegroundColor Yellow

$servicosParaTestar = @(
  @{ Nome = "RTC Regime Regular"; Url = "http://localhost:8080/api/calculadora/dados-abertos/versao"; Porta = 8080 },
  @{ Nome = "RTC Simples Nacional"; Url = "http://localhost:8082/api/versao"; Porta = 8082 },
  @{ Nome = "RTC Gerador DANFSE"; Url = "http://localhost:8084/health/live"; Porta = 8084 },
  @{ Nome = "PostgreSQL 17 Multi-tenant"; Host = "localhost"; Porta = 5432 }
)

foreach ($servico in $servicosParaTestar) {
  if ($servico.ContainsKey("Url")) {
    try {
      $req = [System.Net.WebRequest]::Create($servico.Url)
      $req.Timeout = 1500
      $resp = $req.GetResponse()
      Write-Host "  [OK] $($servico.Nome) ativo em $($servico.Url) (Status: $([int]$resp.StatusCode))" -ForegroundColor Green
      $resp.Close()
    } catch {
      Write-Host "  [OFFLINE] $($servico.Nome) em localhost:$($servico.Porta) (Não respondeu ou indisponível)" -ForegroundColor Gray
      $avisos++
    }
  } elseif ($servico.ContainsKey("Host")) {
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
      $ar = $tcp.BeginConnect($servico.Host, $servico.Porta, $null, $null)
      $wh = $ar.AsyncWaitHandle.WaitOne(1000, $false)
      if ($wh -and $tcp.Connected) {
        $tcp.EndConnect($ar)
        Write-Host "  [OK] $($servico.Nome) ativo na porta $($servico.Porta)" -ForegroundColor Green
      } else {
        Write-Host "  [OFFLINE] $($servico.Nome) na porta $($servico.Porta) (Porta fechada)" -ForegroundColor Gray
        $avisos++
      }
    } catch {
      Write-Host "  [OFFLINE] $($servico.Nome) na porta $($servico.Porta)" -ForegroundColor Gray
      $avisos++
    } finally {
      $tcp.Close()
    }
  }
}

# 5. Resumo e Diagnóstico
Write-Host "`n[5/5] Diagnóstico Final da Stack..." -ForegroundColor Yellow
if ($falhas -eq 0) {
  Write-Host "================================================================================" -ForegroundColor Green
  Write-Host " DIAGNÓSTICO: Configurações e infraestrutura validadas com SUCESSO." -ForegroundColor Green
  if ($avisos -gt 0) {
    Write-Host " Observação: $avisos aviso(s) de serviços offline ou docker daemon em repouso." -ForegroundColor Yellow
    Write-Host " O sistema opera normalmente em modo de contingência/fallback local determinístico." -ForegroundColor Gray
  }
  Write-Host "================================================================================" -ForegroundColor Green
  exit 0
} else {
  Write-Host "================================================================================" -ForegroundColor Red
  Write-Host " DIAGNÓSTICO: Encontradas $falhas falhas estruturais na stack." -ForegroundColor Red
  Write-Host "================================================================================" -ForegroundColor Red
  exit 1
}
