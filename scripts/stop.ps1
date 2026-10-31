$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'service.ps1') stop @args
exit $LASTEXITCODE
