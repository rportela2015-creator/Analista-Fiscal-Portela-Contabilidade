# ==============================================================================
# Script de Sincronização dos Códigos-Fonte Oficiais da Receita Federal (RTC)
# Governança: services/rfb-manifest.json
# ==============================================================================

[CmdletBinding()]
param(
    [switch]$ForceGitClone
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Resolve-Path "$ScriptDir\.."
$ManifestPath = "$ProjectRoot\services\rfb-manifest.json"

if (-not (Test-Path $ManifestPath)) {
    Write-Error "[-] Manifesto não encontrado em: $ManifestPath"
    exit 1
}

$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
$InspecaoLocalDir = "F:\Workspace\Apps\_inspecao_rfb_rtc"

Write-Host "======================================================================" -ForegroundColor Cyan
Write-Host " Sincronizador de Fontes Oficiais RFB (RTC / DFe)" -ForegroundColor Cyan
Write-Host " Raiz do Projeto: $ProjectRoot" -ForegroundColor DarkGray
Write-Host "======================================================================" -ForegroundColor Cyan

# Mapeamento dos serviços para pastas de destino
$Targets = @{
    "calculadora-rtc-regime-regular"  = "$ProjectRoot\services\rtc-regime-regular\.upstream"
    "calculadora-rtc-simples-nacional" = "$ProjectRoot\services\rtc-simples\.upstream"
    "calculadora-rtc-gerador-danfse"   = "$ProjectRoot\services\rtc-danfse\.upstream"
}

foreach ($repoKey in $Manifest.repositorios.PSObject.Properties.Name) {
    $repoInfo = $Manifest.repositorios.$repoKey
    $targetDir = $Targets[$repoKey]
    $commitTarget = $repoInfo.commitPinado
    $repoUrl = $repoInfo.url

    Write-Host "`n[+] Processando repositório: $repoKey" -ForegroundColor Yellow
    Write-Host "    Commit Alvo: $commitTarget" -ForegroundColor DarkGray
    Write-Host "    Destino: $targetDir" -ForegroundColor DarkGray

    $localSrc = "$InspecaoLocalDir\$repoKey"

    # Se existe cópia local na pasta de inspeção e não foi forçado git clone
    if ((Test-Path $localSrc) -and (-not $ForceGitClone)) {
        Write-Host "    [Cache Local Detectado] Copiando de $localSrc..." -ForegroundColor Green
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        # Copia arquivos excluindo .git para não duplicar banco de objetos
        Copy-Item -Path "$localSrc\*" -Destination $targetDir -Recurse -Force -Exclude ".git"
    }
    else {
        # Clone do repositório oficial
        if (-not (Test-Path $targetDir)) {
            Write-Host "    Clonando $repoUrl..." -ForegroundColor Green
            git clone $repoUrl $targetDir
        }
        Write-Host "    Fixando commit $commitTarget..." -ForegroundColor Green
        git -C $targetDir checkout $commitTarget
    }

    Write-Host "    [OK] Sincronização de $repoKey concluída." -ForegroundColor Green
}

# Sincroniza scripts SQL de migração para o rtc-db-builder
$DbBuilderSqlDir = "$ProjectRoot\services\rtc-db-builder\sql"
$RegimeRegularUpstream = "$ProjectRoot\services\rtc-regime-regular\.upstream"
$FlywaySqlSrc = "$RegimeRegularUpstream\flyway\sql"

if (Test-Path $FlywaySqlSrc) {
    Write-Host "`n[+] Sincronizando scripts SQL Flyway para services/rtc-db-builder/sql..." -ForegroundColor Yellow
    if (-not (Test-Path $DbBuilderSqlDir)) {
        New-Item -ItemType Directory -Path $DbBuilderSqlDir -Force | Out-Null
    }
    Copy-Item -Path "$FlywaySqlSrc\*" -Destination $DbBuilderSqlDir -Recurse -Force
    Write-Host "    [OK] Scripts SQL Flyway sincronizados com sucesso." -ForegroundColor Green
}

Write-Host "`n======================================================================" -ForegroundColor Cyan
Write-Host " [SUCESSO] Todos os componentes RFB foram sincronizados com sucesso!" -ForegroundColor Cyan
Write-Host "======================================================================`n" -ForegroundColor Cyan
