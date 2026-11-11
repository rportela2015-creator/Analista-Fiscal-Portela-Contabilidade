@echo off
REM ==============================================================================
REM MCM Launcher - Inicializador de Duplo Clique para o Aplicativo MCM
REM ==============================================================================
REM Executa o orquestrador em PowerShell com politicas de execucao liberadas.
REM
REM Para gerar um executavel standalone (.exe), execute no PowerShell:
REM   Install-Module -Name ps2exe -Scope CurrentUser
REM   Invoke-ps2exe .\scripts\mcm-launcher.ps1 .\Aplicativo_MCM.exe
REM ==============================================================================

chcp 65001 >nul
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\mcm-launcher.ps1" %*
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [MCM] O orquestrador encerrou com codigo de erro %ERRORLEVEL%.
    pause
)
