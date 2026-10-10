// Market Kasa — Windows uygulaması (Market Kasa.exe).
// Programı tarayıcı yerine KENDİ PENCERESİNDE açar (Microsoft Edge WebView2; Windows 10/11'de hazır gelir).
// Windows'taki .NET Framework 4 derleyicisiyle (csc.exe, C# 5) derlenir; WebView2 DLL'leri exe'nin yanında durur.
//
// Çift tıklayınca: sunucu kapalıysa görünmez pencerede başlatır, sonra uygulama penceresini açar.
// Pencere zaten açıksa öne getirir. Pencereyi kapatmak programı KAPATMAZ (telefondan takip sürer);
// tamamen kapatmak için menü: Market Kasa → Programı tamamen kapat.
// WebView2 bulunamazsa program varsayılan tarayıcıda açılır.
// Komut satırı: --start (başlat ve bekle), --stop (durdur), --status (0 = çalışıyor), --selftest (pencereyi dene).
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
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

[assembly: System.Reflection.AssemblyTitle("Market Kasa")]
[assembly: System.Reflection.AssemblyProduct("Market Kasa")]
[assembly: System.Reflection.AssemblyDescription("Barkodlu satış, stok ve kâr takibi")]
[assembly: System.Reflection.AssemblyVersion("2.0.0.0")]

static class MarketKasa
{
    const int Port = 3000;
    const string Home = "http://localhost:3000/";
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

        if (cmd == "--selftest") return SelfTest();

        bool created;
        using (var mutex = new Mutex(true, "MarketKasaLauncher", out created))
        {
            if (!created)
            {
                // Pencere zaten açık: öne getirmesini söyle
                try { EventWaitHandle.OpenExisting("MarketKasaShowWindow").Set(); } catch { }
                return 0;
            }
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
        if (!IsRunning())
        {
            if (!File.Exists(NodeExe) || !File.Exists(Path.Combine(ServerDir, "kasa-server.js")))
            {
                MessageBox.Show("Program dosyaları eksik. Lütfen Market Kasa'yı yeniden kurun.", "Market Kasa",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
            if (!StartWithSplash())
            {
                MessageBox.Show("Market Kasa başlatılamadı.\n\nBilgisayarı yeniden başlatıp tekrar deneyin. Sorun sürerse şu klasördeki server.log dosyasını destek için saklayın:\n" + LogDir,
                    "Market Kasa", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }
        }

        var form = new MainForm(false);
        var showSignal = new EventWaitHandle(false, EventResetMode.AutoReset, "MarketKasaShowWindow");
        var listener = new Thread(delegate ()
        {
            while (true)
            {
                showSignal.WaitOne();
                try { form.BeginInvoke(new MethodInvoker(form.BringToFrontNow)); } catch { return; }
            }
        });
        listener.IsBackground = true;
        listener.Start();
        Application.Run(form);
    }

    static bool StartWithSplash()
    {
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
        return ok;
    }

    // Pencereyi görünmeden açıp sayfanın yüklendiğini dener (GitHub'daki Windows testinde kullanılır)
    static int SelfTest()
    {
        if (!StartAndWait(180)) { Report("sunucu başlamadı"); return 2; }
        var form = new MainForm(true);
        Application.Run(form);
        return form.SelfTestResult;
    }

    // ------------------------------------------------------------------ ana pencere
    sealed class MainForm : Form
    {
        readonly WebView2 web;
        readonly bool selfTest;
        public int SelfTestResult = 4;

        public MainForm(bool selfTest)
        {
            this.selfTest = selfTest;
            Text = "Market Kasa";
            Icon = AppIcon();
            StartPosition = FormStartPosition.CenterScreen;
            Size = new Size(1280, 840);
            MinimumSize = new Size(900, 600);
            Font = new Font("Segoe UI", 9.5f);
            if (selfTest)
            {
                ShowInTaskbar = false;
                Opacity = 0;
            }
            else
            {
                WindowState = FormWindowState.Maximized;
            }

            web = new WebView2();
            web.Dock = DockStyle.Fill;
            Controls.Add(web);

            var menu = new MenuStrip();
            var app = new ToolStripMenuItem("Market Kasa");
            app.DropDownItems.Add(Item("Yenile  (F5)", delegate { if (web.CoreWebView2 != null) web.Reload(); }));
            app.DropDownItems.Add(Item("Yazdır…  (Ctrl+P)", delegate { if (web.CoreWebView2 != null) web.CoreWebView2.ShowPrintUI(); }));
            app.DropDownItems.Add(new ToolStripSeparator());
            app.DropDownItems.Add(Item("Yakınlaştır  (Ctrl +)", delegate { web.ZoomFactor = Math.Min(2.0, web.ZoomFactor + 0.1); }));
            app.DropDownItems.Add(Item("Uzaklaştır  (Ctrl -)", delegate { web.ZoomFactor = Math.Max(0.5, web.ZoomFactor - 0.1); }));
            app.DropDownItems.Add(Item("Gerçek boyut  (Ctrl 0)", delegate { web.ZoomFactor = 1.0; }));
            app.DropDownItems.Add(new ToolStripSeparator());
            app.DropDownItems.Add(Item("Telefondan bağlanma…", delegate { ShowPhoneInfo(); }));
            app.DropDownItems.Add(Item("Tarayıcıda aç", delegate { OpenBrowser(web.Source != null ? web.Source.ToString() : Home); }));
            app.DropDownItems.Add(new ToolStripSeparator());
            app.DropDownItems.Add(Item("Programı tamamen kapat…", delegate { StopAndExit(); }));
            app.DropDownItems.Add(Item("Pencereyi kapat (program arka planda çalışır)", delegate { Close(); }));
            menu.Items.Add(app);
            var go = new ToolStripMenuItem("Git");
            go.DropDownItems.Add(Item("Kasa", delegate { Go("kasa"); }));
            go.DropDownItems.Add(Item("Panel", delegate { Go("panel"); }));
            go.DropDownItems.Add(Item("Yönetim Paneli", delegate { Go("yonetim"); }));
            go.DropDownItems.Add(new ToolStripSeparator());
            go.DropDownItems.Add(Item("Geri", delegate { if (web.CanGoBack) web.GoBack(); }));
            go.DropDownItems.Add(Item("İleri", delegate { if (web.CanGoForward) web.GoForward(); }));
            menu.Items.Add(go);
            MainMenuStrip = menu;
            Controls.Add(menu);

            Shown += delegate { InitWebView(); };
            if (selfTest)
            {
                var timeout = new System.Windows.Forms.Timer();
                timeout.Interval = 90000;
                timeout.Tick += delegate { Report("zaman aşımı"); SelfTestResult = 5; Close(); };
                timeout.Start();
            }
        }

        static ToolStripMenuItem Item(string text, EventHandler onClick)
        {
            var i = new ToolStripMenuItem(text);
            i.Click += onClick;
            return i;
        }

        void Go(string path)
        {
            if (web.CoreWebView2 != null) web.CoreWebView2.Navigate(Home + path);
        }

        public void BringToFrontNow()
        {
            if (WindowState == FormWindowState.Minimized) WindowState = FormWindowState.Maximized;
            Show();
            Activate();
            TopMost = true;
            TopMost = false;
        }

        async void InitWebView()
        {
            try
            {
                Directory.CreateDirectory(Root);
                var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Root, "webview"), null);
                await web.EnsureCoreWebView2Async(env);
            }
            catch (Exception e)
            {
                LauncherLog("WebView2 açılamadı: " + e);
                if (selfTest)
                {
                    Report("WebView2 açılamadı: " + e.Message);
                    SelfTestResult = 6;
                    Close();
                    return;
                }
                MessageBox.Show("Bu bilgisayarda Microsoft Edge WebView2 bileşeni bulunamadı; Market Kasa tarayıcıda açılacak.\n\nUygulama penceresi için Windows Update ile Microsoft Edge'i güncelleyin.",
                    "Market Kasa", MessageBoxButtons.OK, MessageBoxIcon.Information);
                OpenBrowser(Home);
                Close();
                return;
            }

            CoreWebView2 core = web.CoreWebView2;
            core.Settings.AreDevToolsEnabled = false;
            core.Settings.IsStatusBarEnabled = false;
            core.DocumentTitleChanged += delegate
            {
                Text = string.IsNullOrEmpty(core.DocumentTitle) ? "Market Kasa" : core.DocumentTitle;
            };
            // Dış bağlantılar normal tarayıcıda açılsın; uygulama sayfaları pencerede kalsın
            core.NavigationStarting += delegate (object s, CoreWebView2NavigationStartingEventArgs a)
            {
                if (!IsLocal(a.Uri)) { a.Cancel = true; OpenBrowser(a.Uri); }
            };
            core.NewWindowRequested += delegate (object s, CoreWebView2NewWindowRequestedEventArgs a)
            {
                if (!IsLocal(a.Uri)) { a.Handled = true; OpenBrowser(a.Uri); }
            };
            if (selfTest)
            {
                core.NavigationCompleted += async delegate (object s, CoreWebView2NavigationCompletedEventArgs a)
                {
                    if (!a.IsSuccess) { Report("sayfa yüklenemedi: " + a.WebErrorStatus); SelfTestResult = 7; Close(); return; }
                    string r = await core.ExecuteScriptAsync(
                        "!!(document.querySelector('[data-testid=login-tab-owner]') || document.querySelector('[data-testid=setup-name]'))");
                    Report("sayfa: " + core.Source + " → arayüz " + (r == "true" ? "çizildi" : "çizilemedi"));
                    SelfTestResult = r == "true" ? 0 : 8;
                    Close();
                };
            }
            core.Navigate(Home);
        }

        void ShowPhoneInfo()
        {
            string ip = LanAddress();
            MessageBox.Show(ip == null
                ? "Bu bilgisayar bir ağa bağlı görünmüyor."
                : "Telefon bu bilgisayarla aynı Wi-Fi'ye bağlıyken tarayıcısına şu adresi yazın:\n\nhttp://" + ip + ":" + Port + "/panel\n\nYönetici sekmesinden kullanıcı adı ve şifrenizle girin.",
                "Telefondan bağlanma", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }

        void StopAndExit()
        {
            DialogResult r = MessageBox.Show(
                "Program tamamen kapatılsın mı?\n\nKapatınca kasa ve panel çalışmaz, telefondan da bağlanılamaz. Tekrar açmak için Market Kasa simgesine tıklayın.",
                "Market Kasa", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2);
            if (r != DialogResult.Yes) return;
            Cursor = Cursors.WaitCursor;
            Stop();
            Close();
        }
    }

    static bool IsLocal(string uri)
    {
        try
        {
            var u = new Uri(uri);
            if (u.Scheme == "about" || u.Scheme == "data" || u.Scheme == "blob") return true;
            return u.Host == "localhost" || u.Host == "127.0.0.1";
        }
        catch { return true; }
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

    static void Report(string text)
    {
        Console.WriteLine(text);
        LauncherLog("selftest: " + text);
    }

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

    // ------------------------------------------------------------------ başlatılıyor penceresi
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
            hint.Text = "İlk açılışta bir dakika kadar sürebilir. Hazır olunca program penceresi açılacak.";
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
}
