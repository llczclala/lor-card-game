/**
 * patch-launcher.cs — Snowbreak Rivals 补丁安装器（v2 · 一键更新）
 * ============================================================
 * 编译（⚠️ [2026-10-10] **比旧版多一个引用**，其余不变）：
 *   csc /target:winexe /reference:System.Windows.Forms.dll
 *       /reference:System.IO.Compression.FileSystem.dll
 *       /reference:System.IO.Compression.dll
 *       /out:patch-launcher.exe patch-launcher.cs
 * 打包：copy /b patch-launcher.exe + patch.zip final-patch.exe
 *
 * ── [2026-10-10 莉莉子] 为什么改回一键 ──
 *   初版**本来就是一键更新**；当时为了定位"到底卡在哪一步"才拆成 5 个模态弹窗。
 *   现在全流程已稳定 ⇒ **恢复一键**，但**分步诊断能力不丢**：
 *     · 底部**常驻日志框**（实时显示每一步），不再需要弹窗确认
 *     · 保留「**手动更新**」按钮（自己选目录），老流程一条不少
 *
 * ── 一键更新做了什么 ──
 *   ① 自动定位游戏目录（[2026-10-18 加严] 五道，按顺序，命中就用）：
 *      ⓪ **桌面 / 公共桌面 / 开始菜单的 .lnk 快捷方式**（解析 TargetPath 反查）—— 最通用
 *      ① 注册表 Uninstall 项（DisplayName 含 Snowbreak）：先 InstallLocation，再 UninstallString 反推
 *      ② 运行中的进程路径（游戏开着时最准；但安装前会要求先关游戏）
 *      ③ 常见安装位置扫描（Program Files / LocalAppData / 用户目录 / **桌面 / 下载** / 各盘根目录…）
 *      → 都找不到才退回手动选
 *   🔴 [2026-10-18] 本次加严的起因：程实测「游戏装在桌面」却自动定位失败 ——
 *      旧版 ①②③ 的候选里**根本没有桌面**，也没有快捷方式解析。缺的不是"再加一个目录"，
 *      而是"用快捷方式反查"这个通用手段（安装器默认会在桌面建快捷方式，装到哪都适用）。
 *   ② 目录校验：必须有 `Snowbreak Rivals.exe` **且** `resources\app.asar`
 *   ③ 游戏在运行 ⇒ **拒绝并提示先关闭**（否则文件占用 = 半损坏）
 *   ④ 从自身尾部提取内嵌补丁 zip（格式不变：[exe][zip][8 字节长度]）
 *   ⑤ **更新前备份 `resources\app.asar`**（旧版没有备份，中途失败游戏就半坏）
 *   ⑥ 解压补丁 → 运行 `asar-patcher.cjs`（实时日志）
 *   ⑦ 失败 ⇒ **自动还原备份**并说明原因；成功 ⇒ 可一键启动游戏
 *   ⑧ 权限不足（装在 Program Files）⇒ 明确提示"以管理员身份运行"
 */

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading;
using System.Windows.Forms;
using System.IO.Compression;
using System.Reflection;   // [2026-10-10] ExtractEmbeddedArchive 用 Assembly.GetExecutingAssembly()

class PatchLauncher
{
    [STAThread]
    static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Application.Run(new MainForm());
    }
}

/// <summary>主窗口：一键更新 / 手动更新 / 启动游戏 / 常驻日志</summary>
class MainForm : Form
{
    private const string GAME_EXE = "Snowbreak Rivals.exe";

    private TextBox txtDir;
    private Label lblStatus;
    private ProgressBar bar;
    private TextBox txtLog;
    private Button btnOneClick;
    private Button btnManual;
    private Button btnBrowse;
    private Button btnLaunch;
    private string detectedDir;   // 自动定位结果（失败为 null）
    private bool busy;

    public MainForm()
    {
        Text = "Snowbreak Rivals 补丁更新";
        ClientSize = new Size(640, 430);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;

        // ── 游戏位置 ──
        Label lblDir = new Label();
        lblDir.Text = "游戏位置：";
        lblDir.Location = new Point(15, 18);
        lblDir.Size = new Size(70, 22);

        txtDir = new TextBox();
        txtDir.Location = new Point(88, 15);
        txtDir.Size = new Size(430, 23);
        txtDir.ReadOnly = true;

        btnBrowse = new Button();
        btnBrowse.Text = "浏览…";
        btnBrowse.Location = new Point(525, 14);
        btnBrowse.Size = new Size(95, 25);
        btnBrowse.Click += new EventHandler(OnBrowse);

        // ── 状态行 ──
        lblStatus = new Label();
        lblStatus.Text = "正在自动查找游戏…";
        lblStatus.Location = new Point(15, 50);
        lblStatus.Size = new Size(605, 22);
        lblStatus.ForeColor = Color.DimGray;

        // ── 两个按钮（一键在前） ──
        btnOneClick = new Button();
        btnOneClick.Text = "⚡ 一键更新";
        btnOneClick.Location = new Point(15, 78);
        btnOneClick.Size = new Size(250, 42);
        btnOneClick.Font = new Font(Font.FontFamily, 11F, FontStyle.Bold);
        btnOneClick.Click += new EventHandler(OnOneClick);

        btnManual = new Button();
        btnManual.Text = "手动更新（自己选目录）";
        btnManual.Location = new Point(275, 78);
        btnManual.Size = new Size(250, 42);
        btnManual.Click += new EventHandler(OnManual);

        bar = new ProgressBar();
        bar.Location = new Point(15, 128);
        bar.Size = new Size(605, 18);
        bar.Style = ProgressBarStyle.Marquee;
        bar.MarqueeAnimationSpeed = 0;   // 空闲时不滚动

        // ── 常驻日志（替代原来的 5 个弹窗，诊断能力保留） ──
        txtLog = new TextBox();
        txtLog.Location = new Point(15, 154);
        txtLog.Size = new Size(605, 230);
        txtLog.Multiline = true;
        txtLog.ReadOnly = true;
        txtLog.ScrollBars = ScrollBars.Vertical;
        txtLog.Font = new Font("Consolas", 9F);
        txtLog.BackColor = Color.Black;
        txtLog.ForeColor = Color.LightGreen;

        btnLaunch = new Button();
        btnLaunch.Text = "启动游戏";
        btnLaunch.Location = new Point(15, 392);
        btnLaunch.Size = new Size(200, 28);
        btnLaunch.Enabled = false;
        btnLaunch.Click += new EventHandler(OnLaunch);

        Controls.Add(lblDir);
        Controls.Add(txtDir);
        Controls.Add(btnBrowse);
        Controls.Add(lblStatus);
        Controls.Add(btnOneClick);
        Controls.Add(btnManual);
        Controls.Add(bar);
        Controls.Add(txtLog);
        Controls.Add(btnLaunch);

        Log("Snowbreak Rivals 补丁更新器（一键版）");
        Log("补丁数据已内嵌在本文件中，无需联网。");
        Log("");

        // 启动即在后台自动定位（不阻塞界面）
        Thread t = new Thread(new ThreadStart(delegate()
        {
            string dir = FindGameDir();
            Invoke((MethodInvoker)delegate()
            {
                detectedDir = dir;
                if (dir != null)
                {
                    txtDir.Text = dir;
                    SetStatus("已自动找到游戏，点击「⚡ 一键更新」即可。", Color.ForestGreen);
                    Log("[自动定位] 找到游戏：" + dir);
                }
                else
                {
                    SetStatus("没能自动找到游戏，请点「浏览…」选择，或用「手动更新」。", Color.DarkOrange);
                    Log("[自动定位] 未找到 ⇒ 请手动选择游戏目录");
                }
            });
        }));
        t.IsBackground = true;
        t.Start();
    }

    // ============================================================
    // 界面事件
    // ============================================================

    private void OnBrowse(object sender, EventArgs e)
    {
        string picked = PickDirectory(txtDir.Text);
        if (picked != null)
        {
            txtDir.Text = picked;
            detectedDir = picked;
            SetStatus("已选择目录，可以开始更新。", Color.DimGray);
            Log("[手动] 目录改为：" + picked);
        }
    }

    private void OnOneClick(object sender, EventArgs e)
    {
        string dir = txtDir.Text;
        if (string.IsNullOrEmpty(dir))
        {
            string found = FindGameDir();
            if (found == null)
            {
                MessageBox.Show("没能自动找到游戏安装位置。\n请点「浏览…」选择游戏目录，或使用「手动更新」。",
                    "Snowbreak Rivals", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            dir = found;
            txtDir.Text = dir;
        }
        StartWork(dir);
    }

    private void OnManual(object sender, EventArgs e)
    {
        string picked = PickDirectory(txtDir.Text);
        if (picked == null) return;
        txtDir.Text = picked;
        detectedDir = picked;
        StartWork(picked);
    }

    private void OnLaunch(object sender, EventArgs e)
    {
        try
        {
            Process.Start(Path.Combine(txtDir.Text, GAME_EXE));
        }
        catch (Exception ex)
        {
            MessageBox.Show("启动失败：" + ex.Message, "Snowbreak Rivals",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    // ============================================================
    // 工作线程：校验 → 备份 → 解压 → 修补 → （失败则还原）
    // ============================================================

    private void StartWork(string gameDir)
    {
        if (busy) return;

        // ③ 游戏在运行 ⇒ 直接拒绝
        if (IsGameRunning())
        {
            MessageBox.Show("检测到游戏正在运行。\n请先完全关闭游戏，再点更新。",
                "Snowbreak Rivals", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        // ② 目录校验
        if (!IsValidGameDir(gameDir))
        {
            MessageBox.Show("这个目录里没有找到游戏：\n" + gameDir +
                "\n\n需要同时存在：\n  · " + GAME_EXE + "\n  · resources\\app.asar",
                "Snowbreak Rivals", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        busy = true;
        btnOneClick.Enabled = false;
        btnManual.Enabled = false;
        btnBrowse.Enabled = false;
        btnLaunch.Enabled = false;
        bar.MarqueeAnimationSpeed = 30;
        SetStatus("正在更新，请稍候…（日志见下方）", Color.RoyalBlue);
        Log("");
        Log("================ 开始更新 ================");
        Log("游戏目录：" + gameDir);

        Thread t = new Thread(new ThreadStart(delegate()
        {
            bool ok = false;
            string failReason = null;
            try
            {
                ApplyPatch(gameDir);
                ok = true;
            }
            catch (Exception ex)
            {
                failReason = ex.Message;
            }

            Invoke((MethodInvoker)delegate()
            {
                busy = false;
                btnOneClick.Enabled = true;
                btnManual.Enabled = true;
                btnBrowse.Enabled = true;
                bar.MarqueeAnimationSpeed = 0;

                if (ok)
                {
                    SetStatus("✅ 更新完成，可以启动游戏了。", Color.ForestGreen);
                    Log("================ 更新完成 ================");
                    btnLaunch.Enabled = true;
                    MessageBox.Show("补丁安装完成！可以启动游戏了 ✨", "Snowbreak Rivals",
                        MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
                else
                {
                    SetStatus("❌ 更新失败（已尽力还原）：" + failReason, Color.Firebrick);
                    Log("❌ 失败：" + failReason);
                    MessageBox.Show("补丁安装失败：\n" + failReason +
                        "\n\n若提示「拒绝访问」，请右键本程序 → 以管理员身份运行。",
                        "Snowbreak Rivals", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
            });
        }));
        t.IsBackground = true;
        t.Start();
    }

    /// <summary>真正干活：提取 zip → 备份 asar → 解压 → 运行 patcher → 失败还原</summary>
    private void ApplyPatch(string gameDir)
    {
        string tempZip = Path.Combine(Path.GetTempPath(), "snowbreak_patch.zip");
        string asarPath = Path.Combine(gameDir, Path.Combine("resources", "app.asar"));
        string backupPath = Path.Combine(Path.GetTempPath(), "snowbreak_asar_backup.bak");
        bool backupOk = false;

        // ④ 从自身提取内嵌 zip
        Log("[1/5] 正在从本文件提取补丁数据…");
        ExtractEmbeddedArchive(tempZip);
        long zipLen = new FileInfo(tempZip).Length;
        Log("      补丁数据已提取：" + FormatSize(zipLen));

        try
        {
            // ⑤ 备份 app.asar（旧版没有这一步 ⇒ 中途失败游戏就半坏）
            Log("[2/5] 正在备份 resources\\app.asar …");
            if (File.Exists(asarPath))
            {
                try
                {
                    File.Copy(asarPath, backupPath, true);
                    backupOk = true;
                    Log("      已备份：" + FormatSize(new FileInfo(backupPath).Length) +
                        " → " + backupPath);
                }
                catch (Exception bex)
                {
                    Log("      ⚠️ 备份失败（继续更新，但失败时无法自动还原）：" + bex.Message);
                }
            }
            else
            {
                Log("      ⚠️ 没找到 resources\\app.asar，跳过备份");
            }

            // ⑥ 解压补丁到游戏目录
            Log("[3/5] 正在解压补丁文件…");
            ExtractPatch(tempZip, gameDir);
            Log("      解压完成");

            // ⑦ 运行 asar-patcher.cjs
            Log("[4/5] 正在修补 app.asar（可能需要 1~2 分钟）…");
            RunPatcher(gameDir);

            Log("[5/5] 清理临时文件…");
            Cleanup(tempZip, backupPath);
            Log("      清理完成");
        }
        catch (Exception ex)
        {
            // ⑧ 失败 ⇒ 还原备份（尽力而为，失败也要说清楚）
            if (backupOk)
            {
                Log("⚠️ 更新出错，正在还原备份的 app.asar…");
                try
                {
                    File.Copy(backupPath, asarPath, true);
                    Log("✅ 已还原到更新前的状态。");
                }
                catch (Exception rex)
                {
                    Log("❌ 还原也失败了：" + rex.Message);
                    Log("   备份仍在：" + backupPath + "（可手动复制回 resources\\app.asar）");
                }
            }
            try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch { }
            throw;
        }
    }

    // ============================================================
    // 自动定位游戏目录
    // ============================================================

    /// <summary>
    /// 依次尝试：① 注册表卸载项（按 DisplayName 全扫，兼容换 id）
    ///           ② 正在运行的游戏进程所在目录
    ///           ③ 常见安装位置扫描
    /// </summary>
    private static string FindGameDir()
    {
        string p;

        // ⓪ [2026-10-18 修复] 先看快捷方式 —— 最通用的一招：
        //    安装器默认会建桌面快捷方式，而快捷方式里存的是**绝对路径**
        //    ⇒ 不管玩家把游戏装在哪（桌面 / 下载 / 移动硬盘 / 自建目录）都能反查到。
        //    🔴 这条是因为程实测"装在桌面却找不到"才补的：旧版只扫下方 ①②③，
        //       而「桌面」原本**不在任何候选列表里**。
        p = FindFromShortcuts();
        if (p != null) return p;

        p = FindFromRegistry();
        if (p != null) return p;

        p = FindFromProcess();
        if (p != null) return p;

        p = FindFromCommonPaths();
        if (p != null) return p;

        return null;
    }

    /// <summary>
    /// ⓪ 解析「桌面 / 公共桌面 / 开始菜单」里的 .lnk 快捷方式，反查游戏主程序所在的目录。
    /// 用 WScript.Shell COM 读取快捷方式目标（.NET 自身没有解析 .lnk 的 API）。
    /// 桌面路径一律走 <see cref="Environment.SpecialFolder.DesktopDirectory"/> ——
    /// 这样**被 OneDrive 重定向过的桌面**也能拿到正确位置。
    /// </summary>
    private static string FindFromShortcuts()
    {
        string[] dirs = new string[] {
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.Programs),
            Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms),
        };

        Type shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType == null) return null;
        object shell = null;
        try { shell = Activator.CreateInstance(shellType); }
        catch { return null; }
        if (shell == null) return null;

        for (int d = 0; d < dirs.Length; d++)
        {
            string baseDir = dirs[d];
            if (string.IsNullOrEmpty(baseDir) || !Directory.Exists(baseDir)) continue;

            // 桌面看顶层就够；开始菜单里常有一层「应用名」文件夹 ⇒ 递归
            bool deep = baseDir == dirs[2] || baseDir == dirs[3];
            string[] lnks;
            try
            {
                lnks = Directory.GetFiles(baseDir, "*.lnk",
                    deep ? SearchOption.AllDirectories : SearchOption.TopDirectoryOnly);
            }
            catch { continue; }

            for (int i = 0; i < lnks.Length; i++)
            {
                try
                {
                    object sc = shellType.InvokeMember("CreateShortcut",
                        System.Reflection.BindingFlags.InvokeMethod, null, shell, new object[] { lnks[i] });
                    string target = sc.GetType().InvokeMember("TargetPath",
                        System.Reflection.BindingFlags.GetProperty, null, sc, null) as string;
                    if (string.IsNullOrEmpty(target)) continue;
                    if (!string.Equals(Path.GetFileName(target), GAME_EXE, StringComparison.OrdinalIgnoreCase)) continue;
                    string dir = Path.GetDirectoryName(target);
                    if (IsValidGameDir(dir)) return dir;
                }
                catch { }   // 解析单个快捷方式失败不影响其它
            }
        }
        return null;
    }

    /// <summary>① 全扫 Uninstall 下的卸载项，找名字里带 Snowbreak 的（兼容 id 变过）</summary>
    private static string FindFromRegistry()
    {
        string[] roots = new string[] {
            @"Software\Microsoft\Windows\CurrentVersion\Uninstall",
            @"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
        };
        bool[] isLocalMachine = new bool[] { true, false };

        for (int r = 0; r < roots.Length; r++)
        {
            for (int m = 0; m < isLocalMachine.Length; m++)
            {
                try
                {
                    Microsoft.Win32.RegistryKey baseKey = isLocalMachine[m]
                        ? Microsoft.Win32.Registry.LocalMachine
                        : Microsoft.Win32.Registry.CurrentUser;
                    using (Microsoft.Win32.RegistryKey uninst = baseKey.OpenSubKey(roots[r]))
                    {
                        if (uninst == null) continue;
                        string[] names = uninst.GetSubKeyNames();
                        for (int i = 0; i < names.Length; i++)
                        {
                            using (Microsoft.Win32.RegistryKey k = uninst.OpenSubKey(names[i]))
                            {
                                if (k == null) continue;
                                string display = k.GetValue("DisplayName") as string;
                                if (display == null || display.IndexOf("Snowbreak", StringComparison.OrdinalIgnoreCase) < 0)
                                    continue;
                                string loc = k.GetValue("InstallLocation") as string;
                                if (!string.IsNullOrEmpty(loc) && IsValidGameDir(loc))
                                    return loc;
                                // [2026-10-18 修复] 有些安装器**只写 UninstallString**（卸载器 exe 的绝对路径），
                                // 没有 InstallLocation ⇒ 从卸载器路径反推安装目录（卸载器就装在游戏目录里）
                                string uninstStr = k.GetValue("UninstallString") as string;
                                string fromUninst = DirFromExePath(uninstStr);
                                if (fromUninst != null) return fromUninst;
                            }
                        }
                    }
                }
                catch { }
            }
        }
        return null;
    }

    /// <summary>② 游戏正开着的话，直接问进程要路径（最快也最准）</summary>
    private static string FindFromProcess()
    {
        try
        {
            Process[] ps = Process.GetProcessesByName(Path.GetFileNameWithoutExtension(GAME_EXE));
            for (int i = 0; i < ps.Length; i++)
            {
                try
                {
                    string exe = ps[i].MainModule.FileName;
                    string dir = Path.GetDirectoryName(exe);
                    if (!string.IsNullOrEmpty(dir) && IsValidGameDir(dir)) return dir;
                }
                catch { }   // 权限不足时读不到 MainModule，忽略
            }
        }
        catch { }
        return null;
    }

    /// <summary>
    /// 从「带引号 / 带参数 / 裸路径」的 exe 路径字符串里取出目录（非法或目录不是游戏目录时返回 null）。
    /// 例：`"C:\Users\x\Desktop\Snowbreak Rivals\Uninstall Snowbreak Rivals.exe"` → 桌面那个安装目录。
    /// </summary>
    private static string DirFromExePath(string raw)
    {
        if (string.IsNullOrEmpty(raw)) return null;
        string s = raw.Trim();
        if (s.StartsWith("\""))
        {
            int end = s.IndexOf('"', 1);
            if (end > 1) s = s.Substring(1, end - 1);
        }
        else
        {
            // 没引号：砍掉第一个空格之后的部分（可能是参数）
            int sp = s.IndexOf(' ');
            if (sp > 0) s = s.Substring(0, sp);
        }
        try
        {
            if (!File.Exists(s)) return null;
            string dir = Path.GetDirectoryName(s);
            return IsValidGameDir(dir) ? dir : null;
        }
        catch { return null; }
    }

    /// <summary>③ 扫常见位置（含各盘根目录下的若干候选）</summary>
    private static string FindFromCommonPaths()
    {
        List<string> candidates = new List<string>();

        string[] roots = new string[] {
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
        };
        for (int i = 0; i < roots.Length; i++)
        {
            if (string.IsNullOrEmpty(roots[i])) continue;
            candidates.Add(Path.Combine(roots[i], "Snowbreak Rivals"));
            candidates.Add(Path.Combine(Path.Combine(roots[i], "Programs"), "Snowbreak Rivals"));
            candidates.Add(Path.Combine(Path.Combine(roots[i], "Games"), "Snowbreak Rivals"));
        }

        // [2026-10-18 修复] 补上**桌面**与**下载** —— 实测发现大量玩家直接把游戏解压/安装到这两个地方，
        // 而旧版候选列表里根本没有它们（程就装在桌面，因此自动定位失败）。
        //   · DesktopDirectory 会自动跟随 OneDrive 重定向 ⇒ 云同步桌面也能命中
        //   · Downloads 没有专用 SpecialFolder，用 UserProfile 拼
        string userProfile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        string commonDesktop = Environment.GetFolderPath(Environment.SpecialFolder.CommonDesktopDirectory);
        string[] extraRoots = new string[] {
            desktop,
            commonDesktop,
            string.IsNullOrEmpty(userProfile) ? null : Path.Combine(userProfile, "Downloads"),
        };
        for (int i = 0; i < extraRoots.Length; i++)
        {
            if (string.IsNullOrEmpty(extraRoots[i])) continue;
            candidates.Add(Path.Combine(extraRoots[i], "Snowbreak Rivals"));
            candidates.Add(Path.Combine(Path.Combine(extraRoots[i], "Games"), "Snowbreak Rivals"));
            // 下载目录里常见「解压出来带版本后缀」的文件夹，如 Snowbreak Rivals-win32-x64
            try
            {
                if (Directory.Exists(extraRoots[i]))
                {
                    string[] subs = Directory.GetDirectories(extraRoots[i], "Snowbreak Rivals*");
                    for (int s = 0; s < subs.Length; s++) candidates.Add(subs[s]);
                }
            }
            catch { }
        }

        try
        {
            DriveInfo[] drives = DriveInfo.GetDrives();
            for (int i = 0; i < drives.Length; i++)
            {
                try
                {
                    if (drives[i].DriveType != DriveType.Fixed) continue;
                    string root = drives[i].RootDirectory.FullName;
                    candidates.Add(Path.Combine(root, "Snowbreak Rivals"));
                    candidates.Add(Path.Combine(Path.Combine(root, "Games"), "Snowbreak Rivals"));
                    candidates.Add(Path.Combine(Path.Combine(root, "Program Files"), "Snowbreak Rivals"));
                    candidates.Add(Path.Combine(Path.Combine(root, "游戏"), "Snowbreak Rivals"));
                }
                catch { }
            }
        }
        catch { }

        for (int i = 0; i < candidates.Count; i++)
        {
            if (IsValidGameDir(candidates[i])) return candidates[i];
        }
        return null;
    }

    // ============================================================
    // 基础工具
    // ============================================================

    /// <summary>目录校验：既要游戏主程序，也要 asar（否则不是完整安装）</summary>
    private static bool IsValidGameDir(string dir)
    {
        if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) return false;
        if (!File.Exists(Path.Combine(dir, GAME_EXE))) return false;
        string asar = Path.Combine(dir, Path.Combine("resources", "app.asar"));
        return File.Exists(asar);
    }

    private static bool IsGameRunning()
    {
        try
        {
            return Process.GetProcessesByName(Path.GetFileNameWithoutExtension(GAME_EXE)).Length > 0;
        }
        catch { return false; }
    }

    private string PickDirectory(string initial)
    {
        using (FolderBrowserDialog dialog = new FolderBrowserDialog())
        {
            dialog.Description = "请选择 Snowbreak Rivals 的游戏安装目录";
            dialog.ShowNewFolderButton = false;
            if (!string.IsNullOrEmpty(initial) && Directory.Exists(initial))
                dialog.SelectedPath = initial;
            else
                dialog.SelectedPath = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            if (dialog.ShowDialog() != DialogResult.OK) return null;
            return dialog.SelectedPath;
        }
    }

    private static string FormatSize(long bytes)
    {
        if (bytes >= 1024L * 1024L * 1024L) return (bytes / 1024.0 / 1024.0 / 1024.0).ToString("0.00") + " GB";
        if (bytes >= 1024L * 1024L) return (bytes / 1024.0 / 1024.0).ToString("0.0") + " MB";
        if (bytes >= 1024L) return (bytes / 1024.0).ToString("0.0") + " KB";
        return bytes + " B";
    }

    /// <summary>从 exe 尾部提取嵌入的 zip（格式：[C# exe][zip 数据][8 字节长度]）</summary>
    private static void ExtractEmbeddedArchive(string outputPath)
    {
        byte[] self = File.ReadAllBytes(Assembly.GetExecutingAssembly().Location);
        if (self.Length < 8)
            throw new Exception("文件损坏：太短");

        long zipSize = BitConverter.ToInt64(self, self.Length - 8);
        if (zipSize <= 0 || zipSize > self.Length - 8)
            throw new Exception(string.Format("补丁数据长度无效：{0}", zipSize));

        long dataStart = self.Length - 8 - zipSize;
        if (dataStart < 0)
            throw new Exception("补丁数据位置无效");

        byte[] zipData = new byte[zipSize];
        Buffer.BlockCopy(self, (int)dataStart, zipData, 0, (int)zipSize);
        File.WriteAllBytes(outputPath, zipData);
    }

    /// <summary>
    /// 把补丁 zip 解压到游戏目录（**同名文件覆盖**：这就是补丁的全部意义）。
    /// ⚠️ [2026-10-10] 编译命令**必须多带一个引用** `/reference:System.IO.Compression.dll` ——
    ///    `ZipArchive` / `ZipArchiveEntry` 住在那个程序集里（`…FileSystem.dll` 里只有 `ZipFile` 门面）。
    ///    另外 `ZipFile.ExtractToDirectory` 在本机 .NET 上**只有 (string,string,Encoding) 重载、没有覆盖版**
    ///    ⇒ 不能拿它替代：两参数版本遇到已存在的文件会直接抛异常（我们的补丁全是覆盖）。
    /// </summary>
    private void ExtractPatch(string archivePath, string gameDir)
    {
        Log("      正在解压（大补丁可能要几十秒）…");
        int count = 0;
        using (var archive = ZipFile.OpenRead(archivePath))
        {
            foreach (var entry in archive.Entries)
            {
                string targetPath = Path.Combine(gameDir, entry.FullName);
                if (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\"))
                {
                    Directory.CreateDirectory(targetPath);
                    continue;
                }
                Directory.CreateDirectory(Path.GetDirectoryName(targetPath));
                if (File.Exists(targetPath)) File.Delete(targetPath);   // 覆盖语义
                entry.ExtractToFile(targetPath);
                count++;
                if (count % 20 == 0) Log("      …已解压 " + count + " 个文件");
            }
        }
        Log("      共解压 " + count + " 个文件（同名已覆盖）");
    }

    /// <summary>运行 asar-patcher.cjs（实时把输出写进日志框）</summary>
    private void RunPatcher(string gameDir)
    {
        string exePath = Path.Combine(gameDir, GAME_EXE);
        string patcher = Path.Combine(gameDir, "asar-patcher.cjs");
        if (!File.Exists(patcher))
            throw new Exception("未找到 asar-patcher.cjs，补丁文件可能没有正确解压。");

        ProcessStartInfo psi = new ProcessStartInfo(exePath, "\"" + patcher + "\"");
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.WorkingDirectory = gameDir;
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";

        Process proc = Process.Start(psi);

        string output = "";
        Thread readThread = new Thread(new ThreadStart(delegate()
        {
            try
            {
                string line;
                while ((line = proc.StandardOutput.ReadLine()) != null)
                {
                    string l = line;
                    BeginInvoke((MethodInvoker)delegate() { Log("      " + l); });
                    output += l + "\n";
                }
                string err;
                while ((err = proc.StandardError.ReadLine()) != null)
                {
                    string l2 = err;
                    BeginInvoke((MethodInvoker)delegate() { Log("      错误: " + l2); });
                    output += "错误: " + l2 + "\n";
                }
            }
            catch { }
        }));
        readThread.IsBackground = true;
        readThread.Start();

        bool exited = proc.WaitForExit(180000);   // 最多 3 分钟
        readThread.Join(3000);

        if (!exited)
        {
            try { proc.Kill(); } catch { }
            throw new Exception("asar 修补超时（超过 3 分钟），已中止。请重试或联系开发者。");
        }
        if (proc.ExitCode != 0)
        {
            throw new Exception(string.Format("asar-patcher 执行失败 (exit {0})\n\n输出：{1}",
                proc.ExitCode, output.Trim()));
        }
    }

    /// <summary>清理临时文件（备份文件保留，便于玩家手动还原）</summary>
    private static void Cleanup(string tempZip, string backupPath)
    {
        try { if (File.Exists(tempZip)) File.Delete(tempZip); } catch { }
        // 注意：backupPath **故意不删** —— 玩家若发现异常还能自己复制回去
        GC.KeepAlive(backupPath);
    }

    // ============================================================
    // 界面小工具
    // ============================================================

    private void Log(string line)
    {
        txtLog.AppendText(line + Environment.NewLine);
        txtLog.SelectionStart = txtLog.Text.Length;
        txtLog.ScrollToCaret();
    }

    private void SetStatus(string text, Color color)
    {
        lblStatus.Text = text;
        lblStatus.ForeColor = color;
    }
}
