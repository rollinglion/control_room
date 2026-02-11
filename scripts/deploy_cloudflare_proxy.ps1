param(
  [switch]$CommitAndPush = $true
)

$ErrorActionPreference = "Stop"

function Read-EnvFile {
  param([string]$Path)
  $map = @{}
  if (!(Test-Path $Path)) { return $map }
  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#")) { return }
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { return }
    $k = $line.Substring(0, $idx).Trim()
    $v = $line.Substring($idx + 1).Trim()
    $map[$k] = $v
  }
  return $map
}

function Upsert-JsGlobal {
  param(
    [string]$FilePath,
    [string]$Name,
    [string]$Value
  )
  $line = "window.$Name = `"$Value`";"
  if (!(Test-Path $FilePath)) {
    Set-Content -Path $FilePath -Value @(
      "// Auto-generated local API key file (gitignored)",
      $line
    ) -Encoding UTF8
    return
  }
  $content = Get-Content $FilePath
  $pattern = "^\s*window\.$([Regex]::Escape($Name))\s*=\s*.*;"
  $found = $false
  $out = @()
  foreach ($l in $content) {
    if ($l -match $pattern) {
      $out += $line
      $found = $true
    } else {
      $out += $l
    }
  }
  if (-not $found) { $out += $line }
  Set-Content -Path $FilePath -Value $out -Encoding UTF8
}

function Put-WranglerSecret {
  param(
    [string]$WranglerCmd,
    [string]$Name,
    [string]$Value,
    [string]$WorkDir
  )
  if ([string]::IsNullOrWhiteSpace($Value)) { return }
  $escaped = $Value.Replace('"', '\"')
  $cmd = "cmd /c `"echo $escaped| `"$WranglerCmd`" secret put $Name`""
  Invoke-Expression "& $cmd" | Out-Null
  Write-Output "Set Worker secret: $Name"
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$workerDir = Join-Path $root "deploy\cloudflare-worker"
$envFile = Join-Path $root ".env"
$apiKeysJs = Join-Path $root "js\api_keys.js"

$nodePath = "C:\Program Files\nodejs"
$wranglerCmd = "$env:APPDATA\npm\wrangler.cmd"

if (!(Test-Path "$nodePath\node.exe")) {
  throw "Node.js not found at $nodePath\node.exe"
}
if (!(Test-Path $wranglerCmd)) {
  throw "Wrangler not found at $wranglerCmd"
}

$env:Path = "$nodePath;$env:Path"

$envMap = Read-EnvFile -Path $envFile
$ch = $envMap["CH_API_KEY"]
$osPlaces = $envMap["OS_PLACES_API_KEY"]
$signalbox = $envMap["SIGNALBOX_API_KEY"]
$aviation = $envMap["AVIATIONSTACK_API_KEY"]

$who = & $wranglerCmd whoami 2>&1
$isAuthed = ($LASTEXITCODE -eq 0) -and (-not ($who -join "`n" -match "not authenticated"))
if (-not $isAuthed -and [string]::IsNullOrWhiteSpace($env:CLOUDFLARE_API_TOKEN)) {
  throw "Wrangler not authenticated. Run 'wrangler login' once, or set CLOUDFLARE_API_TOKEN, then rerun this script."
}

Push-Location $workerDir
try {
  $deployOut = & $wranglerCmd deploy 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Wrangler deploy failed:`n$($deployOut -join "`n")"
  }
  $joined = ($deployOut -join "`n")
  $urlMatch = [Regex]::Match($joined, "https://[a-zA-Z0-9\.-]+\.workers\.dev")
  if (!$urlMatch.Success) {
    throw "Could not detect Worker URL from deploy output.`n$joined"
  }
  $workerUrl = $urlMatch.Value
  Write-Output "Worker deployed: $workerUrl"

  Put-WranglerSecret -WranglerCmd $wranglerCmd -Name "CH_API_KEY" -Value $ch -WorkDir $workerDir
  Put-WranglerSecret -WranglerCmd $wranglerCmd -Name "OS_PLACES_API_KEY" -Value $osPlaces -WorkDir $workerDir
  Put-WranglerSecret -WranglerCmd $wranglerCmd -Name "SIGNALBOX_API_KEY" -Value $signalbox -WorkDir $workerDir
  Put-WranglerSecret -WranglerCmd $wranglerCmd -Name "AVIATIONSTACK_API_KEY" -Value $aviation -WorkDir $workerDir

  Upsert-JsGlobal -FilePath $apiKeysJs -Name "CONTROL_ROOM_API_BASE" -Value $workerUrl
  if (-not [string]::IsNullOrWhiteSpace($ch)) {
    Upsert-JsGlobal -FilePath $apiKeysJs -Name "CH_API_KEY" -Value $ch
  }

  if ($CommitAndPush) {
    Push-Location $root
    try {
      git add js/api_keys.js
      git commit -m "Configure hosted Cloudflare proxy URL in api_keys.js" | Out-Null
      git push origin main | Out-Null
      Write-Output "Committed and pushed api_keys.js update."
    } catch {
      Write-Output "No commit/push performed: $($_.Exception.Message)"
    } finally {
      Pop-Location
    }
  }

  Write-Output "All steps complete."
} finally {
  Pop-Location
}
