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

# ── 编码（PS 5.1 的第四个坑，2026-10-15 程实测遇到）──────────────────
#   `adb` / `gradle` 的输出是 **UTF-8**，而 PS 5.1 默认按**系统代码页（中文机器 = GBK）**解码
#   子进程输出 ⇒ 中文错误全变乱码。实测：adb 那句
#   「由于目标计算机积极拒绝，无法连接。(10061)」显示成了「鐢变簬鐩爣璁＄畻鏈虹Н鏋佹嫆缁濓紝鏃犳硶杩炴帴銆?」
#   ⇒ 把控制台输出编码显式设成 UTF-8。设不上也不影响功能，所以 try 兜住。
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
try { $OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }

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
Step '2/5' '连接模拟器'
Write-Host '    （雷电没有 ADB 时：设置 → 其他设置 → ADB 调试 → 打开，然后**重启模拟器**）'

function Test-TcpPort([string]$h, [int]$p) {
    try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect($h, $p); $c.Close(); return $true }
    catch { return $false }
}

$ldProcs = @('dnplayer', 'dnplayer2', 'LdVBoxHeadless', 'Ld9BoxHeadless', 'LdBoxHeadless')
if (@(Get-Process -Name $ldProcs -ErrorAction SilentlyContinue).Count -gt 0) {
    Good '检测到雷电进程正在运行'
} else {
    Warn '没检测到雷电进程 —— 请先把雷电模拟器启动起来'
}

# [2026-10-15 程实测] 原来只赌 `127.0.0.1:5555`，而那个端口当时是关着的
#   ⇒ adb 直接回"由于目标计算机积极拒绝…(10061)"（而且还被 PS 5.1 显示成乱码）。
#   雷电各版本 / 各实例的 ADB 端口并不统一 ⇒ 改成**先探端口、通了才 connect**
#   （端口没开就别去 connect，否则只会吐一堆红字）。
$candidates = @($Serial) + @(
    '127.0.0.1:5555', '127.0.0.1:5554', '127.0.0.1:5556', '127.0.0.1:5557',
    '127.0.0.1:5559', '127.0.0.1:5561', '127.0.0.1:62001', '127.0.0.1:62025', '127.0.0.1:62026'
) | Select-Object -Unique

& $adb start-server 2>&1 | Out-Null

function Connect-FirstOpenPort {
    param([string[]]$Ports)
    foreach ($cand in $Ports) {
        $parts = $cand.Split(':')
        if ($parts.Count -ne 2) { continue }
        if (-not (Test-TcpPort $parts[0] ([int]$parts[1]))) { continue }
        $null = & $adb connect $cand 2>&1
        return $cand
    }
    return $null
}

$connected = Connect-FirstOpenPort -Ports $candidates
if ($connected) { Good "端口通则连上：$connected" }

if (-not $connected) {
    # 常见于「雷电自带的 adb server 与 Android SDK 的 adb 版本打架」——重启 adb server 再试一轮
    Warn '常见端口都不通，重启 adb server 后重试...'
    & $adb kill-server 2>&1 | Out-Null
    & $adb start-server 2>&1 | Out-Null
    $connected = Connect-FirstOpenPort -Ports $candidates
    if ($connected) { Good "重启 adb 后连上：$connected" }
}

# 以 `adb devices` 为准（雷电有时自己就注册成 emulator-5554，那种情况连 connect 都不用）
$serialList = @(
    (& $adb devices) -split "`r?`n" |
        Where-Object { $_ -match '\tdevice$' } |
        ForEach-Object { ($_ -split '\t')[0].Trim() }
)
if ($serialList.Count -eq 0) {
    Fail @"
没有连上的设备。请按顺序检查：
     1) 雷电**正在运行**（不是只开着多开器）
     2) 雷电里：设置 → 其他设置 → **ADB 调试 → 开启**，然后**重启模拟器**（不少版本要重启才生效）
     3) 若仍不行，用雷电自带的 adb 看它到底开在哪个端口：
          到雷电安装目录下执行   adb devices
        看到类似 127.0.0.1:62001 的结果时，回来这样指定：
          powershell -File tools\dev-android.ps1 -Serial 127.0.0.1:62001
"@
}

# 挑设备：优先用户指定串号 → 刚 connect 上的 → 任意 emulator-* → 第一个
$dev = $null
if ($serialList -contains $Serial) { $dev = $Serial }
if (-not $dev -and $connected -and ($serialList -contains $connected)) { $dev = $connected }
if (-not $dev) { $dev = $serialList | Where-Object { $_ -like 'emulator-*' } | Select-Object -First 1 }
if (-not $dev) { $dev = $serialList[0] }
Good "使用设备：$dev"

# ── ③ 端口转发 + 起 dev server ────────────────────────────────────────
Step '3/5' "端口转发与开发服务器（localhost:$Port）"

# ★ 关键：用 adb reverse 而不是局域网 IP ——
#   它把**模拟器自己的** localhost:5173 直接接到**电脑的** localhost:5173，
#   不受雷电 NAT / 防火墙影响，也不用去查机器 IP。掉线重连后要重新执行（本脚本每次都会做）。
& $adb -s $dev reverse "tcp:$Port" "tcp:$Port" 2>&1 | ForEach-Object { Write-Host "    $_" }
Good "adb reverse tcp:$Port -> 电脑 $Port"

# [2026-10-15 程实测] **必须显式探 IPv4** —— 这是个真坑：
#   Vite 默认绑 `localhost`，而本机（Node 17+ 用 verbatim DNS）`localhost` 解析成 `::1` 优先
#   ⇒ Vite **只监听 [::1]**（netstat 实测：`TCP [::1]:5173 LISTENING`）。
#   而 `adb reverse` 走的是 **IPv4** ⇒ 两条路都会崩：
#     ① 旧版脚本探 127.0.0.1 ⇒ 永远联不通 ⇒ 白等 60 秒（程实测就是这个）
#     ② 就算跳过等待，雷电里的 WebView 也连不上 ⇒ **白屏**
#   ⇒ 定规：**一律用 `--host 127.0.0.1` 显式绑 IPv4**；只绑了 IPv6 的旧服务器**拒绝复用**。
function Test-IPv4Port([int]$p) {
    try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $p); $c.Close(); return $true }
    catch { return $false }
}
function Test-IPv6Port([int]$p) {
    try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('::1', $p); $c.Close(); return $true }
    catch { return $false }
}

if (Test-IPv4Port $Port) {
    Good "IPv4 端口 $Port 已在监听 —— 复用现有的开发服务器"
} else {
    if (Test-IPv6Port $Port) {
        Fail @"
端口 $Port 上有一个**只绑 IPv6(::1)** 的 dev server 占着 —— 而 adb reverse 走 IPv4，连不上它。
请**关掉那个 vite / npm run dev 窗口**，然后重跑本脚本
（本脚本会用 --host 127.0.0.1 起一个绑 IPv4 的）。
"@
    }
    Warn "IPv4 端口 $Port 没在监听，另开一个窗口启动 npm run dev（--host 127.0.0.1）"
    # 单独开一个 cmd 窗口（/k 让它别关），这样你能看到热更新日志，也能随手 Ctrl+C 停掉。
    # ⚠️ `--host 127.0.0.1` 是**必须**的：不加它会绑到 IPv6 ::1，adb reverse（IPv4）连不上 ⇒ 白屏。
    # ⚠️ `--strictPort`：万一 5173 被别的程序占了，宁可**当场报错**，也不要悄悄换到 5174
    #    （那样 adb reverse 还指着 5173 ⇒ 白屏，而且很难看出原因）。
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/k', "cd /d `"$repoRoot`" && npm run dev -- --port $Port --host 127.0.0.1 --strictPort"
    Write-Host "    等待开发服务器就绪（IPv4 $Port）..." -NoNewline
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if (Test-IPv4Port $Port) { $ok = $true; break }
        Write-Host '.' -NoNewline
    }
    Write-Host ''
    if (-not $ok) {
        Fail "等了 60 秒还没等到 IPv4 $Port。请到那个新开的窗口看报什么错（若它 Listen 在 [::1] 就是 --host 没生效）。"
    }
    Good "开发服务器已就绪（IPv4）"
}

# ── ④ 出「开发壳」并安装（只有第一次需要）────────────────────────────
# [2026-10-15 程实测] **加安装校验**。原来的缺陷：只信 adb 的返回，
#   而第 ⑤ 步启动失败也照样打绿字"就绪" ⇒ 报过一次**假成功**
#   （程那次实际用了 -SkipShell，但壳从来没装过 ⇒ 白跑一趟、还找不到地方测）。
$pkgId = 'com.snowbreak.rivals.official'
function Test-AppInstalled {
    param([string]$Device)
    $list = (& $adb -s $Device shell pm list packages 2>&1) -join "`n"
    return ($list -match [regex]::Escape($pkgId))
}

if ($SkipShell) {
    Step '4/5' '跳过出壳（-SkipShell）'
    if (-not (Test-AppInstalled $dev)) {
        Fail @"
这台设备上**从来没装过开发壳** ⇒ -SkipShell 没东西可跳。
请先跑一次**不带** -SkipShell 的完整命令（它会出壳并装进雷电，约 20~80 秒）：
      powershell -File tools\dev-android.ps1
"@
    }
    Good '开发壳已在设备上'
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
    if (($installOut -match 'Success') -and (Test-AppInstalled $dev)) {
        Good '安装成功（并用 pm list packages 复核过）'
    } elseif ($installOut -match 'Success') {
        Fail 'adb 说装成功了，但设备上**查不到这个包** —— 请把上面的输出发给莉莉子'
    } else {
        Warn '安装失败。若报 INSTALL_FAILED_UPDATE_INCOMPATIBLE / 签名不一致 ——'
        Warn '   说明这个包名之前装过**正式签名**的版本，两者签名不同，安卓不允许覆盖。'
        Warn '   解决：先卸载（⚠️ **会清掉模拟器上的存档**），再重跑本脚本：'
        Warn "       & `"$adb`" -s $dev uninstall com.snowbreak.rivals.official"
        Fail '请按上面提示处理后重跑'
    }

    # 还原环境变量：避免同一个窗口里再做别的构建时被带上 dev 地址
    Remove-Item Env:\CAP_DEV_SERVER -ErrorAction SilentlyContinue
}

# ── ⑤ 启动游戏 ────────────────────────────────────────────────────────
Step '5/5' '启动游戏'
& $adb -s $dev shell am start -n "$pkgId/.MainActivity" 2>&1 |
    ForEach-Object { Write-Host "    $_" }

# [2026-10-15] **必须复核它真的到前台了** —— 否则又是一次"假成功"
Start-Sleep -Seconds 5
$focusLine = (& $adb -s $dev shell dumpsys window 2>&1 | Select-String 'mCurrentFocus' | Select-Object -First 1)
$focusText = if ($focusLine) { $focusLine.ToString().Trim() } else { '(查不到)' }
$focusOk = ($focusText -match [regex]::Escape($pkgId))
if ($focusOk) {
    Good '游戏已在前台'
} else {
    Warn "游戏好像没到前台。当前前台是：$focusText"
    Warn '  · 也可以在雷电的桌面里手动点开「尘白同人·雪境争锋」图标'
}

# 最后确认开发服务器还活着（"刚起完就被关掉"是白屏最常见的原因）
$devServerAlive = $false
try { $c = New-Object System.Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $Port); $c.Close(); $devServerAlive = $true } catch { }
$appInstalled = Test-AppInstalled $dev
$allGood = ($devServerAlive -and $appInstalled -and $focusOk)

$total.Stop()
Write-Host ''
if ($allGood) {
    Write-Host "═══ 就绪（耗时 $([math]::Round($total.Elapsed.TotalSeconds, 0)) 秒）═══" -ForegroundColor Green
} else {
    Write-Host "═══ 还没就绪（耗时 $([math]::Round($total.Elapsed.TotalSeconds, 0)) 秒）═══" -ForegroundColor Red
    if (-not $appInstalled)    { Write-Host '  !! 开发壳不在设备上 —— 跑一次不带 -SkipShell 的完整命令' -ForegroundColor Red }
    if (-not $devServerAlive)  { Write-Host "  !! 开发服务器（localhost:$Port）没在监听 —— 雷电里会白屏" -ForegroundColor Red }
    if (-not $focusOk)         { Write-Host '  !! 游戏没到前台 —— 去雷电桌面手动点开它' -ForegroundColor Red }
}
Write-Host ''
Write-Host '  ▶ 测试就在【雷电那个窗口】里 —— 它就是一台安卓手机，用鼠标当手指玩。' -ForegroundColor Cyan
Write-Host ''
Write-Host '  现在改 src/ 下任何代码，雷电里 1~3 秒就会变，而且页面不刷新。' -ForegroundColor Green
Write-Host ''
Write-Host '  常用操作：' -ForegroundColor Cyan
Write-Host '    · 只想重开游戏（壳已装好） ： powershell -File tools\dev-android.ps1 -SkipShell'
Write-Host '    · 模拟器掉线/重启后        ： 重跑本脚本（会重做端口转发）'
Write-Host '    · 要出正式离线包           ： powershell -File tools\build-android.ps1 -Debug'
Write-Host '      （不带 CAP_DEV_SERVER ⇒ 会把 dev 地址覆盖掉，回到"内容打进包"的正常模式）'
Write-Host '    · 停止开发服务器           ： 关掉那个标题为 npm run dev 的命令行窗口'
Write-Host ''
Write-Host '  ⚠️ 提醒：雷电的 WebView 与真机不是同一个 ⇒ 这里跑通不等于手机没问题。' -ForegroundColor Yellow
Write-Host '     快速调手感用这里，**最终仍需真机验收一次**。' -ForegroundColor Yellow
