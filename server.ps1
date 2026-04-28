$port = 3000
$root = "C:\Users\HP\Desktop\AI Antigravity\DhakaCravings"
$stripeApiVersion = "2026-02-25.clover"

function Import-LocalEnv {
    param([string]$FileName)
    $envPath = Join-Path $root $FileName
    if (-not (Test-Path $envPath -PathType Leaf)) { return }
    Get-Content $envPath | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $separatorIndex = $line.IndexOf("=")
        if ($separatorIndex -lt 1) { return }
        $key = $line.Substring(0, $separatorIndex).Trim()
        $value = $line.Substring($separatorIndex + 1).Trim().Trim("'").Trim('"')
        if ($key -and -not [Environment]::GetEnvironmentVariable($key, "Process")) {
            [Environment]::SetEnvironmentVariable($key, $value, "Process")
        }
    }
}

function ConvertTo-JsonBytes {
    param([object]$Body)
    $json = $Body | ConvertTo-Json -Depth 14
    return [System.Text.Encoding]::UTF8.GetBytes($json)
}

function New-Response {
    param(
        [int]$StatusCode,
        [string]$ContentType,
        [byte[]]$Body
    )
    return @{
        StatusCode = $StatusCode
        ContentType = $ContentType
        Body = $Body
    }
}

function New-JsonResponse {
    param(
        [int]$StatusCode,
        [object]$Body
    )
    return New-Response $StatusCode "application/json; charset=utf-8" (ConvertTo-JsonBytes $Body)
}

function Write-HttpResponse {
    param(
        [System.Net.Sockets.NetworkStream]$Stream,
        [hashtable]$Response
    )
    $reason = switch ($Response.StatusCode) {
        200 { "OK" }
        201 { "Created" }
        400 { "Bad Request" }
        403 { "Forbidden" }
        404 { "Not Found" }
        501 { "Not Implemented" }
        502 { "Bad Gateway" }
        default { "Internal Server Error" }
    }
    $headers = "HTTP/1.1 $($Response.StatusCode) $reason`r`nContent-Type: $($Response.ContentType)`r`nContent-Length: $($Response.Body.Length)`r`nConnection: close`r`nAccess-Control-Allow-Origin: *`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    $Stream.Write($Response.Body, 0, $Response.Body.Length)
}

function Get-PublicConfig {
    $firebaseConfig = @{
        apiKey = $env:FIREBASE_API_KEY
        authDomain = $env:FIREBASE_AUTH_DOMAIN
        projectId = $env:FIREBASE_PROJECT_ID
        storageBucket = $env:FIREBASE_STORAGE_BUCKET
        messagingSenderId = $env:FIREBASE_MESSAGING_SENDER_ID
        appId = $env:FIREBASE_APP_ID
        measurementId = $env:FIREBASE_MEASUREMENT_ID
    }
    $firebaseConfigured = [bool]($env:FIREBASE_API_KEY -and $env:FIREBASE_PROJECT_ID -and $env:FIREBASE_APP_ID)
    return @{
        stripePublishableKey = $env:STRIPE_PUBLISHABLE_KEY
        stripeReady = [bool]$env:STRIPE_SECRET_KEY
        stripeCurrency = $(if ($env:STRIPE_CURRENCY) { $env:STRIPE_CURRENCY } else { "bdt" })
        firebaseConfigured = $firebaseConfigured
        firebaseConfig = $(if ($firebaseConfigured) { $firebaseConfig } else { $null })
    }
}

function Read-JsonBody {
    param([string]$BodyText)
    if (-not $BodyText) { return @{} }
    try {
        return $BodyText | ConvertFrom-Json
    } catch {
        return @{}
    }
}

function New-StripeCheckoutSessionResponse {
    param(
        [object]$RequestBody,
        [string]$HostHeader
    )
    if (-not $env:STRIPE_SECRET_KEY) {
        return New-JsonResponse 501 @{ error = "Stripe secret key is missing. Add STRIPE_SECRET_KEY to .env.local and restart the server." }
    }

    $items = @()
    if ($RequestBody.items) {
        foreach ($item in $RequestBody.items) {
            $price = [double]$item.price
            $qty = [int]$item.qty
            if ($price -gt 0 -and $qty -gt 0) {
                $items += @{
                    name = [string]$item.name
                    price = $price
                    qty = $qty
                    heat = [string]$item.heat
                }
            }
        }
    }
    if ($items.Count -eq 0) {
        return New-JsonResponse 400 @{ error = "Cart is empty." }
    }

    $currency = $(if ($env:STRIPE_CURRENCY) { $env:STRIPE_CURRENCY.ToLower() } else { "bdt" })
    $amountMultiplier = $(if ($env:STRIPE_AMOUNT_MULTIPLIER) { [int]$env:STRIPE_AMOUNT_MULTIPLIER } else { 100 })
    $origin = "http://localhost:$port"
    if ($HostHeader) { $origin = "http://$HostHeader" }
    $successUrl = if ($RequestBody.successUrl) { [string]$RequestBody.successUrl } else { "$origin/tracking.html?payment=stripe" }
    $cancelUrl = if ($RequestBody.cancelUrl) { [string]$RequestBody.cancelUrl } else { "$origin/checkout.html?payment_cancelled=1" }

    $form = @{
        mode = "payment"
        success_url = $successUrl
        cancel_url = $cancelUrl
        "metadata[brand]" = "Dhaka Cravings"
        "metadata[delivery_fee]" = [string]$RequestBody.deliveryFee
        "metadata[source]" = "local-powershell-server"
    }

    for ($itemIndex = 0; $itemIndex -lt $items.Count; $itemIndex++) {
        $item = $items[$itemIndex]
        $form["line_items[$itemIndex][quantity]"] = [string]$item.qty
        $form["line_items[$itemIndex][price_data][currency]"] = $currency
        $form["line_items[$itemIndex][price_data][unit_amount]"] = [string][Math]::Round($item.price * $amountMultiplier)
        $form["line_items[$itemIndex][price_data][product_data][name]"] = $item.name
        if ($item.heat) { $form["line_items[$itemIndex][price_data][product_data][metadata][heat]"] = $item.heat }
    }

    if ([double]$RequestBody.deliveryFee -gt 0) {
        $deliveryIndex = $items.Count
        $form["line_items[$deliveryIndex][quantity]"] = "1"
        $form["line_items[$deliveryIndex][price_data][currency]"] = $currency
        $form["line_items[$deliveryIndex][price_data][unit_amount]"] = [string][Math]::Round([double]$RequestBody.deliveryFee * $amountMultiplier)
        $form["line_items[$deliveryIndex][price_data][product_data][name]"] = "Mohammadpur delivery fee"
    }

    try {
        $stripeResponse = Invoke-RestMethod `
            -Uri "https://api.stripe.com/v1/checkout/sessions" `
            -Method Post `
            -Headers @{ Authorization = "Bearer $env:STRIPE_SECRET_KEY"; "Stripe-Version" = $stripeApiVersion } `
            -Body $form `
            -ContentType "application/x-www-form-urlencoded"
        return New-JsonResponse 200 $stripeResponse
    } catch {
        return New-JsonResponse 502 @{ error = "Stripe request failed: $($_.Exception.Message)" }
    }
}

function Save-LocalOrder {
    param([object]$Order)
    $ordersDir = Join-Path $root "orders"
    $ordersFile = Join-Path $ordersDir "local-orders.json"
    if (-not (Test-Path $ordersDir -PathType Container)) {
        New-Item -ItemType Directory -Path $ordersDir | Out-Null
    }
    $orders = @()
    if (Test-Path $ordersFile -PathType Leaf) {
        try {
            $orders = @(Get-Content $ordersFile -Raw | ConvertFrom-Json)
        } catch {
            $orders = @()
        }
    }
    $Order | Add-Member -NotePropertyName storedAt -NotePropertyValue ([DateTime]::UtcNow.ToString("o")) -Force
    $orders = @($Order) + $orders
    $orders | Select-Object -First 100 | ConvertTo-Json -Depth 12 | Set-Content -Path $ordersFile -Encoding UTF8
}

function Get-MimeType {
    param([string]$FilePath)
    if ($FilePath.EndsWith(".html")) { return "text/html; charset=utf-8" }
    if ($FilePath.EndsWith(".css")) { return "text/css; charset=utf-8" }
    if ($FilePath.EndsWith(".js")) { return "application/javascript; charset=utf-8" }
    if ($FilePath.EndsWith(".json")) { return "application/json; charset=utf-8" }
    if ($FilePath.EndsWith(".png")) { return "image/png" }
    if ($FilePath.EndsWith(".jpg") -or $FilePath.EndsWith(".jpeg")) { return "image/jpeg" }
    if ($FilePath.EndsWith(".svg")) { return "image/svg+xml" }
    return "application/octet-stream"
}

function Get-StaticResponse {
    param([string]$RequestPath)
    if ($RequestPath -eq "/") { $RequestPath = "/index.html" }
    $relativePath = [System.Uri]::UnescapeDataString($RequestPath).TrimStart("/").Replace("/", "\")
    $filePath = Join-Path $root $relativePath
    $resolvedRoot = [System.IO.Path]::GetFullPath($root)
    $resolvedFile = [System.IO.Path]::GetFullPath($filePath)

    if (-not $resolvedFile.StartsWith($resolvedRoot)) {
        return New-Response 403 "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("403 Forbidden"))
    }
    if (-not (Test-Path $resolvedFile -PathType Leaf)) {
        return New-Response 404 "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $RequestPath"))
    }
    return New-Response 200 (Get-MimeType $resolvedFile) ([System.IO.File]::ReadAllBytes($resolvedFile))
}

function Get-ApiResponse {
    param(
        [string]$Method,
        [string]$Path,
        [hashtable]$Headers,
        [string]$BodyText
    )
    if ($Method -eq "GET" -and $Path -eq "/api/health") {
        return New-JsonResponse 200 @{ ok = $true; name = "dhaka-cravings-local" }
    }
    if ($Method -eq "GET" -and $Path -eq "/api/config") {
        return New-JsonResponse 200 (Get-PublicConfig)
    }
    if ($Method -eq "POST" -and $Path -eq "/api/create-checkout-session") {
        return New-StripeCheckoutSessionResponse (Read-JsonBody $BodyText) $Headers["host"]
    }
    if ($Method -eq "POST" -and $Path -eq "/api/orders") {
        Save-LocalOrder (Read-JsonBody $BodyText)
        return New-JsonResponse 201 @{ ok = $true }
    }
    return New-JsonResponse 404 @{ error = "API route not found." }
}

function Read-HttpRequest {
    param([System.Net.Sockets.NetworkStream]$Stream)
    $reader = New-Object System.IO.StreamReader($Stream, [System.Text.Encoding]::UTF8, $false, 8192, $true)
    $requestLine = $reader.ReadLine()
    if (-not $requestLine) { return $null }
    $parts = $requestLine.Split(" ")
    $headers = @{}
    while ($true) {
        $line = $reader.ReadLine()
        if ($null -eq $line -or $line -eq "") { break }
        $separatorIndex = $line.IndexOf(":")
        if ($separatorIndex -gt 0) {
            $headerName = $line.Substring(0, $separatorIndex).Trim().ToLower()
            $headerValue = $line.Substring($separatorIndex + 1).Trim()
            $headers[$headerName] = $headerValue
        }
    }
    $bodyText = ""
    $contentLength = 0
    if ($headers.ContainsKey("content-length")) {
        [int]::TryParse($headers["content-length"], [ref]$contentLength) | Out-Null
    }
    if ($contentLength -gt 0) {
        $buffer = New-Object char[] $contentLength
        $readCount = $reader.ReadBlock($buffer, 0, $contentLength)
        $bodyText = -join $buffer[0..($readCount - 1)]
    }
    return @{
        Method = $parts[0]
        Target = $parts[1]
        Headers = $headers
        BodyText = $bodyText
    }
}

Import-LocalEnv ".env"
Import-LocalEnv ".env.local"

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $port)
$listener.Start()
Write-Host "Server running at http://localhost:$port/"

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $request = Read-HttpRequest $stream
            if ($null -eq $request) {
                $client.Close()
                continue
            }
            $path = $request.Target.Split("?")[0]
            Write-Host "$($request.Method) $path"
            if ($path.StartsWith("/api/")) {
                $response = Get-ApiResponse $request.Method $path $request.Headers $request.BodyText
            } else {
                $response = Get-StaticResponse $path
            }
            Write-HttpResponse $stream $response
        } catch {
            $errorResponse = New-Response 500 "text/plain; charset=utf-8" ([System.Text.Encoding]::UTF8.GetBytes("500 Internal Server Error: $($_.Exception.Message)"))
            if ($stream) { Write-HttpResponse $stream $errorResponse }
        } finally {
            $client.Close()
        }
    }
} finally {
    $listener.Stop()
}
