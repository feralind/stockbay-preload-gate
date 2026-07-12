# StockWay local server + Yahoo Finance API proxy
param(
  [switch]$Silent,
  [switch]$NoBrowser
)

$Port = 8091
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $Root "stockway.pid"
$FinnhubKey = $env:FINNHUB_API_KEY
$keyFile = Join-Path $Root "finnhub.key"
if (-not $FinnhubKey -and (Test-Path $keyFile)) {
  $FinnhubKey = (Get-Content $keyFile -Raw).Trim()
}
$script:ShutdownRequested = $false
$ShutdownToken = [guid]::NewGuid().ToString('N')
$UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
$CacheBust = "test63"

$Mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.ico'  = 'image/x-icon'
  '.png'  = 'image/png'
  '.svg'  = 'image/svg+xml'
}

function Write-Info($msg, $color = 'White') {
  if (-not $Silent) { Write-Host $msg -ForegroundColor $color }
}

function To-YahooSymbol($sym) { return $sym.Replace('.', '-') }

function Fetch-YahooQuote($sym) {
  $ysym = To-YahooSymbol $sym
  $url = "https://query1.finance.yahoo.com/v8/finance/chart/${ysym}?interval=1d&range=5d"
  try {
    $r = Invoke-RestMethod -Uri $url -UserAgent $UserAgent -TimeoutSec 10
    $m = $r.chart.result[0].meta
    if (-not $m.regularMarketPrice) { return $null }
    $prev = $m.chartPreviousClose
    if (-not $prev) { $prev = $m.previousClose }
    if (-not $prev) { $prev = $m.regularMarketPrice }
    $chg = $m.regularMarketPrice - $prev
    $pct = 0
    if ($prev -ne 0) { $pct = ($chg / $prev) * 100 }
    return @{
      sym = $sym.ToUpper()
      price = $m.regularMarketPrice
      open = $m.regularMarketOpen
      high = $m.regularMarketDayHigh
      low = $m.regularMarketDayLow
      prevClose = $prev
      change = $chg
      changePct = $pct
      updated = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
      simulated = $false
      source = "yahoo"
    }
  } catch { return $null }
}

function Fetch-YahooCandles($sym, $resolution, $count) {
  $ysym = To-YahooSymbol $sym
  $interval = "5m"
  $range = "5d"
  if ($resolution -eq "1") { $interval = "1m" }
  if ($resolution -eq "15") { $interval = "15m" }
  if ($resolution -eq "60") { $interval = "1h" }
  if ($resolution -eq "D") { $interval = "1d"; $range = "6mo" }
  $url = "https://query1.finance.yahoo.com/v8/finance/chart/${ysym}?interval=${interval}&range=${range}"
  try {
    $r = Invoke-RestMethod -Uri $url -UserAgent $UserAgent -TimeoutSec 15
    $result = $r.chart.result[0]
    $ts = $result.timestamp
    $q = $result.indicators.quote[0]
    if (-not $ts) { return $null }
    $candles = @()
    for ($i = 0; $i -lt $ts.Count; $i++) {
      if ($null -eq $q.close[$i]) { continue }
      $candles += @{
        time = $ts[$i]
        open = $q.open[$i]
        high = $q.high[$i]
        low = $q.low[$i]
        close = $q.close[$i]
        volume = $q.volume[$i]
      }
    }
    if ($count -gt 0 -and $candles.Count -gt $count) {
      $start = $candles.Count - $count
      $candles = $candles[$start..($candles.Count - 1)]
    }
    return $candles
  } catch { return $null }
}

function Write-Json($res, $obj) {
  $json = $obj | ConvertTo-Json -Depth 6 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $res.ContentType = "application/json; charset=utf-8"
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Test-BlockedStatic($relPath) {
  $normalized = ($relPath -replace '\\', '/').TrimStart('/')
  $base = [System.IO.Path]::GetFileName($normalized).ToLower()
  $blocked = @('finnhub.key', 'package.json', 'package-lock.json', '.env', '.gitignore')
  if ($blocked -contains $base) { return $true }
  if ($base.EndsWith('.key') -or $base.EndsWith('.pem')) { return $true }
  if ($normalized.StartsWith('scripts/')) { return $true }
  if ($normalized.StartsWith('electron/') -and $base.EndsWith('.cjs')) { return $true }
  return $false
}

function Test-ValidSymbol($sym) {
  return $sym -match '^[A-Z0-9.\-]{1,16}$'
}

function Handle-Api($req, $res) {
  $path = $req.Url.LocalPath
  $query = $req.QueryString
  $sym = $query["symbol"]
  if (-not $sym) { $sym = "AAPL" }
  $sym = $sym.ToUpper()

  if ($path -eq "/api/shutdown") {
    if ($req.HttpMethod -ne "POST") {
      $res.StatusCode = 405
      Write-Json $res @{ error = "POST required" }
      return $true
    }
    $tok = $req.Headers["X-StockWay-Shutdown"]
    if ($tok -ne $ShutdownToken) {
      $res.StatusCode = 403
      Write-Json $res @{ error = "Forbidden" }
      return $true
    }
    Write-Json $res @{ ok = $true; app = "StockWay" }
    $script:ShutdownRequested = $true
    return $true
  }

  if ($path -eq "/api/config") {
    Write-Json $res @{ yahoo = $true; finnhub = [bool]$FinnhubKey; shutdownToken = $ShutdownToken }
    return $true
  }

  if ($path -eq "/api/news") {
    if (-not $FinnhubKey) {
      Write-Json $res @{ news = @() }
      return $true
    }
    try {
      # Proxy raw Finnhub JSON so article `url` is never dropped by ConvertTo-Json quirks
      $fhUrl = "https://finnhub.io/api/v1/news?category=general&token=$FinnhubKey"
      $raw = (Invoke-WebRequest -Uri $fhUrl -UseBasicParsing -TimeoutSec 10).Content
      $parsed = $raw | ConvertFrom-Json
      $items = @()
      foreach ($n in @($parsed | Select-Object -First 25)) {
        $articleUrl = $n.url
        if (-not $articleUrl) { $articleUrl = $n.link }
        if (-not $articleUrl) { $articleUrl = $n.article_url }
        $items += [ordered]@{
          category = [string]$n.category
          datetime = [int64]$n.datetime
          headline = [string]$n.headline
          id       = $n.id
          image    = [string]$n.image
          related  = [string]$n.related
          source   = [string]$n.source
          summary  = [string]$n.summary
          url      = [string]$articleUrl
        }
      }
      Write-Json $res @{ news = $items }
      return $true
    } catch {
      $res.StatusCode = 502
      Write-Json $res @{ error = "News unavailable" }
      return $true
    }
  }

  if ($path -eq "/api/splash-choice" -and $req.HttpMethod -eq "POST") {
    $reader = New-Object System.IO.StreamReader($req.InputStream, $req.ContentEncoding)
    $body = $reader.ReadToEnd()
    $reader.Close()
    try {
      $json = $body | ConvertFrom-Json
      $choice = ($json.choice + "").Trim().ToLower()
      $allowed = @("candles", "neon", "ticker", "bars")
      if ($allowed -contains $choice) {
        $outFile = Join-Path $Root "electron\splash-active.txt"
        [System.IO.File]::WriteAllText($outFile, $choice)
        Write-Json $res @{ ok = $true; choice = $choice }
        return $true
      }
    } catch {}
    $res.StatusCode = 400
    Write-Json $res @{ error = "Invalid choice" }
    return $true
  }

  if ($path -eq "/api/quote") {
    if (-not (Test-ValidSymbol $sym)) {
      $res.StatusCode = 400
      Write-Json $res @{ error = "Invalid symbol" }
      return $true
    }
    $q = Fetch-YahooQuote $sym
    if ($q) { Write-Json $res $q; return $true }
    $res.StatusCode = 502
    Write-Json $res @{ error = "Quote unavailable" }
    return $true
  }

  if ($path -eq "/api/candles") {
    if (-not (Test-ValidSymbol $sym)) {
      $res.StatusCode = 400
      Write-Json $res @{ error = "Invalid symbol" }
      return $true
    }
    $resVal = $query["resolution"]
    if (-not $resVal) { $resVal = "5" }
    $cnt = 120
    if ($query["count"]) {
      $parsedCnt = 0
      [void][int]::TryParse($query["count"], [ref]$parsedCnt)
      if ($parsedCnt -gt 0) { $cnt = [Math]::Min(500, $parsedCnt) }
    }
    $candles = Fetch-YahooCandles $sym $resVal $cnt
    if ($candles) { Write-Json $res @{ candles = $candles }; return $true }
    $res.StatusCode = 502
    Write-Json $res @{ error = "Candles unavailable" }
    return $true
  }

  return $false
}

# Port already in use? Verify it's our Yahoo proxy, otherwise restart
$portBusy = $false
try {
  $test = New-Object System.Net.Sockets.TcpClient("127.0.0.1", $Port)
  $test.Close()
  $portBusy = $true
} catch { $portBusy = $false }

if ($portBusy) {
  $okServer = $false
  try {
    $probe = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/config" -TimeoutSec 4
    if ($null -ne $probe.yahoo) { $okServer = $true }
  } catch { $okServer = $false }

  if ($okServer) {
    Write-Info "StockWay server already running - opening browser..." "DarkGray"
    if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$Port/?v=$CacheBust" }
    exit 0
  }

  Write-Info "Port $Port busy with wrong server - restarting..." "Yellow"
  Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
  }
  Start-Sleep -Seconds 2
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
try {
  $listener.Start()
} catch {
  Write-Info "Failed to start server on port $Port - run Stop StockWay.bat then try again." "Red"
  if (-not $Silent) { Write-Host $_.Exception.Message -ForegroundColor DarkRed }
  exit 1
}
[System.IO.File]::WriteAllText($PidFile, "$PID")

if (-not $Silent) {
  Write-Host ""
  Write-Host "  StockWay is running!" -ForegroundColor Green
  Write-Host "  http://127.0.0.1:$Port" -ForegroundColor White
  Write-Host "  Data: Yahoo Finance (stable live prices)" -ForegroundColor DarkGray
  Write-Host "  KEEP THIS WINDOW OPEN while playing." -ForegroundColor Yellow
  Write-Host ""
}

Start-Sleep -Milliseconds 400
if (-not $NoBrowser) {
  Start-Process "http://127.0.0.1:$Port/?v=$CacheBust"
}

try {
while ($listener.IsListening -and -not $script:ShutdownRequested) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response

  try {
    if ($req.Url.LocalPath.StartsWith("/api/")) {
      if (-not (Handle-Api $req $res)) { $res.StatusCode = 404 }
      $res.Close()
      if ($script:ShutdownRequested) { break }
      continue
    }

    $path = [Uri]::UnescapeDataString($req.Url.LocalPath)
    if ($path -eq "/") { $path = "/index.html" }

    $rel = $path.TrimStart("/").Replace("/", "\")
    if (Test-BlockedStatic $rel) {
      $res.StatusCode = 403
      $res.Close()
      continue
    }

    $file = Join-Path $Root ($path.TrimStart("/").Replace("/", "\"))
    $file = [System.IO.Path]::GetFullPath($file)

    if (-not $file.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase)) {
      $res.StatusCode = 403
      $res.Close()
      continue
    }

    if (Test-Path $file -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = $Mime[$ext]
      if (-not $res.ContentType) { $res.ContentType = "application/octet-stream" }
      if ($ext -in @('.html', '.js', '.css')) {
        $res.Headers.Add("Cache-Control", "no-cache, must-revalidate")
      }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msgText = 'Not found'
      $msg = [Text.Encoding]::UTF8.GetBytes($msgText)
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
  } catch {
    $res.StatusCode = 500
  }
  $res.Close()
}
} finally {
  try { if ($listener.IsListening) { $listener.Stop() } } catch {}
  try { $listener.Close() } catch {}
  Remove-Item $PidFile -ErrorAction SilentlyContinue
}

