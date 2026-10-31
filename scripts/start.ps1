$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'service.ps1') start @args
exit $LASTEXITCODE
