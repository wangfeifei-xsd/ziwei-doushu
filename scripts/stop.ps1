$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'service.mjs') stop @args
exit $LASTEXITCODE
