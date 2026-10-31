$ErrorActionPreference = 'Stop'
# PowerShell's native-command job waits for detached descendants too. Wait for
# only the Node manager here; its supervisor owns the long-running service.
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

function Quote-WindowsArgument([string] $Value) {
    if ($Value -ne '' -and $Value -notmatch '[\s"]') { return $Value }
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)$', '$1$1')
    return '"' + $escaped + '"'
}

$node = (Get-Command node -CommandType Application -ErrorAction Stop).Source
$serviceArgs = @((Join-Path $PSScriptRoot 'service.mjs')) + $args
$start = [System.Diagnostics.ProcessStartInfo]::new()
$start.FileName = $node
$start.Arguments = ($serviceArgs | ForEach-Object { Quote-WindowsArgument ([string] $_) }) -join ' '
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardOutput = $true
$start.RedirectStandardError = $true
$start.StandardOutputEncoding = [System.Text.UTF8Encoding]::new($false)
$start.StandardErrorEncoding = [System.Text.UTF8Encoding]::new($false)
$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $start
try {
    [void] $process.Start()
    $output = $process.StandardOutput.ReadToEndAsync()
    $errors = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    [Console]::Out.Write($output.GetAwaiter().GetResult())
    [Console]::Error.Write($errors.GetAwaiter().GetResult())
    $code = $process.ExitCode
} finally { $process.Dispose() }
exit $code
