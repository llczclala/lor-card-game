/**
 * android-dev-launcher.cs — 安卓调试 · 一键启动器（《洛恩》）
 * ═══════════════════════════════════════════════════════════════════
 * 它替你做掉原来要手工做的四步：
 *   ① 找到雷电模拟器（注册表 → 常见目录），**没开就替你开**
 *   ② 等它开机完成（探 ADB 端口 → connect → 等 sys.boot_completed=1）
 *   ③ 自动判断「开发壳」装没装 ⇒ 自己决定要不要带 -SkipShell
 *        · 装了   → 几秒就绪
 *        · 没装   → 自动出壳（约 20~80 秒，只这一次）
 *   ④ 调 tools\dev-android.ps1，后面的事全部交给它
 *
 * 编译（本机只有 PS 5.1 + .NET Framework 4.x 的 csc，与 patch-launcher.cs 同源）：
 *   csc /target:exe /codepage:65001 /win32icon:..\public\favicon.ico
 *       /out:启动安卓调试.exe android-dev-launcher.cs
 *
 *   ⚠️ /codepage:65001 **不能省**：本文件是 UTF-8 **无 BOM**，不指定它 csc 会按
 *      系统代码页（中文机器 = GBK）解码 ⇒ 源码里的中文全部乱码，编译出的 exe
 *      全是乱码提示。**这和 dev-android.ps1 的「BOM 被剥」是同一类病**，
 *      只是换了编译器（那个是"没 BOM"、这个是"没 /codepage"）。
 *
 *   ⚠️ 改完 .cs 必须**重新编译**才生效（exe 是产物，不进热更新）。
 *
 * 用法：
 *   双击                                          一键起（壳在就快，壳不在自动出壳）
 *   启动安卓调试.exe --doctor                      只体检、**不启动任何东西**（排查环境用）
 *   启动安卓调试.exe --rebuild                     强制重新出壳（改了 android/ 原生层时用）
 *   启动安卓调试.exe --fast                        强制 -SkipShell（跳过"壳在不在"探测）
 *   启动安卓调试.exe --port 5174                   换开发服务器端口（5173 被占时）
 *   启动安卓调试.exe --serial 127.0.0.1:62001      指定设备串号
 *   启动安卓调试.exe --no-pause                    结束后不等按键（给脚本调用）
 *
 * ── [2026-10-16 莉莉子] 为什么要有它 ──
 *   程的原话：「启动流程我感觉还是有点繁琐了」。
 *   原来至少四步：开雷电 → 等开机 → 敲 powershell 命令 → 自己判断要不要 -SkipShell。
 *   现在一步：双击。
 *
 *   它是 dev-android.ps1 的**外壳，不是替代品** —— 真正的活（端口转发 / 起 dev server /
 *   出壳 / 装壳 / 启动游戏 / 每步复核）全在 ps1 里。所以：
 *     · ps1 改了，**本 exe 不用动**（它只是转交参数）
 *     · 唯一的耦合点是下面那两行常量（包名 + ADB 端口候选表），
 *       它们各自在 ps1 里也有一份 ⇒ **改一处必须同步另一处**（已在两处都写了交叉提醒）
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using Microsoft.Win32;

static class AndroidDevLauncher
{
    // ══ 唯一耦合点 ═══════════════════════════════════════════════════════
    // ① 开发壳包名 —— 与 dev-android.ps1 的 $pkgId 必须一致
    const string PkgId = "com.snowbreak.rivals.official";

    // ② ADB 端口候选表 —— 与 dev-android.ps1 的 $candidates 同一份。
    //    雷电**各版本 / 各实例的端口并不统一**（程 2026-10-15 实测踩过），
    //    所以"逐个探、通了才连"，绝不赌某一个。
    static readonly int[] AdbPorts = { 5555, 5554, 5556, 5557, 5559, 5561, 62001, 62025, 62026 };

    // 雷电进程名 —— 与 dev-android.ps1 的 $ldProcs 同表。
    // ⚠️ 刻意**不用** ldplayerhelper / ldplayerservice 之类：
    //    那些是常驻后台服务，模拟器**没开也在跑** ⇒ 用它们判"开没开"必然误判。
    static readonly string[] LdProcs = { "dnplayer", "dnplayer2", "LdVBoxHeadless", "Ld9BoxHeadless", "LdBoxHeadless" };

    // 找雷电的注册表键（新版在前）。安装时写的是 InstallDir。
    static readonly string[] LdRegKeys =
    {
        @"SOFTWARE\leidian\ldplayer14",
        @"SOFTWARE\leidian\ldplayer9",
        @"SOFTWARE\leidian\ldplayer",
        @"SOFTWARE\leidian\ldplayer4",
    };

    // 兜底：以上都没有时，扫这些常见目录
    static readonly string[] LdFallbackDirs =
    {
        @"C:\LDPlayer\LDPlayer14", @"D:\LDPlayer\LDPlayer14", @"E:\LDPlayer\LDPlayer14", @"F:\LDPlayer\LDPlayer14",
        @"F:\leidian\LDPlayer14",  @"D:\leidian\LDPlayer14",  @"E:\leidian\LDPlayer14",
        @"C:\LDPlayer\LDPlayer9",  @"D:\LDPlayer\LDPlayer9",  @"F:\leidian\LDPlayer9",
        @"C:\Program Files\LDPlayer\LDPlayer14", @"C:\Program Files (x86)\LDPlayer\LDPlayer14",
    };

    const int BootTimeoutSec = 240;   // 冷启动一般 20~60 秒；给到 4 分钟足够，超时就是环境问题

    static bool _doctor, _rebuild, _fast, _noPause;
    static int  _port = 5173;
    static string _serial;

    // ══ 入口 ════════════════════════════════════════════════════════════
    static int Main(string[] args)
    {
        // 与 dev-android.ps1 对齐：控制台按 UTF-8 输出，否则 adb 的中文错误会变乱码。
        // （PS 5.1 的第四个坑，程 2026-10-15 实测遇到；这里同一个道理，只是换成 C#。）
        try { Console.OutputEncoding = new UTF8Encoding(false); } catch { }

        if (!ParseArgs(args)) { PrintUsage(); return Done(2); }

        Console.WriteLine();
        Console.WriteLine("──────────────────────────────────────────────────────────");
        Console.WriteLine("   安卓调试 · 一键启动器        《洛恩》 ✧");
        Console.WriteLine("──────────────────────────────────────────────────────────");

        string repo = FindRepoRoot();
        string ldp  = FindLDPlayerDir();
        string adb  = FindAdb(ldp);
        string jdk  = FindJavaHome();

        if (_doctor) return Doctor(repo, ldp, adb, jdk);

        // ── 前置：该有的都得有，缺了就直接说清楚缺什么（别让它跑到一半才炸）──
        if (repo == null)
        {
            Err("找不到仓库根目录 —— 本 exe 需要放在 <仓库>\\tools\\ 里（它会往上找带 package.json 的那层）");
            return Done(1);
        }
        string ps1 = Path.Combine(repo, "tools", "dev-android.ps1");
        if (!File.Exists(ps1))
        {
            Err("找不到 " + ps1);
            return Done(1);
        }
        if (ldp == null)
        {
            Err("找不到雷电模拟器。若装在别处，请把它的安装目录告诉我（注册表 SOFTWARE\\leidian\\ldplayer* 也没读到）");
            return Done(1);
        }
        if (adb == null)
        {
            Err("找不到 adb.exe —— 需要 Android SDK Platform-Tools（默认找 %ANDROID_HOME%\\platform-tools\\adb.exe）");
            return Done(1);
        }

        // ── 1/4 环境 ───────────────────────────────────────────────────
        Step("1/4", "环境");
        Ok("仓库   " + repo);
        Ok("雷电   " + ldp);
        Ok("adb    " + adb);
        if (jdk != null) Ok("JDK    " + jdk);
        else Warn("没找到 JDK（JAVA_HOME 指向的 bin\\java.exe 不存在）—— 只有「出壳」那步会用到它");

        // ── 2/4 启动雷电 ───────────────────────────────────────────────
        Step("2/4", "启动雷电模拟器");
        EnsureLDPlayer(ldp);

        // ── 3/4 等开机 ────────────────────────────────────────────────
        Step("3/4", "等待模拟器开机完成");
        bool? adbOn = GetAdbDebugState(ldp);
        if (adbOn == false)
        {
            Warn("雷电配置里【ADB 调试】是关闭的 —— 多半连不上。");
            Warn("  请到雷电里： 设置 → 其他设置 → ADB 调试 → 开启  →【重启模拟器】");
            Warn("  （下面仍会尝试 4 分钟：配置文件可能是旧的，实际已开）");
        }
        else if (adbOn == true)
        {
            Ok("雷电配置：ADB 调试 已开启");
        }
        Console.WriteLine("    冷启动一般 20~60 秒；若雷电本来就在运行，几乎立刻返回。");
        Console.Write("    等待中");
        string dev = WaitForReady(adb);
        if (dev == null)
        {
            Console.WriteLine();
            Err("等了 " + BootTimeoutSec + " 秒还是连不上模拟器。按顺序查：");
            Console.WriteLine("      1) 雷电**真的在运行**（不是只开着多开器 dnmultiplayer）");
            Console.WriteLine("      2) 雷电里： 设置 → 其他设置 →【ADB 调试 → 开启】→ **重启模拟器**");
            Console.WriteLine("         （不少版本不重启不生效 —— 这是最常见的坑）");
            Console.WriteLine("      3) 看它到底开在哪个端口：到雷电安装目录跑它自带的 adb devices");
            Console.WriteLine("           cd /d \"" + ldp + "\" && adb devices");
            Console.WriteLine("         看到例如 127.0.0.1:62001 就回来指定：");
            Console.WriteLine("           启动安卓调试.exe --serial 127.0.0.1:62001");
            return Done(1);
        }
        Ok("设备已就绪：" + dev);

        // ── 4/4 交接 ──────────────────────────────────────────────────
        Step("4/4", "交接给 tools\\dev-android.ps1");

        bool skipShell;
        if (_fast)
        {
            skipShell = true;
            Console.WriteLine("    你指定了 --fast ⇒ 直接走 -SkipShell（壳不在的话 ps1 会明确报错）");
        }
        else if (_rebuild)
        {
            skipShell = false;
            Console.WriteLine("    你指定了 --rebuild ⇒ 强制重新出壳（约 20~80 秒）");
        }
        else
        {
            Console.Write("    查「开发壳」装没装 ... ");
            skipShell = IsShellInstalled(adb, dev);
            Console.WriteLine(skipShell ? "在 ⇒ 走快路（不用出壳）" : "不在 ⇒ 这次要出壳（约 20~80 秒，只这一次）");
        }

        string psArgs = "-NoProfile -ExecutionPolicy Bypass -File \"" + ps1 + "\""
                      + " -Port " + _port;
        if (!string.IsNullOrEmpty(_serial)) psArgs += " -Serial " + _serial;
        else                                psArgs += " -Serial " + dev;
        if (skipShell)                      psArgs += " -SkipShell";

        var psi = new ProcessStartInfo(
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), @"WindowsPowerShell\v1.0\powershell.exe"),
            psArgs);
        psi.UseShellExecute = false;          // false ⇒ 子进程**继承本窗口**，ps1 的彩色进度能直接看到
        psi.WorkingDirectory = repo;

        int exit = 1;
        try
        {
            using (Process p = Process.Start(psi))
            {
                p.WaitForExit();
                exit = p.ExitCode;
            }
        }
        catch (Exception e)
        {
            Err("启动 powershell 失败：" + e.Message);
            return Done(1);
        }

        Console.WriteLine();
        if (exit == 0)
            Console.WriteLine("  ✧ 一切就绪 —— 去【雷电那个窗口】玩就行（用鼠标当手指）。");
        else
            Console.WriteLine("  !! dev-android.ps1 以退出码 " + exit + " 结束 —— 上面的红字就是原因。");
        Console.WriteLine("     本窗口可以关了；开发服务器在另一个标题为「npm run dev」的窗口里，**那个别关**。");

        return Done(exit);
    }

    // ══ 参数 ════════════════════════════════════════════════════════════
    static bool ParseArgs(string[] a)
    {
        for (int i = 0; i < a.Length; i++)
        {
            string s = a[i].ToLowerInvariant();
            switch (s)
            {
                case "--doctor": case "-doctor":                 _doctor  = true; break;
                case "--rebuild": case "-rebuild":               _rebuild = true; break;
                case "--fast": case "--skip-shell": case "-fast":_fast    = true; break;
                case "--no-pause": case "-no-pause":             _noPause = true; break;
                case "--help": case "-h": case "/?":             return false;
                case "--port": case "-port":
                    if (i + 1 >= a.Length || !int.TryParse(a[++i], out _port)) { Err("--port 后面要跟一个端口号"); return false; }
                    break;
                case "--serial": case "-serial":
                    if (i + 1 >= a.Length) { Err("--serial 后面要跟设备串号"); return false; }
                    _serial = a[++i];
                    break;
                default:
                    Err("不认识的参数：" + a[i]);
                    return false;
            }
        }
        if (_rebuild && _fast) { Err("--rebuild 与 --fast 互相矛盾，只能给一个"); return false; }
        return true;
    }

    static void PrintUsage()
    {
        Console.WriteLine();
        Console.WriteLine("  用法：启动安卓调试.exe [选项]");
        Console.WriteLine("        双击                                   一键起（推荐）");
        Console.WriteLine("        --doctor                               只体检、不启动任何东西");
        Console.WriteLine("        --rebuild                              强制重新出壳");
        Console.WriteLine("        --fast                                 强制 -SkipShell");
        Console.WriteLine("        --port <5174>                          换开发服务器端口");
        Console.WriteLine("        --serial <127.0.0.1:62001>             指定设备串号");
        Console.WriteLine("        --no-pause                             结束后不等按键");
        Console.WriteLine();
    }

    // ══ 找东西 ══════════════════════════════════════════════════════════
    // 本 exe 在 <仓库>\tools\ 下 ⇒ 往上找到同时有 package.json 和 tools\dev-android.ps1 的那层。
    // （做成"往上找"而不是"取父目录"，是为了万一被放到仓库根或更深一层也照样能用。）
    static string FindRepoRoot()
    {
        string dir;
        try { dir = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location); }
        catch { return null; }
        for (int i = 0; i < 4 && !string.IsNullOrEmpty(dir); i++)
        {
            if (File.Exists(Path.Combine(dir, "package.json")) &&
                File.Exists(Path.Combine(dir, "tools", "dev-android.ps1")))
                return dir;
            dir = Path.GetDirectoryName(dir);
        }
        return null;
    }

    // 顺序：注册表（雷电自己写的 InstallDir，最权威）→ 已在运行的进程路径 → 常见目录
    static string FindLDPlayerDir()
    {
        // ① 注册表（HKLM 优先，HKCU 兜底；雷电两处都写）
        foreach (string key in LdRegKeys)
        {
            string d = ReadLdInstallDir(Registry.LocalMachine, key);
            if (d == null) d = ReadLdInstallDir(Registry.CurrentUser, key);
            if (d != null) return d;
        }

        // ② 已经在跑 ⇒ 直接从进程拿到它到底从哪启动的（最不会错）
        foreach (string n in LdProcs)
        {
            try
            {
                foreach (Process p in Process.GetProcessesByName(n))
                {
                    try
                    {
                        string f = p.MainModule.FileName;
                        if (!string.IsNullOrEmpty(f) && File.Exists(Path.Combine(Path.GetDirectoryName(f), "dnplayer.exe")))
                            return Path.GetDirectoryName(f);
                    }
                    catch { }   // 32/64 位或权限问题读不到 MainModule ⇒ 跳过，不是错误
                }
            }
            catch { }
        }

        // ③ 常见目录
        foreach (string d in LdFallbackDirs)
            if (File.Exists(Path.Combine(d, "dnplayer.exe"))) return d;

        return null;
    }

    static string ReadLdInstallDir(RegistryKey root, string subKey)
    {
        try
        {
            using (RegistryKey k = root.OpenSubKey(subKey))
            {
                if (k == null) return null;
                object v = k.GetValue("InstallDir");
                if (v == null) return null;
                string d = v.ToString().TrimEnd('\\');
                if (File.Exists(Path.Combine(d, "dnplayer.exe"))) return d;
            }
        }
        catch { }
        return null;
    }

    // adb 必须与 dev-android.ps1 用的是**同一个**（它固定用 SDK 的 platform-tools）
    // —— 否则会出现"雷电自带的 adb 与 SDK 的 adb 版本打架"那类怪事。
    static string FindAdb(string ldDir)
    {
        var cands = new List<string>();
        string sdk = Environment.GetEnvironmentVariable("ANDROID_HOME");
        if (string.IsNullOrEmpty(sdk)) sdk = Environment.GetEnvironmentVariable("ANDROID_SDK_ROOT");
        if (!string.IsNullOrEmpty(sdk)) cands.Add(Path.Combine(sdk, "platform-tools", "adb.exe"));
        cands.Add(@"D:\Android\Sdk\platform-tools\adb.exe");
        cands.Add(@"C:\Android\Sdk\platform-tools\adb.exe");
        if (!string.IsNullOrEmpty(ldDir)) cands.Add(Path.Combine(ldDir, "adb.exe"));   // 兜底：雷电自带的

        foreach (string c in cands) if (File.Exists(c)) return c;
        return null;
    }

    static string FindJavaHome()
    {
        string jh = Environment.GetEnvironmentVariable("JAVA_HOME");
        if (!string.IsNullOrEmpty(jh) && File.Exists(Path.Combine(jh, "bin", "java.exe"))) return jh;
        string alt = @"D:\Java\jdk-21.0.11";   // dev-android.ps1 里的默认值
        if (File.Exists(Path.Combine(alt, "bin", "java.exe"))) return alt;
        return null;
    }

    // ══ 雷电 ════════════════════════════════════════════════════════════
    static bool IsLDPlayerRunning()
    {
        foreach (string n in LdProcs)
        {
            try { if (Process.GetProcessesByName(n).Length > 0) return true; }
            catch { }
        }
        return false;
    }

    static void EnsureLDPlayer(string ldDir)
    {
        if (IsLDPlayerRunning())
        {
            Ok("雷电已经在运行 —— 跳过启动");
            return;
        }
        string exe = Path.Combine(ldDir, "dnplayer.exe");
        try
        {
            // UseShellExecute = true：dnplayer 是个 GUI 程序，交给 Shell 起最稳
            // （它自己要拉 vbox 驱动、可能带 manifested 权限，Shell 启动路径与双击桌面图标一致）
            Process.Start(new ProcessStartInfo(exe) { WorkingDirectory = ldDir, UseShellExecute = true });
            Ok("已拉起 " + exe + "（相当于你双击了雷电的桌面图标）");
        }
        catch (Exception e)
        {
            Err("启动雷电失败：" + e.Message);
        }
    }

    // 读雷电实例配置里的【ADB 调试】开关。
    // 返回 true=开 / false=关 / null=读不到（就别说，免得误导）。
    // ⚠️ 这只是**提前提醒**用的：真判定一律以"端口通不通"为准 —— 配置文件可能是旧的
    //    （改了设置但没重启模拟器时，文件与实际行为就不一致）。
    static bool? GetAdbDebugState(string ldDir)
    {
        try
        {
            string cfgDir = Path.Combine(ldDir, "vms", "config");
            if (!Directory.Exists(cfgDir)) return null;
            string[] files = Directory.GetFiles(cfgDir, "leidian*.config");
            bool any = false, on = false;
            foreach (string f in files)
            {
                string txt;
                try { txt = File.ReadAllText(f, Encoding.UTF8); } catch { continue; }
                int i = txt.IndexOf("\"basicSettings.adbDebug\"");
                if (i < 0) continue;
                int colon = txt.IndexOf(':', i);
                if (colon < 0) continue;
                string tail = txt.Substring(colon + 1, Math.Min(8, txt.Length - colon - 1)).Trim();
                any = true;
                if (tail.StartsWith("1")) on = true;
            }
            if (!any) return null;
            return on;
        }
        catch { return null; }
    }

    // ══ 等开机 ══════════════════════════════════════════════════════════
    // 一次循环做三件事，直到"某台设备的 sys.boot_completed == 1"：
    //   ① 看 adb devices 里有没有 state=device 的
    //   ② 没有 ⇒ 逐个探候选端口，通了就 connect（**不赌单个端口**）
    //   ③ 拿到设备后问它开机完成没（只看"端口开了"是不够的：那时系统还在起，
    //      装壳/启动游戏会失败 —— 这正是原来那种"假成功"的来源）
    static string WaitForReady(string adb)
    {
        var sw = Stopwatch.StartNew();
        int lastTick = -1;
        while (sw.Elapsed.TotalSeconds < BootTimeoutSec)
        {
            List<string> serials = AdbDeviceSerials(adb);

            if (serials.Count == 0)
            {
                foreach (int p in AdbPorts)
                {
                    if (!TcpOpen("127.0.0.1", p, 250)) continue;
                    RunCapture(adb, "connect 127.0.0.1:" + p);
                    serials = AdbDeviceSerials(adb);
                    break;
                }
            }

            foreach (string s in serials)
            {
                if (GetProp(adb, s, "sys.boot_completed") == "1")
                {
                    Console.WriteLine("  （" + (int)sw.Elapsed.TotalSeconds + " 秒）");
                    return s;
                }
            }

            int tick = (int)sw.Elapsed.TotalSeconds / 10;
            if (tick != lastTick) { lastTick = tick; Console.Write("·"); }
            Thread.Sleep(2000);
        }
        return null;
    }

    static List<string> AdbDeviceSerials(string adb)
    {
        var list = new List<string>();
        string outp = RunCapture(adb, "devices");
        foreach (string raw in outp.Split('\n'))
        {
            string line = raw.Trim('\r', ' ', '\t');
            if (line.Length == 0 || line.StartsWith("List of devices")) continue;
            // 形如 "127.0.0.1:5555\tdevice"
            string[] parts = line.Split('\t');
            if (parts.Length >= 2 && parts[1].Trim() == "device") list.Add(parts[0].Trim());
        }
        return list;
    }

    static string GetProp(string adb, string serial, string key)
    {
        return RunCapture(adb, "-s " + serial + " shell getprop " + key, 20000).Trim();
    }

    static bool IsShellInstalled(string adb, string serial)
    {
        string outp = RunCapture(adb, "-s " + serial + " shell pm list packages", 40000);
        return outp.IndexOf(PkgId, StringComparison.OrdinalIgnoreCase) >= 0;
    }

    static bool TcpOpen(string host, int port, int timeoutMs)
    {
        try
        {
            var sock = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
            IAsyncResult ar = sock.BeginConnect(host, port, null, null);
            bool ok = ar.AsyncWaitHandle.WaitOne(timeoutMs);
            if (ok) { try { sock.EndConnect(ar); } catch { ok = false; } }
            sock.Close();
            return ok;
        }
        catch { return false; }
    }

    static string RunCapture(string exe, string args)
    {
        return RunCapture(exe, args, 30000);
    }

    static string RunCapture(string exe, string args, int timeoutMs)
    {
        try
        {
            var psi = new ProcessStartInfo(exe, args);
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = Encoding.UTF8;   // adb 输出是 UTF-8（PS 5.1 那个坑的同款）
            psi.StandardErrorEncoding = Encoding.UTF8;
            using (Process p = Process.Start(psi))
            {
                string o = p.StandardOutput.ReadToEnd();
                p.StandardError.ReadToEnd();
                if (!p.WaitForExit(timeoutMs)) { try { p.Kill(); } catch { } return ""; }
                return o;
            }
        }
        catch { return ""; }
    }

    // ══ 体检（--doctor）：只读，不启动雷电、不起服务、不碰游戏 ═══════════
    static int Doctor(string repo, string ldp, string adb, string jdk)
    {
        Console.WriteLine();
        Console.WriteLine("  ── 体检（不启动任何东西）──");
        Console.WriteLine();
        Console.WriteLine("  仓库根目录   " + (repo == null ? "❌ 没找到（exe 该放在 <仓库>\\tools\\ 下）" : repo));
        if (repo != null)
        {
            string ps1 = Path.Combine(repo, "tools", "dev-android.ps1");
            Console.WriteLine("  dev-android  " + (File.Exists(ps1) ? "✅ " + ps1 : "❌ 缺失 " + ps1));
        }
        Console.WriteLine("  雷电模拟器   " + (ldp == null ? "❌ 没找到（注册表 SOFTWARE\\leidian\\ldplayer* 也没读到）" : ldp));
        if (ldp != null)
        {
            Console.WriteLine("    dnplayer   " + (File.Exists(Path.Combine(ldp, "dnplayer.exe")) ? "✅ 在" : "❌ 不在"));
            bool? on = GetAdbDebugState(ldp);
            Console.WriteLine("    ADB 调试   " + (on == true ? "✅ 已开启"
                                                    : on == false ? "⚠ 配置显示关闭（去雷电里开启后**重启模拟器**）"
                                                                  : "？ 读不到配置"));
            Console.WriteLine("    当前状态   " + (IsLDPlayerRunning() ? "正在运行" : "没在运行（启动器会替你开）"));
        }
        Console.WriteLine("  adb          " + (adb == null ? "❌ 没找到（需要 Android SDK Platform-Tools）" : adb));
        Console.WriteLine("  JDK          " + (jdk == null ? "❌ 没找到（只有「出壳」那步要用；出壳前先把 JAVA_HOME 弄对）" : jdk));
        Console.WriteLine("  ANDROID_HOME " + (Environment.GetEnvironmentVariable("ANDROID_HOME") == null ? "(空)" : Environment.GetEnvironmentVariable("ANDROID_HOME")));
        Console.WriteLine("  JAVA_HOME    " + (Environment.GetEnvironmentVariable("JAVA_HOME") == null ? "(空)" : Environment.GetEnvironmentVariable("JAVA_HOME")));
        Console.WriteLine("  " + _port + " 已监听  " + (TcpOpen("127.0.0.1", _port, 400) ? "是（启动器会复用它）" : "否（启动器会新起一个）"));
        Console.WriteLine();
        Console.WriteLine("  体检完不改任何东西。要真启动，直接双击（不带 --doctor）。");
        return Done(0);
    }

    // ══ 输出小工具 ══════════════════════════════════════════════════════
    static void Step(string n, string msg) { Console.WriteLine(); Console.WriteLine("[" + n + "] " + msg); }
    static void Ok(string msg)   { Console.WriteLine("    OK  " + msg); }
    static void Warn(string msg) { Console.WriteLine("    !!  " + msg); }
    static void Err(string msg)  { Console.WriteLine(); Console.WriteLine("  [X] " + msg); }

    // 双击启动时，这个控制台是 Windows 专门为我们新建的（挂在它上面的进程只有自己）
    // ⇒ 结束时停住，让程能看清结果。
    // 在已经开着的命令行里跑（比如脚本调用）时，进程数 > 1 ⇒ 不停，免得把脚本挂住。
    [System.Runtime.InteropServices.DllImport("kernel32.dll", SetLastError = true)]
    static extern uint GetConsoleProcessList(uint[] processList, uint count);

    static bool OwnsConsole()
    {
        try
        {
            var buf = new uint[8];
            uint n = GetConsoleProcessList(buf, (uint)buf.Length);
            return n <= 1;
        }
        catch { return true; }
    }

    static int Done(int code)
    {
        if (!_noPause && OwnsConsole())
        {
            Console.WriteLine();
            Console.Write("  按任意键关闭本窗口 ...");
            try { Console.ReadKey(true); } catch { }
            Console.WriteLine();
        }
        return code;
    }
}
