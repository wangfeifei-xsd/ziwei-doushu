$ErrorActionPreference = 'Stop'
# ShellExecute starts without inheriting PowerShell's pipeline handles. Even
# redirected ProcessStartInfo pipes can leak the caller's handles on Windows
# PowerShell 5.1, keeping captured output open after this script has exited.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Quote-WindowsArgument([string] $Value) {
    if ($Value -ne '' -and $Value -notmatch '[\s"]') { return $Value }
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}

$node = (Get-Command node.exe -CommandType Application -ErrorAction Stop | Select-Object -First 1).Path
if (-not (Test-Path -LiteralPath $node -PathType Leaf)) { throw 'Cannot locate the Node.js executable.' }
$outputDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('ziwei-service-' + [guid]::NewGuid().ToString('N'))
[void] [System.IO.Directory]::CreateDirectory($outputDirectory)
$serviceArgs = @((Join-Path $PSScriptRoot 'service-windows.mjs'), $outputDirectory) + $args
$start = [System.Diagnostics.ProcessStartInfo]::new()
$start.FileName = $node
$start.WorkingDirectory = (Get-Location).ProviderPath
$start.Arguments = ($serviceArgs | ForEach-Object { Quote-WindowsArgument ([string] $_) }) -join ' '
$start.UseShellExecute = $true
$start.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $start
try {
    [void] $process.Start()
    $process.WaitForExit()
    $outputPath = Join-Path $outputDirectory 'stdout.log'
    $errorPath = Join-Path $outputDirectory 'stderr.log'
    if (Test-Path -LiteralPath $outputPath) { [Console]::Out.Write([System.IO.File]::ReadAllText($outputPath, [System.Text.Encoding]::UTF8)) }
    if (Test-Path -LiteralPath $errorPath) { [Console]::Error.Write([System.IO.File]::ReadAllText($errorPath, [System.Text.Encoding]::UTF8)) }
    $code = $process.ExitCode
} finally {
    $process.Dispose()
    Remove-Item -LiteralPath $outputDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
exit $code
