# Crops generated alpha atlases. No recoloring or shared airframe substitutes.
param([string[]]$Models = @('starter-swift','swift-p','swift-f','swift-m','heron-p','heron-f','heron-m','albatross-p','albatross-f','albatross-m','aurora-p','aurora-f','aurora-m'))
Add-Type -AssemblyName System.Drawing
$workspace = Split-Path $PSScriptRoot -Parent
$layouts = Get-Content (Join-Path $workspace 'src/ui/aircraft-layer-layouts.json') -Raw | ConvertFrom-Json
foreach ($model in $Models) {
  $bitmap = [System.Drawing.Bitmap]::new((Join-Path $workspace "art/aircraft-layers-v4/$model-source.png"))
  try {
    $base = $bitmap.Clone([System.Drawing.Rectangle]::new(0,0,1536,590),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $base.Save((Join-Path $workspace "public/art/aircraft-$model-cutaway-v4.png"))
    $near = $bitmap.Clone([System.Drawing.Rectangle]::new(0,590,1536,434),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $near.Save((Join-Path $workspace "public/art/aircraft-$model-near-v4.png"))
      # Flatten the same two registered layers for small static shop/map sprites.
      $graphics = [Drawing.Graphics]::FromImage($base)
      try {
        $bounds=$layouts.$model.nearBounds
        $graphics.DrawImage($near,[Drawing.RectangleF]::new($bounds.x,$bounds.y,$bounds.width,$bounds.height))
      } finally { $graphics.Dispose() }
      $base.Save((Join-Path $workspace "public/art/aircraft-$model-exterior-v4.png"))
    } finally { $near.Dispose(); $base.Dispose() }
  } finally { $bitmap.Dispose() }
}
