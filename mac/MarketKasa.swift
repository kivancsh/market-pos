// Optiva — Mac uygulaması: programı tarayıcı yerine kendi penceresinde açar.
// Safari'nin motoru (WebKit/WKWebView) kullanılır; ek bir şey kurulmaz.
// Sunucu yine arka planda çalışır (scripts/service.sh): pencereyi kapatmak programı kapatmaz,
// telefondan takip sürer. Tamamen kapatmak için menü: Optiva → Programı tamamen kapat.
//
// Derleme: mac/build.sh (evrensel ikili: Apple Silicon + Intel). Uygulama paketi: scripts/create-app.sh
import Cocoa
import WebKit

// MARKET_KASA_PORT: sadece test için (ayrı demo sunucusuna bağlanmak); normalde 3000.
let testPort = Int(ProcessInfo.processInfo.environment["MARKET_KASA_PORT"] ?? "")
let port = testPort ?? 3000
let homeURL = URL(string: "http://localhost:\(port)/")!
// --selftest: pencere göstermeden temel işlevleri dener (geliştirme/test için)
let selfTest = CommandLine.arguments.contains("--selftest")

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate,
  WKScriptMessageHandler, WKDownloadDelegate
{
  var window: NSWindow!
  var webView: WKWebView!
  var loadingView: NSView!
  var loadingLabel: NSTextField!
  var spinner: NSProgressIndicator!
  var popups: [NSWindow] = []
  var downloadTargets: [ObjectIdentifier: URL] = [:]
  var titleObserver: NSKeyValueObservation?
  var starting = false

  // ------------------------------------------------------------------ proje klasörü ve servis
  lazy var projectDir: String? = {
    guard let url = Bundle.main.url(forResource: "project-path", withExtension: "txt"),
      let s = try? String(contentsOf: url, encoding: .utf8)
    else { return nil }
    return s.trimmingCharacters(in: .whitespacesAndNewlines)
  }()

  var serviceScript: String? {
    guard let dir = projectDir else { return nil }
    let p = (dir as NSString).appendingPathComponent("scripts/service.sh")
    return FileManager.default.fileExists(atPath: p) ? p : nil
  }

  func runService(_ arg: String, completion: @escaping (Int32, String) -> Void) {
    guard let svc = serviceScript else {
      completion(-1, "")
      return
    }
    let p = Process()
    p.executableURL = URL(fileURLWithPath: "/bin/bash")
    p.arguments = [svc, arg]
    let pipe = Pipe()
    p.standardOutput = pipe
    p.standardError = FileHandle.nullDevice
    p.terminationHandler = { proc in
      let out = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
      DispatchQueue.main.async { completion(proc.terminationStatus, out.trimmingCharacters(in: .whitespacesAndNewlines)) }
    }
    do { try p.run() } catch { completion(-1, "") }
  }

  func checkRunning(_ completion: @escaping (Bool) -> Void) {
    var req = URLRequest(url: URL(string: "http://127.0.0.1:\(port)/api/auth/me")!)
    req.timeoutInterval = 2
    req.cachePolicy = .reloadIgnoringLocalCacheData
    URLSession.shared.dataTask(with: req) { data, _, _ in
      let ok = data.flatMap { String(data: $0, encoding: .utf8) }?.contains("needsSetup") ?? false
      DispatchQueue.main.async { completion(ok) }
    }.resume()
  }

  // ------------------------------------------------------------------ açılış
  func applicationDidFinishLaunching(_ notification: Notification) {
    buildMenu()
    buildWindow()
    if selfTest {
      runSelfTest()
      return
    }
    window.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
    ensureServerThenLoad()
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

  func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    if !flag { window.makeKeyAndOrderFront(nil) }
    return true
  }

  func ensureServerThenLoad() {
    if starting { return }
    guard serviceScript != nil else {
      fatalAlert(
        "Optiva klasörü bulunamadı.",
        "Klasörü taşıdıysanız, klasördeki 'Kurulum' dosyasına tekrar çift tıklayın.\n\n\(projectDir ?? "")")
      return
    }
    showLoading("Optiva başlatılıyor…")
    checkRunning { [weak self] running in
      guard let self else { return }
      if running {
        self.loadHome()
        return
      }
      if testPort != nil {
        self.fatalAlert("Test sunucusu çalışmıyor (port \(port)).", "")
        return
      }
      self.starting = true
      self.showLoading("Optiva başlatılıyor…\nİlk açılışta ya da güncellemeden sonra birkaç dakika sürebilir.")
      self.runService("start") { code, _ in
        self.starting = false
        if code == 0 {
          self.loadHome()
          return
        }
        if code == 10 {
          NSWorkspace.shared.open(URL(string: "https://nodejs.org")!)
          self.fatalAlert(
            "Node.js bulunamadı.", "Açılan sayfadan LTS sürümünü kurun, sonra klasördeki 'Kurulum' dosyasına çift tıklayın.")
          return
        }
        let reasons: [Int32: String] = [
          11: "paketler kurulamadı (internet bağlantısını kontrol edin)", 12: "program derlenemedi",
          13: "program açılırken kapandı", 14: "program zamanında yanıt vermedi",
        ]
        self.fatalAlert(
          "Optiva başlatılamadı: \(reasons[code] ?? "bilinmeyen bir hata").",
          "Ayrıntılar: \(self.projectDir ?? "")/data/logs")
      }
    }
  }

  func loadHome() {
    hideLoading()
    if webView.url == nil || webView.url?.host == nil { webView.load(URLRequest(url: homeURL)) } else { webView.reload() }
  }

  // ------------------------------------------------------------------ pencere
  func makeConfiguration() -> WKWebViewConfiguration {
    let config = WKWebViewConfiguration()
    let ucc = WKUserContentController()
    // window.print() → Mac yazdırma penceresi (WKWebView bunu kendiliğinden yapmaz)
    ucc.addUserScript(
      WKUserScript(
        source: "window.print = function () { window.webkit.messageHandlers.marketKasa.postMessage({ type: 'print' }); };",
        injectionTime: .atDocumentStart, forMainFrameOnly: false))
    ucc.add(self, name: "marketKasa")
    config.userContentController = ucc
    config.websiteDataStore = selfTest ? .nonPersistent() : .default()
    config.mediaTypesRequiringUserActionForPlayback = []
    config.preferences.javaScriptCanOpenWindowsAutomatically = true
    return config
  }

  func buildWindow() {
    window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
      styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
    window.title = "Optiva"
    window.minSize = NSSize(width: 900, height: 600)
    window.center()
    window.setFrameAutosaveName("MarketKasaMain")
    window.delegate = self
    window.isReleasedWhenClosed = false

    webView = WKWebView(frame: window.contentView!.bounds, configuration: makeConfiguration())
    webView.autoresizingMask = [.width, .height]
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.allowsBackForwardNavigationGestures = true
    webView.pageZoom = CGFloat(max(0.5, min(2.0, UserDefaults.standard.double(forKey: "zoom").nonZero ?? 1.0)))
    window.contentView!.addSubview(webView)
    titleObserver = webView.observe(\.title, options: [.new]) { [weak self] wv, _ in
      let t = wv.title ?? ""
      self?.window.title = t.isEmpty ? "Optiva" : t
    }

    loadingView = NSView(frame: window.contentView!.bounds)
    loadingView.autoresizingMask = [.width, .height]
    loadingView.wantsLayer = true
    loadingView.layer?.backgroundColor = NSColor(calibratedRed: 0.95, green: 0.96, blue: 0.97, alpha: 1).cgColor
    let icon = NSImageView(image: NSApp.applicationIconImage)
    icon.translatesAutoresizingMaskIntoConstraints = false
    spinner = NSProgressIndicator()
    spinner.style = .spinning
    spinner.translatesAutoresizingMaskIntoConstraints = false
    loadingLabel = NSTextField(wrappingLabelWithString: "")
    loadingLabel.alignment = .center
    loadingLabel.font = .systemFont(ofSize: 15, weight: .medium)
    loadingLabel.textColor = .darkGray
    loadingLabel.translatesAutoresizingMaskIntoConstraints = false
    for v in [icon, spinner!, loadingLabel!] as [NSView] { loadingView.addSubview(v) }
    NSLayoutConstraint.activate([
      icon.centerXAnchor.constraint(equalTo: loadingView.centerXAnchor),
      icon.centerYAnchor.constraint(equalTo: loadingView.centerYAnchor, constant: -70),
      icon.widthAnchor.constraint(equalToConstant: 96), icon.heightAnchor.constraint(equalToConstant: 96),
      spinner.centerXAnchor.constraint(equalTo: loadingView.centerXAnchor),
      spinner.topAnchor.constraint(equalTo: icon.bottomAnchor, constant: 20),
      loadingLabel.centerXAnchor.constraint(equalTo: loadingView.centerXAnchor),
      loadingLabel.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 16),
      loadingLabel.widthAnchor.constraint(equalToConstant: 460),
    ])
    window.contentView!.addSubview(loadingView)
  }

  func showLoading(_ text: String) {
    loadingLabel.stringValue = text
    loadingView.isHidden = false
    spinner.startAnimation(nil)
  }

  func hideLoading() {
    spinner.stopAnimation(nil)
    loadingView.isHidden = true
  }

  func fatalAlert(_ title: String, _ text: String) {
    hideLoading()
    let a = NSAlert()
    a.alertStyle = .critical
    a.messageText = title
    a.informativeText = text
    a.addButton(withTitle: "Tamam")
    a.runModal()
    NSApp.terminate(nil)
  }

  // ------------------------------------------------------------------ menü
  func buildMenu() {
    let main = NSMenu()
    func item(_ title: String, _ action: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command)
      -> NSMenuItem
    {
      let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
      i.keyEquivalentModifierMask = mods
      return i
    }
    func submenu(_ title: String, _ items: [NSMenuItem]) {
      let top = NSMenuItem()
      let m = NSMenu(title: title)
      items.forEach { m.addItem($0) }
      top.submenu = m
      main.addItem(top)
    }
    submenu(
      "Optiva",
      [
        item("Optiva Hakkında", #selector(NSApplication.orderFrontStandardAboutPanel(_:))),
        .separator(),
        item("Telefondan bağlanma…", #selector(showPhoneInfo)),
        item("Tarayıcıda aç", #selector(openInBrowser)),
        .separator(),
        item("Programı tamamen kapat…", #selector(stopServerAndQuit)),
        .separator(),
        item("Optiva'yı gizle", #selector(NSApplication.hide(_:)), "h"),
        item("Diğerlerini gizle", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
        item("Tümünü göster", #selector(NSApplication.unhideAllApplications(_:))),
        .separator(),
        item("Pencereyi kapat (program arka planda çalışır)", #selector(NSApplication.terminate(_:)), "q"),
      ])
    submenu(
      "Dosya",
      [
        item("Yazdır…", #selector(printPage), "p"),
        .separator(),
        item("Pencereyi kapat", #selector(NSWindow.performClose(_:)), "w"),
      ])
    submenu(
      "Düzen",
      [
        item("Geri al", Selector(("undo:")), "z"),
        item("Yinele", Selector(("redo:")), "z", [.command, .shift]),
        .separator(),
        item("Kes", #selector(NSText.cut(_:)), "x"),
        item("Kopyala", #selector(NSText.copy(_:)), "c"),
        item("Yapıştır", #selector(NSText.paste(_:)), "v"),
        item("Tümünü seç", #selector(NSText.selectAll(_:)), "a"),
      ])
    submenu(
      "Görünüm",
      [
        item("Yenile", #selector(reloadPage), "r"),
        .separator(),
        item("Yakınlaştır", #selector(zoomIn), "+"),
        item("Uzaklaştır", #selector(zoomOut), "-"),
        item("Gerçek boyut", #selector(zoomReset), "0"),
        .separator(),
        item("Tam ekran", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
      ])
    submenu(
      "Git",
      [
        item("Geri", #selector(goBack), "["),
        item("İleri", #selector(goForward), "]"),
        .separator(),
        item("Kasa", #selector(goKasa), "1"),
        item("Panel", #selector(goPanel), "2"),
        item("Yönetici Paneli", #selector(goAdmin), "3"),
      ])
    let windowMenu = NSMenu(title: "Pencere")
    windowMenu.addItem(item("Küçült", #selector(NSWindow.performMiniaturize(_:)), "m"))
    windowMenu.addItem(item("Büyüt", #selector(NSWindow.performZoom(_:))))
    let wtop = NSMenuItem()
    wtop.submenu = windowMenu
    main.addItem(wtop)
    NSApp.windowsMenu = windowMenu
    NSApp.mainMenu = main
  }

  var activeWebView: WKWebView {
    if let w = NSApp.keyWindow, let wv = w.contentView?.subviews.first(where: { $0 is WKWebView }) as? WKWebView {
      return wv
    }
    return webView
  }

  @objc func reloadPage() { activeWebView.reload() }
  @objc func goBack() { activeWebView.goBack() }
  @objc func goForward() { activeWebView.goForward() }
  @objc func goKasa() { webView.load(URLRequest(url: URL(string: "/kasa", relativeTo: homeURL)!)) }
  @objc func goPanel() { webView.load(URLRequest(url: URL(string: "/panel", relativeTo: homeURL)!)) }
  @objc func goAdmin() { webView.load(URLRequest(url: URL(string: "/yonetim", relativeTo: homeURL)!)) }
  @objc func printPage() { printWebView(activeWebView) }
  @objc func openInBrowser() { NSWorkspace.shared.open(webView.url ?? homeURL) }

  func setZoom(_ z: CGFloat) {
    let v = max(0.5, min(2.0, z))
    webView.pageZoom = v
    UserDefaults.standard.set(Double(v), forKey: "zoom")
  }
  @objc func zoomIn() { setZoom(webView.pageZoom + 0.1) }
  @objc func zoomOut() { setZoom(webView.pageZoom - 0.1) }
  @objc func zoomReset() { setZoom(1.0) }

  @objc func showPhoneInfo() {
    runService("ip") { _, ip in
      let a = NSAlert()
      a.messageText = "Telefondan bağlanma"
      a.informativeText =
        ip.isEmpty
        ? "Bu bilgisayar bir Wi-Fi ağına bağlı görünmüyor."
        : "Telefon bu bilgisayarla aynı Wi-Fi'ye bağlıyken tarayıcısına şu adresi yazın:\n\nhttp://\(ip):\(port)/panel\n\nYönetici sekmesinden kullanıcı adı ve şifrenizle girin."
      a.addButton(withTitle: "Tamam")
      a.beginSheetModal(for: self.window)
    }
  }

  @objc func stopServerAndQuit() {
    let a = NSAlert()
    a.alertStyle = .warning
    a.messageText = "Program tamamen kapatılsın mı?"
    a.informativeText =
      "Kapatınca kasa ve panel çalışmaz, telefondan da bağlanılamaz. Tekrar açmak için Optiva simgesine tıklayın."
    a.addButton(withTitle: "Kapat")
    a.addButton(withTitle: "Vazgeç")
    a.beginSheetModal(for: window) { r in
      guard r == .alertFirstButtonReturn else { return }
      self.showLoading("Program kapatılıyor…")
      self.runService("stop") { _, _ in NSApp.terminate(nil) }
    }
  }

  // ------------------------------------------------------------------ yazdırma
  func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], body["type"] as? String == "print", let wv = message.webView
    else { return }
    DispatchQueue.main.async { self.printWebView(wv) }
  }

  func printWebView(_ wv: WKWebView) {
    let info = (NSPrintInfo.shared.copy() as! NSPrintInfo)
    info.topMargin = 0
    info.bottomMargin = 0
    info.leftMargin = 0
    info.rightMargin = 0
    info.horizontalPagination = .automatic
    info.verticalPagination = .automatic
    info.isHorizontallyCentered = false
    info.isVerticallyCentered = false
    let op = wv.printOperation(with: info)
    op.view?.frame = wv.bounds
    op.showsPrintPanel = true
    op.showsProgressPanel = true
    if let w = wv.window {
      op.runModal(for: w, delegate: nil, didRun: nil, contextInfo: nil)
    } else {
      op.run()
    }
  }

  // ------------------------------------------------------------------ gezinti, indirme
  func isLocal(_ url: URL?) -> Bool {
    guard let url, let host = url.host else { return url?.scheme == "about" || url?.scheme == "blob" }
    return host == "localhost" || host == "127.0.0.1"
  }

  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
  ) {
    if action.shouldPerformDownload {
      decisionHandler(.download)
      return
    }
    if let url = action.request.url, !isLocal(url), url.scheme == "http" || url.scheme == "https" || url.scheme == "mailto"
    {
      NSWorkspace.shared.open(url)  // dış bağlantılar normal tarayıcıda
      decisionHandler(.cancel)
      return
    }
    decisionHandler(.allow)
  }

  func webView(
    _ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
    decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
  ) {
    let disposition = (response.response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Disposition") ?? ""
    if disposition.lowercased().contains("attachment") || !response.canShowMIMEType {
      decisionHandler(.download)
    } else {
      decisionHandler(.allow)
    }
  }

  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
    download.delegate = self
  }

  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
    download.delegate = self
  }

  func download(
    _ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
    completionHandler: @escaping (URL?) -> Void
  ) {
    let dir =
      selfTest
      ? FileManager.default.temporaryDirectory
      : FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first!
    let base = (suggestedFilename as NSString).deletingPathExtension
    let ext = (suggestedFilename as NSString).pathExtension
    var target = dir.appendingPathComponent(suggestedFilename)
    var n = 2
    while FileManager.default.fileExists(atPath: target.path) {
      target = dir.appendingPathComponent(ext.isEmpty ? "\(base) (\(n))" : "\(base) (\(n)).\(ext)")
      n += 1
    }
    downloadTargets[ObjectIdentifier(download)] = target
    completionHandler(target)
  }

  func downloadDidFinish(_ download: WKDownload) {
    guard let url = downloadTargets.removeValue(forKey: ObjectIdentifier(download)) else { return }
    if selfTest {
      onDownload?(url)
      return
    }
    let a = NSAlert()
    a.messageText = "Dosya indirildi"
    a.informativeText = "\(url.lastPathComponent)\nİndirilenler klasörüne kaydedildi."
    a.addButton(withTitle: "Aç")
    a.addButton(withTitle: "Finder'da göster")
    a.addButton(withTitle: "Tamam")
    a.beginSheetModal(for: window) { r in
      if r == .alertFirstButtonReturn { NSWorkspace.shared.open(url) }
      if r == .alertSecondButtonReturn { NSWorkspace.shared.activateFileViewerSelecting([url]) }
    }
  }

  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
    downloadTargets.removeValue(forKey: ObjectIdentifier(download))
    let a = NSAlert(error: error)
    a.beginSheetModal(for: window)
  }

  // Sunucu kapandıysa (ör. bilgisayar uykudan çıktı) tekrar başlat
  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if webView == self.webView, let f = onFinish {
      onFinish = nil
      f()
    }
  }

  // ------------------------------------------------------------------ kendi kendini sınama (--selftest)
  var onFinish: (() -> Void)?
  var onDownload: ((URL) -> Void)?
  var failures = 0

  func check(_ name: String, _ ok: Bool, _ detail: String = "") {
    print((ok ? "✓ " : "✗ ") + name + (detail.isEmpty ? "" : " — \(detail)"))
    if !ok { failures += 1 }
  }

  func load(_ path: String, then: @escaping () -> Void) {
    onFinish = then
    webView.load(URLRequest(url: URL(string: path, relativeTo: homeURL)!))
  }

  func js(_ code: String, then: @escaping (Any?) -> Void) {
    webView.callAsyncJavaScript(code, arguments: [:], in: nil, in: .page) { r in
      switch r {
      case .success(let v): then(v)
      case .failure(let e): then("HATA: \(e.localizedDescription)")
      }
    }
  }

  func finishSelfTest() {
    print(failures == 0 ? "SONUÇ: tüm denemeler geçti" : "SONUÇ: \(failures) deneme başarısız")
    fflush(stdout)
    exit(failures == 0 ? 0 : 1)
  }

  func runSelfTest() {
    let env = ProcessInfo.processInfo.environment
    let user = env["MARKET_KASA_TEST_USER"] ?? ""
    let pass = env["MARKET_KASA_TEST_PASS"] ?? ""
    DispatchQueue.main.asyncAfter(deadline: .now() + 90) {
      self.check("zaman aşımı olmadan bitti", false)
      self.finishSelfTest()
    }
    load("/") {
      self.check("ana sayfa yüklendi → giriş ekranı", self.webView.url?.path == "/login", self.webView.url?.path ?? "")
      self.js("return !!document.querySelector('[data-testid=login-tab-owner]')") { v in
        self.check("giriş ekranı çizildi (JavaScript çalışıyor)", (v as? Bool) == true)
        self.js("return window.print.toString().includes('marketKasa')") { v in
          self.check("yazdırma Mac yazdırma penceresine bağlı", (v as? Bool) == true)
          let body = "{\"mode\":\"owner\",\"username\":\"\(user)\",\"password\":\"\(pass)\"}"
          self.js(
            "const r = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: \(String(reflecting: body))}); return r.status"
          ) { v in
            self.check("yönetici girişi (oturum çerezi)", (v as? NSNumber)?.intValue == 200, "\(v ?? "")")
            self.load("/kasa") {
              self.js(
                "for (let i = 0; i < 50; i++) { if (document.querySelector('[data-testid=barcode-input]')) return true; await new Promise(r => setTimeout(r, 100)); } return false"
              ) { v in
                self.check("kasa ekranı açıldı", (v as? Bool) == true, self.webView.url?.path ?? "")
                self.onDownload = { url in
                  let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
                  self.check("Excel raporu indirildi", size > 1000, "\(url.lastPathComponent), \(size) bayt")
                  try? FileManager.default.removeItem(at: url)
                  self.js("window.open('/fis/1', 'fis', 'width=420,height=700'); return true") { _ in
                    DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                      let wv = self.popups.first?.contentView?.subviews.first as? WKWebView
                      self.check(
                        "bilgi fişi ayrı pencerede açıldı", self.popups.count == 1 && (wv?.url?.path.hasPrefix("/fis/") ?? false),
                        wv?.url?.path ?? "pencere yok")
                      self.finishSelfTest()
                    }
                  }
                }
                self.webView.load(URLRequest(url: URL(string: "/api/reports/daily/export", relativeTo: homeURL)!))
              }
            }
          }
        }
      }
    }
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    let code = (error as NSError).code
    if webView == self.webView,
      [NSURLErrorCannotConnectToHost, NSURLErrorNetworkConnectionLost, NSURLErrorTimedOut].contains(code)
    {
      ensureServerThenLoad()
    }
  }

  // ------------------------------------------------------------------ açılır pencereler (bilgi fişi)
  func webView(
    _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction,
    windowFeatures: WKWindowFeatures
  ) -> WKWebView? {
    if let url = action.request.url, !isLocal(url) {
      NSWorkspace.shared.open(url)
      return nil
    }
    let w = CGFloat(windowFeatures.width?.doubleValue ?? 480)
    let h = CGFloat(windowFeatures.height?.doubleValue ?? 720)
    let win = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: w, height: h), styleMask: [.titled, .closable, .resizable, .miniaturizable],
      backing: .buffered, defer: false)
    win.isReleasedWhenClosed = false
    win.title = "Optiva"
    win.delegate = self
    let wv = WKWebView(frame: win.contentView!.bounds, configuration: configuration)
    wv.autoresizingMask = [.width, .height]
    wv.navigationDelegate = self
    wv.uiDelegate = self
    win.contentView!.addSubview(wv)
    win.cascadeTopLeft(from: NSPoint(x: window.frame.minX + 40, y: window.frame.maxY - 40))
    if !selfTest { win.makeKeyAndOrderFront(nil) }
    popups.append(win)
    return wv
  }

  func webViewDidClose(_ webView: WKWebView) {
    webView.window?.close()
  }

  func windowWillClose(_ notification: Notification) {
    if let w = notification.object as? NSWindow { popups.removeAll { $0 === w } }
  }

  // ------------------------------------------------------------------ JavaScript pencereleri (alert / confirm / prompt)
  func webView(
    _ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping () -> Void
  ) {
    let a = NSAlert()
    a.messageText = message
    a.addButton(withTitle: "Tamam")
    a.runModal()
    completionHandler()
  }

  func webView(
    _ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping (Bool) -> Void
  ) {
    let a = NSAlert()
    a.messageText = message
    a.addButton(withTitle: "Tamam")
    a.addButton(withTitle: "Vazgeç")
    completionHandler(a.runModal() == .alertFirstButtonReturn)
  }

  func webView(
    _ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
    initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void
  ) {
    let a = NSAlert()
    a.messageText = prompt
    let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
    field.stringValue = defaultText ?? ""
    a.accessoryView = field
    a.addButton(withTitle: "Tamam")
    a.addButton(withTitle: "Vazgeç")
    a.window.initialFirstResponder = field
    completionHandler(a.runModal() == .alertFirstButtonReturn ? field.stringValue : nil)
  }

  // Dosya seçme (Excel'den ürün aktarma)
  func webView(
    _ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping ([URL]?) -> Void
  ) {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.canChooseDirectories = false
    panel.canChooseFiles = true
    panel.beginSheetModal(for: webView.window ?? window) { r in completionHandler(r == .OK ? panel.urls : nil) }
  }
}

extension Double {
  var nonZero: Double? { self == 0 ? nil : self }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
