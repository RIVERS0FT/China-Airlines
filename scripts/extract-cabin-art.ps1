# Extract original generated atlas frames without drawing or resampling assets.
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
function Export-CabinFrame($source, $name, $x, $y, $width, $height) {
    $bitmap = [System.Drawing.Bitmap]::new((Join-Path $root $source))
    try {
        $frame = $bitmap.Clone([System.Drawing.Rectangle]::new($x, $y, $width, $height), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try { $frame.Save((Join-Path $root "public/art/$name.png"), [System.Drawing.Imaging.ImageFormat]::Png) }
        finally { $frame.Dispose() }
    } finally { $bitmap.Dispose() }
}
Export-CabinFrame 'art/cabin-layered-v1/hulls-left-source.png' 'cabin-hull-light-v1' 0 65 1254 365
Export-CabinFrame 'art/cabin-layered-v1/hulls-left-source.png' 'cabin-hull-regional-v1' 0 480 1254 360
Export-CabinFrame 'art/cabin-layered-v1/hulls-left-source.png' 'cabin-hull-heavy-v1' 0 857 1254 365
Export-CabinFrame 'art/cabin-layered-v1/interior-source.png' 'cabin-interior-passengers-v1' 45 51 1445 251
Export-CabinFrame 'art/cabin-layered-v1/interior-source.png' 'cabin-interior-cargo-v1' 42 358 1452 258
Export-CabinFrame 'art/cabin-layered-v1/interior-source.png' 'cabin-seat-left-v1' 202 647 276 350
Export-CabinFrame 'art/cabin-layered-v1/interior-source.png' 'cabin-pallet-v1' 762 830 665 139

# V2 props use a shared weak-orthographic camera. The rear seat and near
# armrest stay separate so a seated passenger can be composited between them.
Export-CabinFrame 'art/cabin-layered-v2/props-source.png' 'cabin-seat-rear-v2' 56 23 519 664
Export-CabinFrame 'art/cabin-layered-v2/props-source.png' 'cabin-seat-front-v2' 661 410 434 193
Export-CabinFrame 'art/cabin-layered-v2/props-source.png' 'cabin-pallet-v2' 1161 517 988 151

# V3 is a left-turned armless chair including its floor feet.
Export-CabinFrame 'art/cabin-layered-v3/props-source.png' 'cabin-seat-v3' 45 113 678 804
Export-CabinFrame 'art/cabin-layered-v3/props-source.png' 'cabin-pallet-v3' 719 648 787 237
