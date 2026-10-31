$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'service.mjs') start @args
exit $LASTEXITCODE
