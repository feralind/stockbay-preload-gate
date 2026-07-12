# Generate StockWay app icons (PNG + multi-size ICO) from the Candles brand mark.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root 'assets'
New-Item -ItemType Directory -Force -Path $assets | Out-Null

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = [Math]::Max(0.5, $r * 2)
  if ($d -gt $w) { $d = $w }
  if ($d -gt $h) { $d = $h }
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-BrandMark([System.Drawing.Bitmap]$bmp) {
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)

  $s = $bmp.Width / 64.0
  $blue = [System.Drawing.Color]::FromArgb(255, 59, 130, 246)
  $white = [System.Drawing.Color]::White
  $white92 = [System.Drawing.Color]::FromArgb(235, 255, 255, 255)
  $white85 = [System.Drawing.Color]::FromArgb(217, 255, 255, 255)

  $tile = New-RoundedRectPath (4 * $s) (4 * $s) (56 * $s) (56 * $s) (14 * $s)
  $brush = New-Object System.Drawing.SolidBrush $blue
  $g.FillPath($brush, $tile)
  $brush.Dispose()
  $tile.Dispose()

  $penW = [Math]::Max(1.0, 2.5 * $s)
  $pen = New-Object System.Drawing.Pen $white, $penW
  $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

  $g.DrawLine($pen, 20 * $s, 18 * $s, 20 * $s, 26 * $s)
  $g.DrawLine($pen, 20 * $s, 38 * $s, 20 * $s, 46 * $s)
  $g.DrawLine($pen, 32 * $s, 14 * $s, 32 * $s, 24 * $s)
  $g.DrawLine($pen, 32 * $s, 36 * $s, 32 * $s, 50 * $s)
  $g.DrawLine($pen, 44 * $s, 22 * $s, 44 * $s, 28 * $s)
  $g.DrawLine($pen, 44 * $s, 40 * $s, 44 * $s, 46 * $s)
  $pen.Dispose()

  $candles = @(
    @{ x = 16; y = 26; w = 8; h = 12; c = $white },
    @{ x = 28; y = 24; w = 8; h = 12; c = $white92 },
    @{ x = 40; y = 28; w = 8; h = 12; c = $white85 }
  )
  foreach ($cnd in $candles) {
    $rx = [Math]::Max(0.5, 1.5 * $s)
    $body = New-RoundedRectPath ($cnd.x * $s) ($cnd.y * $s) ($cnd.w * $s) ($cnd.h * $s) $rx
    $b = New-Object System.Drawing.SolidBrush $cnd.c
    $g.FillPath($b, $body)
    $b.Dispose()
    $body.Dispose()
  }

  $g.Dispose()
}

# Write PNGs at each size (Node pack-ico.js will build the .ico)
$sizes = @(16, 32, 48, 256, 512)
foreach ($sz in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap $sz, $sz, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  Draw-BrandMark $bmp
  $out = Join-Path $assets ("icon-{0}.png" -f $sz)
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  if ($sz -eq 512) {
    $bmp.Save((Join-Path $assets 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  }
  if ($sz -eq 256) {
    $bmp.Save((Join-Path $assets 'icon-256.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  }
  $bmp.Dispose()
  Write-Host "Wrote assets/icon-$sz.png"
}

Write-Host "Done PNGs. Run: node scripts/pack-ico.js"
