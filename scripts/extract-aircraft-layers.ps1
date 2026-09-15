# Legacy atlas import. New artwork must be edited from ONE locked master geometry,
# never independently regenerated as two aircraft. See docs/AIRCRAFT-RENDERING.md.
param([string[]]$Models = @('starter-swift','swift-p','swift-f','swift-m','heron-p','heron-f','heron-m','albatross-p','albatross-f','albatross-m','aurora-p','aurora-f','aurora-m'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$workspace = Split-Path $PSScriptRoot -Parent
$layouts = Get-Content (Join-Path $workspace 'src/ui/aircraft-layer-layouts.json') -Raw | ConvertFrom-Json
$reviewDirectory = Join-Path $workspace 'art/aircraft-layers-v4/registration-review'
New-Item -ItemType Directory -Force -Path $reviewDirectory | Out-Null
foreach ($model in $Models) {
  $layout = $layouts.PSObject.Properties[$model]
  if ($null -eq $layout) { throw "Unregistered aircraft: $model" }
  $bounds = $layout.Value.nearBounds
  $room = $layout.Value.interior
  foreach ($rect in @($bounds, $room)) {
    foreach ($key in @('x','y','width','height')) {
      $value = [double]$rect.$key
      if ([double]::IsNaN($value) -or [double]::IsInfinity($value)) { throw "Invalid $model registration: $key" }
    }
    if ($rect.width -le 0 -or $rect.height -le 0) { throw "Empty $model registration" }
  }
  if ($room.x -lt 0 -or $room.y -lt 0 -or $room.x + $room.width -gt 1536 -or $room.y + $room.height -gt 590) {
    throw "Cabin outside $model cutaway canvas"
  }
  $bitmap = [System.Drawing.Bitmap]::new((Join-Path $workspace "art/aircraft-layers-v4/$model-source.png"))
  $base = $null; $near = $null; $exterior = $null
  try {
    if ($bitmap.Width -ne 1536 -or $bitmap.Height -ne 1024) { throw "Wrong $model atlas canvas; do not auto-crop or stretch it" }
    $base = $bitmap.Clone([System.Drawing.Rectangle]::new(0,0,1536,590),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $near = $bitmap.Clone([System.Drawing.Rectangle]::new(0,590,1536,434),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $base.SetResolution(96,96); $near.SetResolution(96,96)
    # Match the browser coverage gate BEFORE publishing any of this model's files.
    for ($u = .05; $u -lt 1; $u += .1) {
      for ($v = .05; $v -lt 1; $v += .1) {
        $x = [int][Math]::Floor(($room.x + $u * $room.width - $bounds.x) / $bounds.width * $near.Width)
        $y = [int][Math]::Floor(($room.y + $v * $room.height - $bounds.y) / $bounds.height * $near.Height)
        if ($x -lt 0 -or $y -lt 0 -or $x -ge $near.Width -or $y -ge $near.Height -or $near.GetPixel($x,$y).A -le 245) {
          throw "Near shell does not cover $model cabin; correct the source registration, not the UI CSS"
        }
      }
    }
    $exterior = $base.Clone([System.Drawing.Rectangle]::new(0,0,1536,590),[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($exterior)
    try {
      # Specify BOTH source and destination in pixels; image DPI must not add a transform.
      $graphics.PageUnit = [Drawing.GraphicsUnit]::Pixel
      $graphics.DrawImage($near,[Drawing.RectangleF]::new($bounds.x,$bounds.y,$bounds.width,$bounds.height),[single]0,[single]0,[single]$near.Width,[single]$near.Height,[Drawing.GraphicsUnit]::Pixel)
    } finally { $graphics.Dispose() }
    $base.Save((Join-Path $workspace "public/art/aircraft-$model-cutaway-v4.png"))
    $near.Save((Join-Path $workspace "public/art/aircraft-$model-near-v4.png"))
    $exterior.Save((Join-Path $workspace "public/art/aircraft-$model-exterior-v4.png"))
    # One SVG coordinate system makes contour errors visible at 50% opacity.
    # This is review evidence, not another in-game room/background.
    $left = [Math]::Min(0,$bounds.x); $top = [Math]::Min(0,$bounds.y)
    $width = [Math]::Max(1536,$bounds.x + $bounds.width) - $left
    $height = [Math]::Max(590,$bounds.y + $bounds.height) - $top
    $culture = [Globalization.CultureInfo]::InvariantCulture
    $viewBox = (@($left,$top,$width,$height) | ForEach-Object { ([double]$_).ToString($culture) }) -join ' '
    $x = ([double]$bounds.x).ToString($culture); $y = ([double]$bounds.y).ToString($culture)
    $w = ([double]$bounds.width).ToString($culture); $h = ([double]$bounds.height).ToString($culture)
    @"
<svg xmlns="http://www.w3.org/2000/svg" viewBox="$viewBox">
<title>${model}: registered hull and 50-percent near shell</title>
<image href="../../../public/art/aircraft-$model-cutaway-v4.png" width="1536" height="590"/>
<image href="../../../public/art/aircraft-$model-near-v4.png" x="$x" y="$y" width="$w" height="$h" preserveAspectRatio="none" opacity=".5"/>
</svg>
"@ | Set-Content -Encoding utf8 (Join-Path $reviewDirectory "$model.svg")
  } finally {
    if ($null -ne $exterior) { $exterior.Dispose() }
    if ($null -ne $near) { $near.Dispose() }
    if ($null -ne $base) { $base.Dispose() }
    $bitmap.Dispose()
  }
}
