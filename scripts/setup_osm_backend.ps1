param(
  [string]$PbfPath = "data/OS Map/great-britain-260211.osm.pbf",
  [string]$OutDir = "data/osm_derived",
  [double]$Simplify = 25
)

$ErrorActionPreference = "Stop"

function Test-Ogr {
  if (Get-Command ogr2ogr -ErrorAction SilentlyContinue) { return $true }
  $gdalOgr = Join-Path ${env:ProgramFiles} "GDAL\ogr2ogr.exe"
  return (Test-Path $gdalOgr)
}

Write-Host "Checking GDAL/ogr2ogr..."
if (-not (Test-Ogr)) {
  Write-Host "Installing GDAL via winget (GISInternals.GDAL)..."
  winget install --id GISInternals.GDAL --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "winget install failed with exit code $LASTEXITCODE"
  }
}

if (-not (Test-Ogr)) {
  throw "GDAL install did not expose ogr2ogr. Reopen terminal and rerun this script."
}

Write-Host "Running OSM extraction with ogr backend..."
python scripts/build_osm_layers.py --backend ogr --pbf "$PbfPath" --out "$OutDir" --simplify "$Simplify"
if ($LASTEXITCODE -ne 0) {
  throw "OSM extraction failed with exit code $LASTEXITCODE"
}

Write-Host "Done. Outputs in $OutDir"
