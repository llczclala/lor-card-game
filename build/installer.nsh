; build/installer.nsh —— electron-builder 的 NSIS 自定义脚本
; ============================================================================
; 作用：**安装时自动放行局域网入站**，让玩家一次弹窗都不用看。
;
; 为什么放在安装器里：
;   存档互传要求 PC 当服务端 ⇒ 必须有入站放行。全新安装时 Windows 会弹
;   「允许访问网络」，但玩家若点了两次「取消」，系统会永久留下两条 Block 规则，
;   之后连弹窗都不再出现 —— 表现为「手机连不上、等 8 秒超时」，玩家根本看不出原因。
;   安装器本来就是管理员权限运行的，在这里顺手加规则最干净。
;
; 配合：游戏内还有「一键放行」兜底（lan.ts 的 requestFirewallAllow），
;   覆盖热补丁升级的老玩家 / 规则被安全软件清掉的情况。
;   ⚠️ 两处的规则名必须一致，否则会重复堆规则。
;
; 2026-10-21 立：程的机器就是因为误点「取消」而永久连不上，排查了很久。
; ============================================================================

!macro customInstall
  DetailPrint "配置局域网联机防火墙规则…"
  ; 先删同名旧规则，避免重复堆叠（玩家可能装过又装）
  ExecWait 'netsh advfirewall firewall delete rule name="Snowbreak Rivals LAN Sync"'
  ; 按**程序**放行（不是按端口）—— 程序级规则与端口无关，换端口也不会失效
  ExecWait 'netsh advfirewall firewall add rule name="Snowbreak Rivals LAN Sync" dir=in action=allow program="$INSTDIR\Snowbreak Rivals.exe" enable=yes profile=private,public'
!macroend

!macro customUnInstall
  DetailPrint "清理局域网联机防火墙规则…"
  ExecWait 'netsh advfirewall firewall delete rule name="Snowbreak Rivals LAN Sync"'
!macroend
