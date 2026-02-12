param(
  [string]$PbfPath = "data/OS Map/great-britain-260211.osm.pbf",
  [string]$OutDir = "data/osm_derived",
  [double]$Simplify = 25
)

$ErrorActionPreference = "Stop"

function Test-Ogr {
  if (Get-Command ogr2ogr -ErrorAction SilentlyContinue) { return $true }
  $gdalOgr = Join-Path ${env:ProgramFiles} "GDAL\ogr2ogr.exe"
  if (Test-Path $gdalOgr) { return $true }
  $qgisOgr = Join-Path ${env:ProgramFiles} "QGIS 3.36.0\bin\ogr2ogr.exe"
  if (Test-Path $qgisOgr) { return $true }
  return $false
}

function Refresh-OgrPath {
  $paths = @(
    (Join-Path ${env:ProgramFiles} "GDAL"),
    (Join-Path ${env:ProgramFiles} "QGIS 3.36.0\bin"),
    (Join-Path ${env:ProgramFiles} "QGIS 3.34.0\bin")
  )
  foreach ($p in $paths) {
    if (Test-Path $p -PathType Container) {
      if (-not ($env:Path -split ';' | Where-Object { $_ -eq $p })) {
        $env:Path = "$p;$env:Path"
      }
    }
  }
}

function Install-Gdal {
  $candidates = @(
    "GISInternals.GDAL",
    "OSGeo.GDAL",
    "QGIS.QGIS"
  )
  foreach ($id in $candidates) {
    Write-Host "Trying winget package: $id"
    winget install --id $id --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Installed: $id"
      return $true
    }
  }
  return $false
}

Write-Host "Checking GDAL/ogr2ogr..."
if (-not (Test-Ogr)) {
  Write-Host "Installing GDAL via winget..."
  $ok = Install-Gdal
  if (-not $ok) {
    throw "Could not install GDAL via winget package ids: GISInternals.GDAL / OSGeo.GDAL / QGIS.QGIS"
  }
}

Refresh-OgrPath

if (-not (Test-Ogr)) {
  throw "GDAL install completed but ogr2ogr is still not detected. Reopen terminal and rerun, or verify C:\\Program Files\\GDAL\\ogr2ogr.exe exists."
}

Write-Host "Running OSM extraction with ogr backend..."
python scripts/build_osm_layers.py --backend ogr --pbf "$PbfPath" --out "$OutDir" --simplify "$Simplify"
if ($LASTEXITCODE -ne 0) {
  throw "OSM extraction failed with exit code $LASTEXITCODE"
}

Write-Host "Done. Outputs in $OutDir"
