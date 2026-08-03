/**
 * patch-launcher.cs — Snowbreak Rivals 补丁安装器
 *
 * 编译：csc /target:winexe /reference:System.Windows.Forms.dll
 *          /reference:System.IO.Compression.FileSystem.dll
 *          /out:patch-launcher.exe patch-launcher.cs
 *
 * 用法：copy /b patch-launcher.exe + patch.zip final-patch.exe
 *
 * 运行流程：
 *   1. 弹出对话框选择游戏目录
 *   2. 用 .NET 自解压功能解压补丁文件
 *   3. 调用游戏引擎执行 asar-patcher 修补 asar
 *   4. 完成
 */

using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows.Forms;
using System.IO.Compression;

class PatchLauncher
{
    [STAThread]
    static void Main(string[] args)
    {
        try
        {
            // 启动提示
            MessageBox.Show("即将安装 Snowbreak Rivals 补丁。\n点击确定后请选择游戏安装目录。",
                "Snowbreak Rivals 补丁安装", MessageBoxButtons.OK, MessageBoxIcon.Information);

            // 1) 从自身提取嵌入的 zip 数据
            string tempZip = Path.Combine(Path.GetTempPath(), "snowbreak_patch.zip");
            ExtractEmbeddedArchive(tempZip);
            MessageBox.Show("补丁数据已提取。即将选择游戏目录。",
                "步骤 1 完成", MessageBoxButtons.OK, MessageBoxIcon.Information);

            // 2) 选择游戏目录
            string gameDir = SelectGameDirectory();
            if (gameDir == null)
            {
                MessageBox.Show("已取消安装。", "Snowbreak Rivals",
                    MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
            MessageBox.Show("游戏目录：" + gameDir + "\n点击确定开始解压补丁。",
                "步骤 2 完成", MessageBoxButtons.OK, MessageBoxIcon.Information);

            // 3) 解压到游戏目录
            ExtractPatch(tempZip, gameDir);

            // 4) 运行 asar-patcher
            MessageBox.Show("正在执行 asar 修补...\n（请稍候，可能需要 1-2 分钟）",
                "步骤 4/4", MessageBoxButtons.OK, MessageBoxIcon.Information);
            RunPatcher(gameDir);
            MessageBox.Show("asar 修补完成！",
                "步骤 4 完成", MessageBoxButtons.OK, MessageBoxIcon.Information);

            // 5) 清理临时文件
            Cleanup(tempZip, gameDir);

            MessageBox.Show("补丁安装完成！可以启动游戏了 ✨",
                "Snowbreak Rivals", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show("补丁安装失败：\n" + ex.Message,
                "Snowbreak Rivals", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Environment.Exit(1);
        }
    }

    /// <summary>从 exe 尾部提取嵌入的 zip 数据</summary>
    /// 文件格式：[C# exe][zip 数据][8 字节：zip 数据长度]
    static void ExtractEmbeddedArchive(string outputPath)
    {
        byte[] self = File.ReadAllBytes(Assembly.GetExecutingAssembly().Location);
        if (self.Length < 8)
            throw new Exception("文件损坏：太短");

        // 读取末尾 8 字节 = zip 数据长度 (Int64)
        long zipSize = BitConverter.ToInt64(self, self.Length - 8);
        if (zipSize <= 0 || zipSize > self.Length - 8)
            throw new Exception(string.Format("补丁数据长度无效：{0}", zipSize));

        // zip 数据在 exe 之后、长度标记之前
        long dataStart = self.Length - 8 - zipSize;
        if (dataStart < 0)
            throw new Exception("补丁数据位置无效");

        byte[] zipData = new byte[zipSize];
        Buffer.BlockCopy(self, (int)dataStart, zipData, 0, (int)zipSize);
        File.WriteAllBytes(outputPath, zipData);
    }

    /// <summary>让用户选择游戏安装目录</summary>
    static string SelectGameDirectory()
    {
        string regPath = TryReadRegistry();

        using (var dialog = new FolderBrowserDialog())
        {
            dialog.Description = "请选择 Snowbreak Rivals 的游戏安装目录";
            dialog.ShowNewFolderButton = false;
            dialog.SelectedPath = regPath ?? Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);

            if (dialog.ShowDialog() != DialogResult.OK)
            {
                return null;
            }

            string dir = dialog.SelectedPath;
            if (!File.Exists(Path.Combine(dir, "Snowbreak Rivals.exe")))
            {
                MessageBox.Show("所选目录中没有找到 Snowbreak Rivals.exe",
                    "目录验证", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return SelectGameDirectory();
            }
            return dir;
        }
    }

    /// <summary>从注册表读取游戏安装路径</summary>
    static string TryReadRegistry()
    {
        try
        {
            using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall\com.snowbreak.rivals"))
            {
                if (key != null)
                {
                    string path = key.GetValue("InstallLocation") as string;
                    if (!string.IsNullOrEmpty(path)) return path;
                }
            }
            using (var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Uninstall\com.snowbreak.rivals"))
            {
                if (key != null)
                {
                    string path = key.GetValue("InstallLocation") as string;
                    if (!string.IsNullOrEmpty(path)) return path;
                }
            }
        }
        catch { }
        return null;
    }

    /// <summary>解压补丁到游戏目录</summary>
    static void ExtractPatch(string archivePath, string gameDir)
    {
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
                if (File.Exists(targetPath)) File.Delete(targetPath);
                entry.ExtractToFile(targetPath);
            }
        }
    }

    /// <summary>运行 asar-patcher.cjs，显示进度窗口</summary>
    static void RunPatcher(string gameDir)
    {
        string exePath = Path.Combine(gameDir, "Snowbreak Rivals.exe");
        string patcher = Path.Combine(gameDir, "asar-patcher.cjs");

        if (!File.Exists(patcher))
        {
            throw new Exception("未找到 asar-patcher.cjs，补丁文件可能没有正确解压。");
        }

        // 创建进度窗体
        Form progressForm = new Form();
        progressForm.Text = "Snowbreak Rivals 补丁安装";
        progressForm.Size = new System.Drawing.Size(520, 320);
        progressForm.StartPosition = FormStartPosition.CenterScreen;
        progressForm.FormBorderStyle = FormBorderStyle.FixedDialog;
        progressForm.MaximizeBox = false;
        progressForm.MinimizeBox = false;
        progressForm.ControlBox = false;

        Label lblStatus = new Label();
        lblStatus.Text = "正在修补游戏文件，请稍候...";
        lblStatus.Location = new System.Drawing.Point(15, 15);
        lblStatus.Size = new System.Drawing.Size(475, 25);

        ProgressBar progressBar = new ProgressBar();
        progressBar.Location = new System.Drawing.Point(15, 50);
        progressBar.Size = new System.Drawing.Size(475, 25);
        progressBar.Style = ProgressBarStyle.Marquee;
        progressBar.MarqueeAnimationSpeed = 30;

        TextBox txtLog = new TextBox();
        txtLog.Location = new System.Drawing.Point(15, 85);
        txtLog.Size = new System.Drawing.Size(475, 185);
        txtLog.Multiline = true;
        txtLog.ReadOnly = true;
        txtLog.ScrollBars = ScrollBars.Vertical;
        txtLog.Font = new System.Drawing.Font("Consolas", 9);
        txtLog.BackColor = System.Drawing.Color.Black;
        txtLog.ForeColor = System.Drawing.Color.LightGreen;

        progressForm.Controls.Add(lblStatus);
        progressForm.Controls.Add(progressBar);
        progressForm.Controls.Add(txtLog);

        // 在新线程显示窗体
        System.Threading.Thread formThread = new System.Threading.Thread(() =>
        {
            progressForm.ShowDialog();
        });
        formThread.SetApartmentState(System.Threading.ApartmentState.STA);
        formThread.Start();
        System.Threading.Thread.Sleep(200); // 等窗体显示

        // 启动 asar-patcher 并捕获输出
        var psi = new ProcessStartInfo(exePath, string.Format("\"{0}\"", patcher))
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            WorkingDirectory = gameDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
        };
        psi.EnvironmentVariables["ELECTRON_RUN_AS_NODE"] = "1";

        var proc = Process.Start(psi);

        // 读取输出并实时更新界面
        string output = "";
        System.Threading.Thread readThread = new System.Threading.Thread(() =>
        {
            string line;
            while ((line = proc.StandardOutput.ReadLine()) != null)
            {
                progressForm.Invoke((MethodInvoker)(() =>
                {
                    txtLog.AppendText(line + Environment.NewLine);
                    txtLog.SelectionStart = txtLog.Text.Length;
                    txtLog.ScrollToCaret();
                }));
                output += line + "\n";
            }
            string errLine;
            while ((errLine = proc.StandardError.ReadLine()) != null)
            {
                progressForm.Invoke((MethodInvoker)(() =>
                {
                    txtLog.AppendText("错误: " + errLine + Environment.NewLine);
                    txtLog.SelectionStart = txtLog.Text.Length;
                    txtLog.ScrollToCaret();
                }));
                output += "错误: " + errLine + "\n";
            }
        });
        readThread.Start();

        proc.WaitForExit(180000); // 最多等 3 分钟
        readThread.Join(2000);

        // 关闭进度窗体
        progressForm.Invoke((MethodInvoker)(() => { progressForm.Close(); }));
        formThread.Join(2000);

        if (proc.ExitCode != 0)
        {
            throw new Exception(string.Format(
                "asar-patcher 执行失败 (exit {0})\n\n输出：{1}",
                proc.ExitCode, output.Trim()));
        }
    }

    /// <summary>清理临时文件</summary>
    static void Cleanup(string tempZip, string gameDir)
    {
        try { File.Delete(tempZip); } catch { }
        try
        {
            string patchDir = Path.Combine(gameDir, "_patch");
            if (Directory.Exists(patchDir))
                Directory.Delete(patchDir, recursive: true);
        }
        catch { }
    }
}
