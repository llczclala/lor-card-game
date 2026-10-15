<#
  ══════════════════════════════════════════════════════════════════════
  安卓「热更新」开发环 —— 壳只装一次，之后改代码 1~3 秒生效
  ══════════════════════════════════════════════════════════════════════
  为什么有它：
    现在的流程是「改一处 → 打包(20~80 秒) → 传到手机 → 装上 → 才能看效果」，
    等于**改一个字就要重印一整本书、再把书搬到手机上**。

  它怎么变快：
    让壳**只装这一次**，但壳里**不装内容** —— 每次打开都去你电脑上**现取**页面
    （Vite 热更新）。于是之后改代码秒级生效，**而且页面不刷新、游戏状态都在**，
    调颜色 / 调数值最舒服。

  用法（在仓库根目录，或右键「使用 PowerShell 运行」）：
      pwsh -File tools\dev-android.ps1                # 常规：起服务 + 装壳 + 启动游戏
      pwsh -File tools\dev-android.ps1 -SkipShell     # 壳已装过：只起服务 + 转发 + 启动
      pwsh -File tools\dev-android.ps1 -Port 5174     # 换端口（5173 被占时）

  ⚠️ 三件必须知道的事：
    1. 装了这个「开发壳」之后，它**每次都去 localhost:<端口> 取页面** ——
       所以**必须**先跑本脚本（或先 `npm run dev` + `adb reverse`），否则游戏白屏。
    2. 想回到「正常离线包」：直接跑 `tools\build-android.ps1 -Debug` 重装一次即可
       （它不带 CAP_DEV_SERVER 环境变量 → 会把 dev 地址从安卓工程里覆盖掉）。
    3. 雷电的 WebView 与真机**不是同一个东西** ⇒ 这里跑通 **≠** 手机没问题。
       **雷电用来快速调手感，最终仍要真机验收。**
  ══════════════════════════════════════════════════════════════════════
#>
param(
    [switch]$SkipShell,
    [int]$Port = 5173,
    [string]$Serial = '127.0.0.1:5555'
)

$ErrorActionPreference = 'Continue'
$repoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $repoRoot

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Good($msg)     { Write-Host "    OK  $msg" -ForegroundColor Green }
function Warn($msg)     { Write-Host "    !!  $msg" -ForegroundColor Yellow }
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

$adb = Join-Path $sdk 'platform-tools\adb.exe'
if (-not (Test-Path $adb)) { Fail "找不到 adb.exe：$adb（需要 Android SDK Platform-Tools）" }

Good "JAVA_HOME    = $env:JAVA_HOME"
Good "ANDROID_HOME = $sdk"
Good "adb          = $adb"

# ── ② 连接模拟器 ──────────────────────────────────────────────────────
Step '2/5' "连接模拟器（$Serial）"
Write-Host "    （雷电若没开 ADB：设置 → 其他设置 → ADB 调试 → 打开）"

& $adb start-server | Out-Null
& $adb connect $Serial 2>&1 | ForEach-Object { Write-Host "    $_" }

# 挑一个真正连上的设备：优先用户给的串号，其次任意 emulator-*
$deviceList = (& $adb devices) -split "`r?`n" | Where-Object { $_ -match '\tdevice$' }
if (-not $deviceList) { Fail "没有连上的设备。请先启动雷电，并确认它的 ADB 调试已打开。" }

$dev = $null
foreach ($line in $deviceList) {
    $sn = ($line -split '\t')[0].Trim()
    if ($sn -eq $Serial) { $dev = $sn; break }
}
if (-not $dev) {
    $dev = ($deviceList | Where-Object { $_ -match '^emulator-' } | Select-Object -First 1)
    if ($dev) { $dev = ($dev -split '\t')[0].Trim() }
}
if (-not $dev) { $dev = ($deviceList[0] -split '\t')[0].Trim() }
Good "使用设备：$dev"

# ── ③ 端口转发 + 起 dev server ────────────────────────────────────────
Step '3/5' "端口转发与开发服务器（localhost:$Port）"

# ★ 关键：用 adb reverse 而不是局域网 IP ——
#   它把**模拟器自己的** localhost:5173 直接接到**电脑的** localhost:5173，
#   不受雷电 NAT / 防火墙影响，也不用去查机器 IP。掉线重连后要重新执行（本脚本每次都会做）。
& $adb -s $dev reverse "tcp:$Port" "tcp:$Port" 2>&1 | ForEach-Object { Write-Host "    $_" }
Good "adb reverse tcp:$Port -> 电脑 $Port"

function Test-Port([int]$p) {
    try {
        $c = New-Object System.Net.Sockets.TcpClient
        $c.Connect('127.0.0.1', $p)
        $c.Close()
        return $true
    } catch { return $false }
}

if (Test-Port $Port) {
    Good "端口 $Port 已在监听 —— 复用现有的开发服务器"
} else {
    Warn "端口 $Port 没在监听，另开一个窗口启动 npm run dev"
    # 单独开一个 cmd 窗口（/k 让它别关），这样你能看到热更新日志，也能随手 Ctrl+C 停掉
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/k', "cd /d `"$repoRoot`" && npm run dev -- --port $Port"
    Write-Host "    等待开发服务器就绪..." -NoNewline
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Port $Port) { $ok = $true; break }
        Write-Host '.' -NoNewline
    }
    Write-Host ''
    if (-not $ok) { Fail "等了 60 秒开发服务器还没起来。请到那个新开的窗口看看报什么错。" }
    Good "开发服务器已就绪"
}

# ── ④ 出「开发壳」并安装（只有第一次需要）────────────────────────────
if ($SkipShell) {
    Step '4/5' '跳过出壳（-SkipShell）'
} else {
    Step '4/5' '出「开发壳」并安装（只需这一次，之后改代码就不用再来了）'

    # 让壳去 localhost 取页面（capacitor.config.ts 只在设了该变量时才写 server.url）
    $env:CAP_DEV_SERVER = "http://localhost:$Port"
    Good "CAP_DEV_SERVER = $env:CAP_DEV_SERVER"

    Write-Host "    [a] npm run build:android （约 10~30 秒）"
    npm run build:android 2>&1 | Select-Object -Last 3
    if ($LASTEXITCODE -ne 0) { Fail 'web 构建失败（npm run build:android）' }

    Write-Host "    [b] npx cap sync android   （约 0.5 秒）"
    npx cap sync android 2>&1 | Select-Object -Last 3
    if ($LASTEXITCODE -ne 0) { Fail 'cap sync 失败' }

    Write-Host "    [c] gradlew assembleDebug  （约 5~45 秒）"
    Push-Location (Join-Path $repoRoot 'android')
    $gradleOut = & '.\gradlew.bat' 'assembleDebug' --console=plain 2>&1
    $code = $LASTEXITCODE
    Pop-Location
    if ($code -ne 0) {
        Write-Host "`n──── Gradle 完整输出 ────" -ForegroundColor Yellow
        $gradleOut | ForEach-Object { Write-Host $_ }
        Write-Host "──── 输出结束 ────`n" -ForegroundColor Yellow
        Fail 'Gradle 打包失败（原因见上）'
    }
    $gradleOut | Select-Object -Last 3

    $builtApk = Join-Path $repoRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
    if (-not (Test-Path $builtApk)) { Fail "未找到产物：$builtApk" }
    $apkMB = [math]::Round((Get-Item $builtApk).Length / 1MB, 1)
    Good "APK 已生成（$apkMB MB）"

    Write-Host "    [d] 安装到 $dev"
    $installOut = & $adb -s $dev install -r $builtApk 2>&1
    $installOut | ForEach-Object { Write-Host "    $_" }
    if ($installOut -match 'Success') {
        Good '安装成功'
    } else {
        Warn '安装失败。若报 INSTALL_FAILED_UPDATE_INCOMPATIBLE / 签名不一致 ——'
        Warn '   说明这个包名之前装过**正式签名**的版本，两者签名不同，安卓不允许覆盖。'
        Warn '   解决：先卸载（⚠️ **会清掉手机/模拟器上的存档**），再重跑本脚本：'
        Warn "       & `"$adb`" -s $dev uninstall com.snowbreak.rivals.official"
        Fail '请按上面提示处理后重跑'
    }

    # 还原环境变量：避免同一个窗口里再做别的构建时被带上 dev 地址
    Remove-Item Env:\CAP_DEV_SERVER -ErrorAction SilentlyContinue
}

# ── ⑤ 启动游戏 ────────────────────────────────────────────────────────
Step '5/5' '启动游戏'
& $adb -s $dev shell am start -n 'com.snowbreak.rivals.official/.MainActivity' 2>&1 |
    ForEach-Object { Write-Host "    $_" }

$total.Stop()
Write-Host ''
Write-Host "═══ 就绪（耗时 $([math]::Round($total.Elapsed.TotalSeconds, 0)) 秒）═══" -ForegroundColor Green
Write-Host '  现在改 src/ 下任何代码，模拟器里 **1~3 秒** 就会变，而且页面不刷新。' -ForegroundColor Green
Write-Host ''
Write-Host '  常用操作：' -ForegroundColor Cyan
Write-Host '    · 只想重开游戏（不改壳） ： pwsh -File tools\dev-android.ps1 -SkipShell'
Write-Host '    · 模拟器掉线/重启后       ： 重跑本脚本（会重做端口转发）'
Write-Host '    · 要出正式离线包          ： pwsh -File tools\build-android.ps1 -Debug'
Write-Host '      （不带 CAP_DEV_SERVER ⇒ 会把 dev 地址覆盖掉，回到"内容打进包"的正常模式）'
Write-Host '    · 停止开发服务器          ： 关掉那个标题为 npm run dev 的命令行窗口'
Write-Host ''
Write-Host '  ⚠️ 提醒：雷电的 WebView 与真机不是同一个 ⇒ 这里跑通不等于手机没问题。' -ForegroundColor Yellow
Write-Host '     快速调手感用这里，**最终仍需真机验收一次**。' -ForegroundColor Yellow
