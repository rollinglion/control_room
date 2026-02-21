param(
  [ValidateSet("quality", "max-throughput")]
  [string]$Preset = "quality"
)

function Set-EnvIfMissing {
  param(
    [string]$Name,
    [string]$Value
  )
  if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($Name, "Process"))) {
    [Environment]::SetEnvironmentVariable($Name, $Value, "Process")
  }
}

# Ensure previous test filters do not leak into full batch runs.
Remove-Item Env:RENDER_FILES -ErrorAction SilentlyContinue
Remove-Item Env:RENDER_NAME_FILTER -ErrorAction SilentlyContinue
Remove-Item Env:RENDER_LIMIT -ErrorAction SilentlyContinue
$env:RENDER_RECURSIVE = "1"

switch ($Preset) {
  "quality" {
    Set-EnvIfMissing "RENDER_SAMPLES" "48"
    Set-EnvIfMissing "RENDER_MAX_BOUNCES" "12"
    Set-EnvIfMissing "RENDER_USE_ADAPTIVE" "0"
    Set-EnvIfMissing "RENDER_BACKEND" "OPTIX"
    Set-EnvIfMissing "RENDER_USE_CPU_WITH_GPU" "0"
    Set-EnvIfMissing "RENDER_THREADS" "0"
  }
  "max-throughput" {
    Set-EnvIfMissing "RENDER_SAMPLES" "48"
    Set-EnvIfMissing "RENDER_MAX_BOUNCES" "12"
    Set-EnvIfMissing "RENDER_USE_ADAPTIVE" "1"
    Set-EnvIfMissing "RENDER_ADAPTIVE_THRESHOLD" "0.015"
    Set-EnvIfMissing "RENDER_BACKEND" "OPTIX"
    Set-EnvIfMissing "RENDER_USE_CPU_WITH_GPU" "1"
    Set-EnvIfMissing "RENDER_THREADS" "0"
  }
}

Write-Host "Preset: $Preset"
Write-Host "Render vars: samples=$env:RENDER_SAMPLES bounces=$env:RENDER_MAX_BOUNCES adaptive=$env:RENDER_USE_ADAPTIVE backend=$env:RENDER_BACKEND cpu_with_gpu=$env:RENDER_USE_CPU_WITH_GPU threads=$env:RENDER_THREADS"

& "C:\Program Files\Blender Foundation\Blender 4.0\blender.exe" `
  --background `
  --python "C:\Users\44752\Desktop\Control Room\data\vehicles\_render_skoda_test.py"
