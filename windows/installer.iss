; Market Kasa — Windows kurulum betiği (Inno Setup 6).
; GitHub Actions'ta derlenir: .github/workflows/windows-installer.yml
; Kurulum yönetici izni istemez; program kullanıcının kendi klasörüne kurulur.
; Satış ve ürün bilgileri ayrı tutulur (%LOCALAPPDATA%\Market Kasa) ve kaldırırken SİLİNMEZ.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppName "Market Kasa"
#define AppExe "Market Kasa.exe"

[Setup]
AppId={{6E3C2B8A-4F1D-4C55-9C1E-7A3B2D8F4E21}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Market Kasa
VersionInfoDescription=Market Kasa Kurulum
DefaultDirName={localappdata}\Programs\Market Kasa
DefaultGroupName=Market Kasa
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\build\dist
OutputBaseFilename=Market-Kasa-Setup
SetupIconFile=MarketKasa.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ShowLanguageDialog=no
CloseApplications=no

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Messages]
turkish.FinishedLabel=Market Kasa bilgisayarınıza kuruldu. Masaüstündeki Market Kasa simgesine çift tıklayarak açabilirsiniz.%n%nİlk açılışta Windows Güvenlik Duvarı izin isterse "Erişime izin ver" deyin (telefondan takip için gerekir).

[Tasks]
Name: "desktopicon"; Description: "Masaüstüne Market Kasa simgesi koy"; GroupDescription: "Ek simgeler:"

[InstallDelete]
; Güncellemede eski program dosyalarını temizle (bilgiler başka klasörde, etkilenmez)
Type: filesandordirs; Name: "{app}\app"

[Files]
Source: "..\build\win\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{localappdata}\Market Kasa\data"; Flags: uninsneveruninstall
Name: "{localappdata}\Market Kasa\backups"; Flags: uninsneveruninstall

[Icons]
Name: "{group}\Market Kasa"; Filename: "{app}\{#AppExe}"
Name: "{group}\Yönetici Şifresi Sıfırla"; Filename: "{app}\Yonetici Sifresi Sifirla.cmd"; IconFilename: "{app}\MarketKasa.ico"
Name: "{group}\Yedek Al"; Filename: "{app}\Yedek Al.cmd"; IconFilename: "{app}\MarketKasa.ico"
Name: "{group}\Yedekler klasörü"; Filename: "{localappdata}\Market Kasa\backups"
Name: "{group}\Market Kasa'yı kaldır"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Market Kasa"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Market Kasa'yı şimdi aç"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\{#AppExe}"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopServer"

[Code]
// Güncelleme sırasında çalışan programı önce durdur (dosyalar kilitli kalmasın)
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Exe: String;
  Code: Integer;
begin
  Result := '';
  Exe := ExpandConstant('{app}\{#AppExe}');
  if FileExists(Exe) then
    Exec(Exe, '--stop', '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and (not UninstallSilent) then
    MsgBox('Market Kasa kaldırıldı.' + #13#10#13#10 +
      'Satış, ürün ve yedek bilgileriniz SİLİNMEDİ; şu klasörde duruyor:' + #13#10 +
      ExpandConstant('{localappdata}\Market Kasa') + #13#10#13#10 +
      'Programı yeniden kurarsanız bilgileriniz kaldığı yerden devam eder.', mbInformation, MB_OK);
end;
