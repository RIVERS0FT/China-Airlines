# Cross-platform extraction has one coordinate source and one implementation.
$ErrorActionPreference = 'Stop'
& node (Join-Path $PSScriptRoot 'prepare-aircraft-art.mjs') --review
if ($LASTEXITCODE -ne 0) { throw "Aircraft extraction failed ($LASTEXITCODE)" }
