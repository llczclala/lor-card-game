<#
  创建安卓 release 签名 keystore，并自动生成 android/keystore.properties

  用法（在仓库根目录）：
      pwsh -File tools\create-keystore.ps1

  密码由你现场输入 —— 不会出现在命令行里，也不会被我看到。

  为什么需要它：
      安卓只允许「同包名 + 同签名」覆盖安装。换了签名，老玩家必须卸载重装，
      而卸载会清空 localStorage → 存档全丢。
#>
param(
    [string]$Alias        = 'snowbreak',
    [string]$Dname        = 'CN=Snowbreak Rivals, OU=Game, O=Snowbreak Rivals, L=Unknown, ST=Unknown, C=CN',
    [int]   $ValidityDays = 10950
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path $PSScriptRoot -Parent
$ksDir    = Join-Path $repoRoot 'android\keystore'
$ksFile   = Join-Path $ksDir 'snowbreak-release.jks'
$propFile = Join-Path $repoRoot 'android\keystore.properties'

$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if (-not (Test-Path $keytool)) { $keytool = 'keytool' }

Write-Host ''
Write-Host '=== 安卓 release 签名 keystore 生成 ===' -ForegroundColor Cyan
Write-Host "  目标文件 : $ksFile"
Write-Host "  别名     : $Alias"
Write-Host "  有效期   : $ValidityDays 天（约 $([math]::Round($ValidityDays / 365, 0)) 年）"
Write-Host ''
Write-Host '  ⚠️ 这个密码一旦忘记、或 keystore 文件丢损，就再也无法给老版本升级。' -ForegroundColor Yellow
Write-Host '     生成后请立刻备份到网盘 + U 盘。'
Write-Host ''

New-Item -ItemType Directory -Force -Path $ksDir | Out-Null

if (Test-Path $ksFile) {
    Write-Host "❌ 已存在：$ksFile" -ForegroundColor Red
    Write-Host '   为防误覆盖，脚本中止。若确定要重建，请先手动备份并改名/移走旧文件。'
    exit 1
}

$sec = Read-Host -Prompt '请输入 keystore 密码（至少 6 位，输入时不回显）' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$pw = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

if ([string]::IsNullOrWhiteSpace($pw) -or $pw.Length -lt 6) {
    Write-Host '❌ 密码不能为空，且至少 6 位。' -ForegroundColor Red
    exit 1
}

Write-Host '正在生成 keystore ...'
& $keytool -genkeypair -v `
    -keystore $ksFile `
    -alias $Alias `
    -keyalg RSA -keysize 2048 -validity $ValidityDays `
    -storepass $pw -keypass $pw `
    -dname $Dname

if ($LASTEXITCODE -ne 0) {
    Write-Host '❌ keytool 执行失败，keystore 未生成。' -ForegroundColor Red
    exit 1
}

$prop = @"
# 安卓 release 签名 —— 本文件不进仓库（见 .gitignore）
# 由 tools/create-keystore.ps1 于 $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') 生成
storeFile=../keystore/snowbreak-release.jks
storePassword=$pw
keyAlias=$Alias
keyPassword=$pw
"@
[System.IO.File]::WriteAllText($propFile, $prop, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ''
Write-Host '✅ 完成' -ForegroundColor Green
Write-Host "   keystore   : $ksFile"
Write-Host "   properties : $propFile"
Write-Host ''
Write-Host '🔴 现在立刻做备份（这是唯一不可再生的东西）：' -ForegroundColor Yellow
Write-Host '   1. 把 android\keystore\ 整个目录复制到网盘'
Write-Host '   2. 再复制一份到 U 盘或另一台电脑'
Write-Host '   3. 密码记进密码管理器'
Write-Host ''
Write-Host '之后打包正式版：' -ForegroundColor Cyan
Write-Host '   cd android && .\gradlew.bat assembleRelease'
Write-Host '   产物：android\app\build\outputs\apk\release\app-release.apk'
