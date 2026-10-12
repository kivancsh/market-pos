; Optiva — Windows kurulum betiği (Inno Setup 6).
; GitHub Actions'ta derlenir: .github/workflows/windows-installer.yml
; Kurulum yönetici izni istemez; program kullanıcının kendi klasörüne kurulur.
; Satış ve ürün bilgileri ayrı tutulur (%LOCALAPPDATA%\Optiva) ve kaldırırken SİLİNMEZ.

#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppName "Optiva"
#define AppExe "Optiva.exe"

[Setup]
AppId={{6E3C2B8A-4F1D-4C55-9C1E-7A3B2D8F4E21}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Optiva
VersionInfoDescription=Optiva Kurulum
DefaultDirName={localappdata}\Programs\Optiva
DefaultGroupName=Optiva
UsePreviousGroup=no
DisableProgramGroupPage=yes
DisableDirPage=auto
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\build\dist
OutputBaseFilename=Optiva-Setup
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
turkish.FinishedLabel=Optiva bilgisayarınıza kuruldu. Masaüstündeki Optiva simgesine çift tıklayarak açabilirsiniz.%n%nİlk açılışta Windows Güvenlik Duvarı izin isterse "Erişime izin ver" deyin (telefondan takip için gerekir).

[Tasks]
Name: "desktopicon"; Description: "Masaüstüne Optiva simgesi koy"; GroupDescription: "Ek simgeler:"

[InstallDelete]
; Güncellemede eski program dosyalarını temizle (bilgiler başka klasörde, etkilenmez)
Type: filesandordirs; Name: "{app}\app"
; Ad değişikliği (Market Kasa → Optiva): eski program dosyası ve kısayollar
Type: files; Name: "{app}\Market Kasa.exe"
Type: files; Name: "{autodesktop}\Market Kasa.lnk"
Type: filesandordirs; Name: "{userprograms}\Market Kasa"

[Files]
Source: "..\build\win\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
; Eski "Market Kasa" bilgi klasörü varsa yenisi açılmaz: program ilk açılışta onu bütün hâlinde Optiva'ya taşır
Name: "{localappdata}\Optiva\data"; Flags: uninsneveruninstall; Check: NoLegacyData
Name: "{localappdata}\Optiva\backups"; Flags: uninsneveruninstall; Check: NoLegacyData

[Icons]
Name: "{group}\Optiva"; Filename: "{app}\{#AppExe}"
Name: "{group}\Yönetici Şifresi Sıfırla"; Filename: "{app}\Yonetici Sifresi Sifirla.cmd"; IconFilename: "{app}\MarketKasa.ico"
Name: "{group}\Yedek Al"; Filename: "{app}\Yedek Al.cmd"; IconFilename: "{app}\MarketKasa.ico"
Name: "{group}\Yedekler klasörü"; Filename: "{localappdata}\Optiva\backups"
Name: "{group}\Optiva'yı kaldır"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Optiva"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Optiva'yı şimdi aç"; Flags: nowait postinstall skipifsilent
; Programın içinden güncellemede (sessiz kurulum, /relaunch=1): bitince programı yeniden aç
Filename: "{app}\{#AppExe}"; Flags: nowait; Check: RelaunchAfterUpdate

[UninstallRun]
Filename: "{app}\{#AppExe}"; Parameters: "--stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopServer"

[Code]
// Eski adla (Market Kasa) kaydedilmiş bilgiler var ve henüz taşınmamış mı
function NoLegacyData: Boolean;
begin
  Result := not (DirExists(ExpandConstant('{localappdata}\Market Kasa')) and not DirExists(ExpandConstant('{localappdata}\Optiva')));
end;

// Ayarlar → Güncelle ile başlatıldı mı (Optiva.exe kurulumu /relaunch=1 ile çalıştırır)
function RelaunchAfterUpdate: Boolean;
begin
  Result := ExpandConstant('{param:relaunch|0}') = '1';
end;

// Güncelleme sırasında çalışan programı önce durdur (dosyalar kilitli kalmasın)
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Exe: String;
  Code: Integer;
  I: Integer;
begin
  Result := '';
  // Programın içinden güncellemede pencere kendini kapatıyor; kapanmasını bekle (en fazla 30 sn)
  if RelaunchAfterUpdate then
  begin
    I := 0;
    while CheckForMutexes('MarketKasaLauncher') and (I < 60) do
    begin
      Sleep(500);
      I := I + 1;
    end;
  end;
  Exe := ExpandConstant('{app}\{#AppExe}');
  // Ad değişikliğinden önceki sürüm: program dosyası eski adla
  if not FileExists(Exe) then
    Exe := ExpandConstant('{app}\Market Kasa.exe');
  if FileExists(Exe) then
    Exec(Exe, '--stop', '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and (not UninstallSilent) then
    MsgBox('Optiva kaldırıldı.' + #13#10#13#10 +
      'Satış, ürün ve yedek bilgileriniz SİLİNMEDİ; şu klasörde duruyor:' + #13#10 +
      ExpandConstant('{localappdata}\Optiva') + #13#10#13#10 +
      'Programı yeniden kurarsanız bilgileriniz kaldığı yerden devam eder.', mbInformation, MB_OK);
end;
