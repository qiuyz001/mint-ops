# 生产模式试跑 30 分钟：每分钟一次 one-shot（等价于 cron），只在 exit 10/11 时归档 prompt/digest
$ErrorActionPreference = "Continue"
Set-Location "D:\Workspace\mint-ops-v2"
$env:NODE_PATH = "$env:TEMP\baw-proxy\node_modules"
$env:NODE_OPTIONS = "--require $env:TEMP\baw-proxy\proxy.cjs"

$start = Get-Date
$deadline = $start.AddMinutes(30)
$i = 0
$hits = 0
$errors = 0

New-Item -ItemType Directory -Force "data\gang\archive" | Out-Null
Add-Content "data\gang\cron.log" "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ===== 30min production test start ====="

while ((Get-Date) -lt $deadline) {
    $i++
    $ts = Get-Date -Format "yyyyMMdd-HHmmss"
    $out = & node "scripts\gang-watch.mjs" --json 2>&1 | Out-String
    $code = $LASTEXITCODE
    $line = "[$ts] cycle=$i exit=$code bytes=$($out.Length)"
    Add-Content "data\gang\cron.log" $line

    if ($code -eq 10 -or $code -eq 11) {
        $hits++
        Copy-Item "data\gang\prompt.txt" "data\gang\archive\$ts-prompt.txt" -ErrorAction SilentlyContinue
        Copy-Item "data\gang\digest.md" "data\gang\archive\$ts-digest.md" -ErrorAction SilentlyContinue
        Copy-Item "data\gang\ai-queue.jsonl" "data\gang\archive\$ts-queue.jsonl" -ErrorAction SilentlyContinue
        Write-Output "$ts HIT exit=$code (archived)"
    } elseif ($code -ne 0) {
        $errors++
        Write-Output "$ts ERROR exit=$code"
    }

    $left = [math]::Round(($deadline - (Get-Date)).TotalMinutes, 1)
    if ($left -le 0) { break }
    Start-Sleep -Seconds 60
}

Add-Content "data\gang\cron.log" "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] ===== done cycles=$i hits=$hits errors=$errors ====="
Write-Output "SUMMARY cycles=$i hits=$hits errors=$errors"
