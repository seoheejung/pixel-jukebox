[CmdletBinding()]
param(
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$installerRoot = Join-Path $repoRoot 'installer'
$releaseRoot = Join-Path $repoRoot 'release'
$distRoot = Join-Path $repoRoot 'dist'
$extensionManifestPath = Join-Path $repoRoot 'public\manifest.json'
$bridgeConfigPath = Join-Path $repoRoot 'bridge.config.local.json'
$installerBridgeConfigPath = Join-Path $installerRoot 'bridge.config.json'
$sourcePath = Join-Path $installerRoot 'PixelJukeboxSetup.cs'
$manifestPath = Join-Path $installerRoot 'app.manifest'
$sitePath = Join-Path $repoRoot 'player-bridge\index.html'
$readmePath = Join-Path $repoRoot 'README.md'

function Update-ChecksumText {
    param(
        [string]$Path,
        [string]$Pattern,
        [string]$Replacement
    )

    $content = [System.IO.File]::ReadAllText($Path)
    $regex = [System.Text.RegularExpressions.Regex]::new($Pattern)
    if ($regex.Matches($content).Count -ne 1) {
        throw "Expected one installer checksum marker in $Path."
    }

    $updated = $regex.Replace($content, $Replacement, 1)
    [System.IO.File]::WriteAllText($Path, $updated, [System.Text.UTF8Encoding]::new($false))
}

function Update-InstallerFilenameText {
    param(
        [string]$Path,
        [string]$Filename
    )

    $content = [System.IO.File]::ReadAllText($Path)
    $updated = [System.Text.RegularExpressions.Regex]::Replace(
        $content,
        'PixelJukebox-Setup(?:-[0-9]+\.[0-9]+\.[0-9]+)?\.exe',
        $Filename
    )
    [System.IO.File]::WriteAllText($Path, $updated, [System.Text.UTF8Encoding]::new($false))
}

$extensionVersion = (Get-Content -LiteralPath $extensionManifestPath -Raw | ConvertFrom-Json).version
if ($extensionVersion -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
    throw "Extension manifest version must use semantic versioning: $extensionVersion"
}
$installerFilename = "PixelJukebox-Setup-$extensionVersion.exe"

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $releaseRoot $installerFilename
}

$OutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$hadBridgeConfig = Test-Path -LiteralPath $bridgeConfigPath
$previousBridgeConfig = if ($hadBridgeConfig) { [System.IO.File]::ReadAllBytes($bridgeConfigPath) } else { $null }
$workRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('pixel-jukebox-installer-' + [guid]::NewGuid().ToString('N'))
$payloadPath = Join-Path $workRoot 'extension.zip'

try {
    New-Item -ItemType Directory -Path $workRoot -Force | Out-Null
    New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null

    [System.IO.File]::WriteAllBytes(
        $bridgeConfigPath,
        [System.IO.File]::ReadAllBytes($installerBridgeConfigPath)
    )

    Push-Location $repoRoot
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) {
            throw "Extension build failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path -LiteralPath (Join-Path $distRoot 'manifest.json'))) {
        throw 'Built Extension is missing dist/manifest.json.'
    }

    Compress-Archive -Path (Join-Path $distRoot '*') -DestinationPath $payloadPath -CompressionLevel Optimal

    $compilerCandidates = @(
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
        (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
    )
    $compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $compiler) {
        throw 'Windows .NET Framework C# compiler was not found.'
    }

    $compilerArguments = @(
        '/nologo',
        '/target:winexe',
        '/optimize+',
        '/platform:anycpu',
        '/codepage:65001',
        "/out:$OutputPath",
        "/win32manifest:$manifestPath",
        "/win32icon:$installerRoot\PixelJukebox.ico",
        "/resource:$payloadPath,PixelJukebox.Extension.zip",
        '/reference:System.dll',
        '/reference:System.Core.dll',
        '/reference:System.Windows.Forms.dll',
        '/reference:System.IO.Compression.dll',
        '/reference:System.IO.Compression.FileSystem.dll',
        $sourcePath
    )

    & $compiler $compilerArguments
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $OutputPath)) {
        throw "Installer compilation failed with exit code $LASTEXITCODE."
    }

    $verification = Start-Process -FilePath $OutputPath -ArgumentList '--verify' -WindowStyle Hidden -Wait -PassThru
    if ($verification.ExitCode -ne 0) {
        throw "Installer payload verification failed with exit code $($verification.ExitCode)."
    }

    $artifact = Get-Item -LiteralPath $OutputPath
    $hash = Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256
    $checksumPath = Join-Path $artifact.DirectoryName 'SHA256SUMS.txt'
    $checksumLine = "{0}  {1}`n" -f $hash.Hash, $artifact.Name
    [System.IO.File]::WriteAllText($checksumPath, $checksumLine, [System.Text.UTF8Encoding]::new($false))
    $siteChecksum = 'SHA-256 ' + [char]0x00B7 + ' ' + $hash.Hash
    Update-ChecksumText -Path $sitePath -Pattern 'SHA-256[^A-F0-9]+[A-F0-9]{64}' -Replacement $siteChecksum
    Update-ChecksumText -Path $readmePath -Pattern 'SHA-256: `[A-F0-9]{64}`' -Replacement ('SHA-256: `' + $hash.Hash + '`')
    Update-InstallerFilenameText -Path $sitePath -Filename $artifact.Name
    Update-InstallerFilenameText -Path $readmePath -Filename $artifact.Name
    Write-Output ("Created: {0}" -f $artifact.FullName)
    Write-Output ("Size: {0} bytes" -f $artifact.Length)
    Write-Output ("SHA256: {0}" -f $hash.Hash)
}
finally {
    if ($hadBridgeConfig) {
        [System.IO.File]::WriteAllBytes($bridgeConfigPath, $previousBridgeConfig)
    }
    elseif (Test-Path -LiteralPath $bridgeConfigPath) {
        Remove-Item -LiteralPath $bridgeConfigPath -Force
    }

    if (Test-Path -LiteralPath $workRoot) {
        Remove-Item -LiteralPath $workRoot -Recurse -Force
    }
}
