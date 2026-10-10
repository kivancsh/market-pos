// Market Kasa — Windows başlatıcısı (Market Kasa.exe).
// Windows'ta hazır gelen .NET Framework 4 derleyicisiyle (csc.exe, C# 5) derlenir; ek kurulum gerektirmez.
//
// Çift tıklayınca:
//   - Program kapalıysa: sunucuyu görünmez pencerede başlatır, hazır olunca tarayıcıyı açar.
//   - Program açıksa: "Tarayıcıda aç / Programı kapat" penceresi gösterir.
// Komut satırı (kurulum ve test için): --start (başlat ve bekle), --stop (durdur), --status (0 = çalışıyor).
using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Windows.Forms;

[assembly: System.Reflection.AssemblyTitle("Market Kasa")]
[assembly: System.Reflection.AssemblyProduct("Market Kasa")]
[assembly: System.Reflection.AssemblyDescription("Barkodlu satış, stok ve kâr takibi")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

static class MarketKasa
{
    const int Port = 3000;
    static readonly string AppDir = Path.GetDirectoryName(Application.ExecutablePath);
    static readonly string Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Market Kasa");
    static string DataDir { get { return Path.Combine(Root, "data"); } }
    static string BackupDir { get { return Path.Combine(Root, "backups"); } }
    static string LogDir { get { return Path.Combine(Root, "logs"); } }
    static string PidFile { get { return Path.Combine(Root, "server.pid"); } }
    static string NodeExe { get { return Path.Combine(AppDir, "node", "node.exe"); } }
    static string ServerDir { get { return Path.Combine(AppDir, "app"); } }

    [STAThread]
    static int Main(string[] args)
    {
        string cmd = args.Length > 0 ? args[0].ToLowerInvariant() : "";
        try
        {
            if (cmd == "--status") return IsRunning() ? 0 : 1;
            if (cmd == "--stop") { Stop(); return 0; }
            if (cmd == "--start") return StartAndWait(180) ? 0 : 2;
        }
        catch (Exception e)
        {
            LauncherLog(e.ToString());
            return 3;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        bool created;
        using (var mutex = new Mutex(true, "MarketKasaLauncher", out created))
        {
            if (!created) return 0; // zaten bir pencere açık
            try { Interactive(); }
            catch (Exception e)
            {
                LauncherLog(e.ToString());
                MessageBox.Show("Beklenmeyen bir hata oluştu:\n\n" + e.Message + "\n\nAyrıntılar: " + LogDir,
                    "Market Kasa", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        return 0;
    }

    // ------------------------------------------------------------------ etkileşimli kullanım
    static void Interactive()
    {
        if (IsRunning())
        {
            ShowRunningDialog();
            return;
        }
        if (!File.Exists(NodeExe) || !File.Exists(Path.Combine(ServerDir, "kasa-server.js")))
        {
            MessageBox.Show("Program dosyaları eksik. Lütfen Market Kasa'yı yeniden kurun.", "Market Kasa",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        var splash = new StartingForm();
        splash.Show();
        Application.DoEvents();
        bool ok = false;
        var worker = new Thread(delegate () { ok = StartAndWait(180); });
        worker.IsBackground = true;
        worker.Start();
        while (worker.IsAlive)
        {
            Application.DoEvents();
            Thread.Sleep(40);
        }
        splash.Close();

        if (ok) OpenBrowser("http://localhost:" + Port);
        else
            MessageBox.Show("Market Kasa başlatılamadı.\n\nBilgisayarı yeniden başlatıp tekrar deneyin. Sorun sürerse şu klasördeki server.log dosyasını destek için saklayın:\n" + LogDir,
                "Market Kasa", MessageBoxButtons.OK, MessageBoxIcon.Error);
    }

    static void ShowRunningDialog()
    {
        using (var dlg = new RunningForm(LanAddress()))
        {
            DialogResult r = dlg.ShowDialog();
            if (r == DialogResult.Yes) OpenBrowser("http://localhost:" + Port);
            else if (r == DialogResult.No)
            {
                DialogResult confirm = MessageBox.Show(
                    "Program kapatılsın mı?\n\nKapatınca kasa ve panel çalışmaz; tekrar açmak için Market Kasa simgesine tıklayın.",
                    "Market Kasa", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
                if (confirm == DialogResult.Yes)
                {
                    Stop();
                    MessageBox.Show("Program kapatıldı.", "Market Kasa", MessageBoxButtons.OK, MessageBoxIcon.Information);
                }
            }
        }
    }

    // ------------------------------------------------------------------ sunucu yönetimi
    static bool IsRunning()
    {
        try
        {
            var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + Port + "/api/auth/me");
            req.Timeout = 2000;
            req.ReadWriteTimeout = 2000;
            req.Proxy = null;
            using (var resp = (HttpWebResponse)req.GetResponse())
            using (var reader = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
            {
                return reader.ReadToEnd().Contains("needsSetup");
            }
        }
        catch
        {
            return false;
        }
    }

    static bool StartAndWait(int seconds)
    {
        if (IsRunning()) return true;
        Directory.CreateDirectory(DataDir);
        Directory.CreateDirectory(BackupDir);
        Directory.CreateDirectory(LogDir);

        var psi = new ProcessStartInfo(NodeExe, Quote(Path.Combine(ServerDir, "kasa-server.js")));
        psi.WorkingDirectory = ServerDir;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.WindowStyle = ProcessWindowStyle.Hidden;
        psi.EnvironmentVariables["NODE_ENV"] = "production";
        psi.EnvironmentVariables["NEXT_TELEMETRY_DISABLED"] = "1";
        psi.EnvironmentVariables["PORT"] = Port.ToString();
        psi.EnvironmentVariables["HOSTNAME"] = "0.0.0.0";
        psi.EnvironmentVariables["DB_PATH"] = Path.Combine(DataDir, "store.db");
        psi.EnvironmentVariables["BACKUP_DIR"] = BackupDir;
        psi.EnvironmentVariables["SESSION_SECRET"] = SessionSecret();
        psi.EnvironmentVariables["MARKET_LOG_DIR"] = LogDir;
        psi.EnvironmentVariables["MARKET_PID_FILE"] = PidFile;
        Process proc = Process.Start(psi);

        DateTime until = DateTime.Now.AddSeconds(seconds);
        while (DateTime.Now < until)
        {
            if (IsRunning()) return true;
            if (proc.HasExited)
            {
                LauncherLog("Sunucu erken kapandı, çıkış kodu " + proc.ExitCode);
                return false;
            }
            Thread.Sleep(500);
        }
        LauncherLog("Sunucu " + seconds + " saniyede hazır olmadı.");
        return false;
    }

    static void Stop()
    {
        try
        {
            int pid;
            if (File.Exists(PidFile) && int.TryParse(File.ReadAllText(PidFile).Trim(), out pid)) KillIfOurs(Process.GetProcessById(pid));
        }
        catch { }
        // Yedek yol: bu kurulumun node.exe'siyle çalışan her süreci kapat.
        foreach (Process p in Process.GetProcessesByName("node")) KillIfOurs(p);
        try { File.Delete(PidFile); } catch { }
    }

    static void KillIfOurs(Process p)
    {
        try
        {
            if (string.Equals(p.MainModule.FileName, NodeExe, StringComparison.OrdinalIgnoreCase))
            {
                p.Kill();
                p.WaitForExit(10000);
            }
        }
        catch { }
    }

    static string SessionSecret()
    {
        Directory.CreateDirectory(Root);
        string file = Path.Combine(Root, "session-secret");
        try
        {
            string s = File.ReadAllText(file).Trim();
            if (s.Length >= 32) return s;
        }
        catch { }
        var bytes = new byte[32];
        using (var rng = new RNGCryptoServiceProvider()) rng.GetBytes(bytes);
        var sb = new StringBuilder();
        foreach (byte b in bytes) sb.Append(b.ToString("x2"));
        File.WriteAllText(file, sb.ToString());
        return sb.ToString();
    }

    // ------------------------------------------------------------------ yardımcılar
    static string LanAddress()
    {
        try
        {
            foreach (NetworkInterface ni in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (ni.OperationalStatus != OperationalStatus.Up) continue;
                if (ni.NetworkInterfaceType == NetworkInterfaceType.Loopback || ni.NetworkInterfaceType == NetworkInterfaceType.Tunnel) continue;
                IPInterfaceProperties props = ni.GetIPProperties();
                if (props.GatewayAddresses.Count == 0) continue;
                foreach (UnicastIPAddressInformation a in props.UnicastAddresses)
                {
                    if (a.Address.AddressFamily != AddressFamily.InterNetwork) continue;
                    string ip = a.Address.ToString();
                    if (ip.StartsWith("169.254.") || ip.StartsWith("127.")) continue;
                    return ip;
                }
            }
        }
        catch { }
        return null;
    }

    static void OpenBrowser(string url)
    {
        try { Process.Start(url); }
        catch (Exception e) { LauncherLog(e.ToString()); }
    }

    static string Quote(string s) { return "\"" + s + "\""; }

    static void LauncherLog(string text)
    {
        try
        {
            Directory.CreateDirectory(LogDir);
            File.AppendAllText(Path.Combine(LogDir, "launcher.log"), "[" + DateTime.Now.ToString("s") + "] " + text + Environment.NewLine);
        }
        catch { }
    }

    static Icon AppIcon()
    {
        try { return Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
        catch { return SystemIcons.Application; }
    }

    // ------------------------------------------------------------------ pencereler
    sealed class StartingForm : Form
    {
        public StartingForm()
        {
            Text = "Market Kasa";
            Icon = AppIcon();
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(420, 130);
            Font = new Font("Segoe UI", 10f);
            TopMost = true;
            ControlBox = false;

            var title = new Label();
            title.Text = "Market Kasa başlatılıyor…";
            title.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
            title.AutoSize = true;
            title.Location = new Point(20, 16);
            Controls.Add(title);

            var hint = new Label();
            hint.Text = "İlk açılışta bir dakika kadar sürebilir. Hazır olunca tarayıcı açılacak.";
            hint.AutoSize = false;
            hint.Size = new Size(380, 40);
            hint.Location = new Point(20, 46);
            Controls.Add(hint);

            var bar = new ProgressBar();
            bar.Style = ProgressBarStyle.Marquee;
            bar.MarqueeAnimationSpeed = 30;
            bar.Location = new Point(20, 92);
            bar.Size = new Size(380, 18);
            Controls.Add(bar);
        }
    }

    sealed class RunningForm : Form
    {
        public RunningForm(string lanIp)
        {
            Text = "Market Kasa";
            Icon = AppIcon();
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(460, 190);
            Font = new Font("Segoe UI", 10f);
            TopMost = true;

            var pic = new PictureBox();
            pic.Image = AppIcon().ToBitmap();
            pic.SizeMode = PictureBoxSizeMode.Zoom;
            pic.Location = new Point(20, 20);
            pic.Size = new Size(48, 48);
            Controls.Add(pic);

            var title = new Label();
            title.Text = "Market Kasa açık ve çalışıyor.";
            title.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
            title.AutoSize = true;
            title.Location = new Point(84, 20);
            Controls.Add(title);

            var info = new Label();
            info.Text = "Bu bilgisayarda:  http://localhost:" + Port +
                (lanIp != null ? "\nTelefondan panel:  http://" + lanIp + ":" + Port + "/panel" : "");
            info.AutoSize = false;
            info.Size = new Size(360, 60);
            info.Location = new Point(84, 54);
            Controls.Add(info);

            var close = new Button();
            close.Text = "Programı kapat";
            close.DialogResult = DialogResult.No;
            close.Size = new Size(140, 34);
            close.Location = new Point(146, 138);
            Controls.Add(close);

            var open = new Button();
            open.Text = "Tarayıcıda aç";
            open.DialogResult = DialogResult.Yes;
            open.Size = new Size(150, 34);
            open.Location = new Point(294, 138);
            Controls.Add(open);

            AcceptButton = open;
            CancelButton = null;
        }
    }
}
