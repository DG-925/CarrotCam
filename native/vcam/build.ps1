# Builds the CarrotCam virtual camera for x64 and x86 and copies the DLLs into
# desktop/resources/vcam so the desktop app can bundle them.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$out = Join-Path $root '..\..\desktop\resources\vcam'

# Pick the newest Visual Studio that has the C++ toolset installed.
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vsVersion = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationVersion
$generator = switch -Regex ($vsVersion) {
    '^18\.' { 'Visual Studio 18 2026' }
    '^17\.' { 'Visual Studio 17 2022' }
    default { 'Visual Studio 16 2019' }
}
Write-Host "Using generator: $generator"

foreach ($arch in @(@{ name = 'x64'; cmake = 'x64' }, @{ name = 'x86'; cmake = 'Win32' })) {
    $build = Join-Path $root "build\$($arch.name)"
    cmake -S $root -B $build -G $generator -A $arch.cmake
    if ($LASTEXITCODE) { throw "cmake configure failed ($($arch.name))" }
    cmake --build $build --config Release --parallel
    if ($LASTEXITCODE) { throw "cmake build failed ($($arch.name))" }
    $dest = Join-Path $out $arch.name
    New-Item -ItemType Directory -Force $dest | Out-Null
    Copy-Item (Join-Path $build 'Release\CarrotCamVCam.dll') $dest -Force
}
Write-Host "Virtual camera built -> $out"
