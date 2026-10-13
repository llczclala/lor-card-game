<#
  一键出安卓安装包
  ══════════════════════════════════════════════════════════════════════
  用法（在仓库根目录，或直接右键"使用 PowerShell 运行"）：

      pwsh -File tools\build-android.ps1              # 正式签名版 —— 发版用这个
      pwsh -File tools\build-android.ps1 -Debug       # 调试版（debug 签名，自测用）
      pwsh -File tools\build-android.ps1 -SkipWeb     # 跳过 web 构建（dist-android 已最新时）

  它做的事：
      ① 环境检查（JAVA_HOME / ANDROID_HOME）
      ② npm run build:android   → dist-android/        （约 10~30 秒）
      ③ npx cap sync android    → 拷进安卓工程          （约 0.5 秒）
      ④ gradlew assemble<variant> → APK                （首次 1~2 分钟；之后 5~45 秒）
      ⑤ 复制到 release/ 并打印 SHA256 与签名指纹

  产物：release/SnowbreakRivals-Android-v<版本>-<release|debug>.apk
  ══════════════════════════════════════════════════════════════════════
#>
param(
    [switch]$Debug,
    [switch]$SkipWeb
)

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

$variant = if ($Debug) { 'debug' } else { 'release' }
$variantCap = $variant.Substring(0, 1).ToUpper() + $variant.Substring(1)

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Good($msg)     { Write-Host "    OK  $msg" -ForegroundColor Green }
function Fail($msg)     { Write-Host "`n  [X] $msg" -ForegroundColor Red; exit 1 }

$total = [System.Diagnostics.Stopwatch]::StartNew()

# ── ① 环境检查 ────────────────────────────────────────────────────────
Step '1/5' '环境检查'

$env:JAVA_HOME = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { 'D:\Java\jdk-21.0.11' }
if (-not (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
    Fail "JAVA_HOME 无效：$env:JAVA_HOME（需要 JDK 17+，本项目用 JDK 21）"
}

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME }
       elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT }
       else { 'D:\Android\Sdk' }
if (-not (Test-Path $sdk)) { Fail "找不到 Android SDK：$sdk" }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

if (-not (Test-Path (Join-Path $repoRoot 'capacitor.config.ts'))) {
    Fail 'capacitor.config.ts 不存在 —— 这个仓库还没接入 Capacitor 安卓工程？'
}

$pkgPath = Join-Path $repoRoot 'package.json'
$version = (([System.IO.File]::ReadAllText($pkgPath, [System.Text.Encoding]::UTF8)) | ConvertFrom-Json).version

Good "JAVA_HOME    = $env:JAVA_HOME"
Good "ANDROID_HOME = $sdk"
Good "版本号       = $version"
Good "构建类型     = $variant"

# ── ② web 产物 ────────────────────────────────────────────────────────
if ($SkipWeb) {
    Step '2/5' '跳过 web 构建（-SkipWeb）'
    if (-not (Test-Path (Join-Path $repoRoot 'dist-android'))) {
        Fail 'dist-android 不存在，不能跳过 web 构建'
    }
} else {
    Step '2/5' '构建安卓专用 web 产物（无混淆 → dist-android/）'
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    npm run build:android 2>&1 | Select-Object -Last 5
    $sw.Stop()
    if ($LASTEXITCODE -ne 0) { Fail 'web 构建失败（npm run build:android）' }
    Good "用时 $([math]::Round($sw.Elapsed.TotalSeconds,1)) 秒"
}

$distAndroid = Join-Path $repoRoot 'dist-android'
if (-not (Test-Path $distAndroid)) { Fail 'dist-android 不存在' }
$distSize = (Get-ChildItem $distAndroid -Recurse -File | Measure-Object Length -Sum).Sum
Good "dist-android = $([math]::Round($distSize / 1MB, 1)) MB"

# ── ③ cap sync ────────────────────────────────────────────────────────
Step '3/5' '同步进安卓工程（npx cap sync android）'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
npx cap sync android 2>&1 | Select-Object -Last 4
$sw.Stop()
if ($LASTEXITCODE -ne 0) { Fail 'cap sync 失败' }
Good "用时 $([math]::Round($sw.Elapsed.TotalSeconds,1)) 秒"

# ── ④ Gradle 打包 ────────────────────────────────────────────────────
Step "4/5" "打包 APK（gradlew assemble$variantCap）"
$sw = [System.Diagnostics.Stopwatch]::StartNew()
Push-Location (Join-Path $repoRoot 'android')
& '.\gradlew.bat' "assemble$variantCap" --console=plain 2>&1 |
    Select-Object -Last 6
$code = $LASTEXITCODE
Pop-Location
$sw.Stop()
if ($code -ne 0) {
    Fail "Gradle 打包失败。提示：若报签名相关错误，先跑 tools\create-keystore.ps1"
}
Good "用时 $([math]::Round($sw.Elapsed.TotalSeconds,1)) 秒"

# ── ⑤ 产物归置 + 校验 ────────────────────────────────────────────────
Step '5/5' '产物归置与校验'

$builtApk = Join-Path $repoRoot "android\app\build\outputs\apk\$variant\app-$variant.apk"
if (-not (Test-Path $builtApk)) { Fail "未找到产物：$builtApk" }

$releaseDir = Join-Path $repoRoot 'release'
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
$outApk = Join-Path $releaseDir "SnowbreakRivals-Android-v$version-$variant.apk"
Copy-Item $builtApk $outApk -Force

$fi = Get-Item $outApk
Good "产物 : $($outApk.Replace($repoRoot + '\', ''))"
Good "大小 : $([math]::Round($fi.Length / 1MB, 1)) MB"
Good "SHA256: $((Get-FileHash $outApk -Algorithm SHA256).Hash)"

# 签名指纹（用来核对"是不是同一把钥匙"）
$bt = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory -ErrorAction SilentlyContinue |
      Sort-Object { [version]($_.Name -replace '[^0-9.]', '') } -ErrorAction SilentlyContinue |
      Select-Object -Last 1
if ($bt) {
    $signer = & (Join-Path $bt.FullName 'apksigner.bat') verify --print-certs $outApk 2>&1 |
              Select-String 'SHA-256 digest' | Select-Object -First 1
    if ($signer) { Good ("签名 : " + ($signer.ToString().Trim())) }
    $aligned = & (Join-Path $bt.FullName 'zipalign.exe') -c 4 $outApk 2>&1
    if ($LASTEXITCODE -eq 0) { Good '对齐 : zipalign 通过' } else { Write-Host '    !! zipalign 未通过' -ForegroundColor Yellow }
}

$total.Stop()
Write-Host ''
Write-Host "═══ 完成，总耗时 $([math]::Round($total.Elapsed.TotalSeconds, 0)) 秒 ═══" -ForegroundColor Green
Write-Host "  可直接分发：$($outApk.Replace($repoRoot + '\', ''))" -ForegroundColor Green
