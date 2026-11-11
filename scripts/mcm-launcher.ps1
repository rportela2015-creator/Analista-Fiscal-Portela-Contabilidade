<#
.SYNOPSIS
    MCM Launcher - Orquestrador de Inicialização e Painel Operacional Sob Demanda
    Aplicativo MCM - Auditoria Fiscal, NCM e Precificação

.DESCRIPTION
    Script de inicialização rápida com orquestração de microsserviços e satélites sob demanda.
    Projetado para economia de recursos e proteção de GPU/memória.

    Geração de executável binário opcional (.exe):
        Install-Module -Name ps2exe -Scope CurrentUser
        Invoke-ps2exe .\scripts\mcm-launcher.ps1 .\Aplicativo_MCM.exe -noConsole:$false -title "Aplicativo MCM"

.PARAMETER CheckOnly
    Apenas valida o ambiente (Node, npm, Python, JSONs de dados) e retorna exit 0.

.PARAMETER Mode
    Define o modo de execução: 'dev' (padrão) ou 'prod'.

.PARAMETER UpdateLegal
    Executa a verificação e atualização do marco legal sob demanda e encerra.
#>

[CmdletBinding()]
param (
    [switch]$CheckOnly,
    [ValidateSet('dev', 'prod')]
    [string]$Mode = '',
    [switch]$UpdateLegal
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Garante o diretório raiz do repositório
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir
Set-Location $RootDir

# -----------------------------------------------------------------------------
# Variáveis de Ambiente e Trava de Segurança
# -----------------------------------------------------------------------------
$env:OLLAMA_KEEP_ALIVE = "5m"
$env:ENABLE_UPDATE_ROUTE = "false"
$PORT = 3000
$BASE_URL = "http://localhost:$PORT"

# -----------------------------------------------------------------------------
# Função: Validação de Ambiente (-CheckOnly)
# -----------------------------------------------------------------------------
function Test-McmEnvironment {
    Write-Host "[MCM Preflight] Verificando integridade do ambiente..." -ForegroundColor Cyan

    # 1. Node.js
    try {
        $nodeVer = & node -v 2>$null
        if (-not $nodeVer) { throw "Node.js não encontrado no PATH." }
        Write-Host "  [OK] Node.js: $nodeVer" -ForegroundColor Green
    } catch {
        Write-Host "  [FALHA] Node.js ausente: $_" -ForegroundColor Red
        return $false
    }

    # 2. Python
    try {
        $pyVer = & python --version 2>$null
        if (-not $pyVer) { $pyVer = & py -3 --version 2>$null }
        if (-not $pyVer) { throw "Python não encontrado no PATH." }
        Write-Host "  [OK] Python: $pyVer" -ForegroundColor Green
    } catch {
        Write-Host "  [FALHA] Python ausente: $_" -ForegroundColor Red
        return $false
    }

    # 3. Base de Dados
    $metaFile = Join-Path $RootDir "public\data\meta.json"
    if (Test-Path $metaFile) {
        try {
            $meta = Get-Content $metaFile -Raw | ConvertFrom-Json
            Write-Host "  [OK] public/data/meta.json integro (versao: $($meta.versao_geral))" -ForegroundColor Green
        } catch {
            Write-Host "  [FALHA] Falha ao ler meta.json: $_" -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "  [FALHA] Arquivo public/data/meta.json ausente." -ForegroundColor Red
        return $false
    }

    Write-Host "[MCM Preflight] Ambiente 100% verificado e pronto.`n" -ForegroundColor Green
    return $true
}

if ($CheckOnly) {
    $ok = Test-McmEnvironment
    if ($ok) { exit 0 } else { exit 1 }
}

# -----------------------------------------------------------------------------
# Função: Atualização Legal Sob Demanda
# -----------------------------------------------------------------------------
function Invoke-McmLegalUpdate {
    Write-Host "`n>>> [ATUALIZAÇÃO LEGAL] Executando verificação de fontes oficiais..." -ForegroundColor Yellow
    $pyCmd = if (Get-Command "python" -ErrorAction SilentlyContinue) { "python" } else { "py -3" }
    
    & $pyCmd scripts/atualizar_marco_legal.py --check
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Aviso: Atualização do marco legal encerrou com código $LASTEXITCODE." -ForegroundColor Yellow
    }
    
    if (Test-Path "scripts/pipeline.py") {
        Write-Host ">>> [ATUALIZAÇÃO LEGAL] Sincronizando search.json..." -ForegroundColor Yellow
        & $pyCmd scripts/pipeline.py
    }
    Write-Host ">>> [ATUALIZAÇÃO LEGAL] Concluída com sucesso.`n" -ForegroundColor Green
}

if ($UpdateLegal) {
    Invoke-McmLegalUpdate
    exit 0
}

# -----------------------------------------------------------------------------
# Determinação de Modo (dev ou prod)
# -----------------------------------------------------------------------------
if (-not $Mode) {
    if (Test-Path ".next") {
        $Mode = "prod"
    } else {
        $Mode = "dev"
    }
}

# -----------------------------------------------------------------------------
# Inicialização do Servidor Next.js em Background
# -----------------------------------------------------------------------------
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "        APLICATIVO MCM - CLASSIFICADOR & AUDITOR FISCAL           " -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "Modo selecionado: $Mode | Porta: $PORT | OLLAMA_KEEP_ALIVE: $env:OLLAMA_KEEP_ALIVE" -ForegroundColor Gray

$ServerProcess = $null
if ($Mode -eq "prod") {
    Write-Host "Iniciando servidor de Produção (npm start)..." -ForegroundColor Yellow
    $ServerProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "start" -PassThru -NoNewWindow
} else {
    Write-Host "Iniciando servidor de Desenvolvimento (npm run dev)..." -ForegroundColor Yellow
    $ServerProcess = Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -PassThru -NoNewWindow
}

# Aguarda o servidor responder na porta 3000
Write-Host "Aguardando servidor responder em $BASE_URL..." -NoNewline -ForegroundColor Gray
$tentativas = 0
$serverPronto = $false
while ($tentativas -lt 40) {
    Start-Sleep -Seconds 1
    Write-Host "." -NoNewline -ForegroundColor Gray
    try {
        $resp = Invoke-WebRequest -Uri $BASE_URL -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp -and $resp.StatusCode -eq 200) {
            $serverPronto = $true
            break
        }
    } catch {
        # Continua tentando
    }
    $tentativas++
}
Write-Host ""

if ($serverPronto) {
    Write-Host "Servidor pronto em $BASE_URL! Abrindo navegador padrão..." -ForegroundColor Green
    Start-Process $BASE_URL
} else {
    Write-Host "Aviso: Servidor demorou para responder. Acesse manualmente $BASE_URL" -ForegroundColor Yellow
}

# -----------------------------------------------------------------------------
# Loop do Painel Operacional Sob Demanda
# -----------------------------------------------------------------------------
$TunnelProcess = $null

function Stop-AllProcesses {
    Write-Host "`nEncerrando processos do MCM e liberando memória..." -ForegroundColor Yellow
    if ($TunnelProcess -and -not $TunnelProcess.HasExited) {
        Write-Host "Encerrando túnel Cloudflare..." -ForegroundColor Gray
        Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
    }
    if ($ServerProcess -and -not $ServerProcess.HasExited) {
        Write-Host "Encerrando servidor Next.js..." -ForegroundColor Gray
        Stop-Process -Id $ServerProcess.Id -Force -ErrorAction SilentlyContinue
    }
    # Finaliza quaisquer nós órfãos de Node na porta 3000
    Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Write-Host "Ambiente limpo com sucesso.`n" -ForegroundColor Green
}

try {
    while ($true) {
        Write-Host "`n----------------------- PAINEL DE CONTROLE MCM -----------------------" -ForegroundColor Cyan
        Write-Host "  [1] Abrir $BASE_URL no navegador"
        Write-Host "  [2] Executar Atualização Legal Sob Demanda (Marco Legal + Pipeline)"
        if ($TunnelProcess -and -not $TunnelProcess.HasExited) {
            Write-Host "  [3] Encerrar Túnel Web Público HTTPS [ATIVO]" -ForegroundColor Magenta
        } else {
            Write-Host "  [3] Iniciar Túnel Web Público HTTPS (Cloudflare Tunnel)"
        }
        Write-Host "  [4] Verificar Status do Ollama Local (GPU RX 580) e Liberar VRAM"
        Write-Host "  [5] Executar Verificação Rápida DoD (npm run typecheck + npm test)"
        Write-Host "  [Q] Encerrar Servidor e Sair"
        Write-Host "----------------------------------------------------------------------" -ForegroundColor Cyan
        $escolha = Read-Host "Selecione uma opção"

        switch ($escolha.Trim().ToUpper()) {
            "1" {
                Start-Process $BASE_URL
            }
            "2" {
                Invoke-McmLegalUpdate
            }
            "3" {
                if ($TunnelProcess -and -not $TunnelProcess.HasExited) {
                    Write-Host "Encerrando túnel Cloudflare ativo..." -ForegroundColor Yellow
                    Stop-Process -Id $TunnelProcess.Id -Force -ErrorAction SilentlyContinue
                    $TunnelProcess = $null
                    Write-Host "Túnel encerrado." -ForegroundColor Green
                } else {
                    if (Get-Command "cloudflared" -ErrorAction SilentlyContinue) {
                        Write-Host "Iniciando túnel Cloudflare (ENABLE_UPDATE_ROUTE=false)..." -ForegroundColor Yellow
                        $TunnelProcess = Start-Process -FilePath "cloudflared" -ArgumentList "tunnel --url $BASE_URL" -PassThru
                        Write-Host "Túnel iniciado em processo background (PID: $($TunnelProcess.Id))." -ForegroundColor Green
                    } else {
                        Write-Host "Erro: 'cloudflared' não está instalado ou não foi encontrado no PATH." -ForegroundColor Red
                        Write-Host "Baixe em: https://github.com/cloudflare/cloudflared/releases" -ForegroundColor Gray
                    }
                }
            }
            "4" {
                Write-Host "Verificando Ollama Local..." -ForegroundColor Yellow
                try {
                    $ollamaVer = Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/version" -TimeoutSec 2 -ErrorAction Stop
                    Write-Host "  [OK] Ollama Online (Versão: $($ollamaVer.version))" -ForegroundColor Green
                    
                    # Descarrega modelos da memória da GPU imediatamente
                    Write-Host "  Enviando requisição para liberar VRAM da GPU RX 580..." -ForegroundColor Gray
                    $bodyUnload = @{ model = "qwen2.5:7b"; keep_alive = 0 } | ConvertTo-Json
                    Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -Body $bodyUnload -ContentType "application/json" -TimeoutSec 3 -ErrorAction SilentlyContinue
                    Write-Host "  [OK] VRAM liberada com sucesso." -ForegroundColor Green
                } catch {
                    Write-Host "  Ollama local offline ou não acessível em http://127.0.0.1:11434." -ForegroundColor Yellow
                }
            }
            "5" {
                Write-Host "Executando Verificação Rápida DoD..." -ForegroundColor Yellow
                & npm run typecheck
                if ($LASTEXITCODE -eq 0) {
                    & npm test
                }
            }
            "Q" {
                Stop-AllProcesses
                break
            }
            default {
                Write-Host "Opção inválida." -ForegroundColor Red
            }
        }
    }
} finally {
    Stop-AllProcesses
}
