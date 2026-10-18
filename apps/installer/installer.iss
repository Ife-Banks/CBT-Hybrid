; Inno Setup script for the School CBT exam server.
; Spec: docs/CBT-04-Build-Specification.md section 6.3.
;
; Build the staging tree first, then compile:
;   pnpm --filter @cbt/installer package:win
;   pnpm --filter @cbt/installer compile
;
; `staging/` must contain node.exe, app/, SchoolCBT.exe (WinSW), SchoolCBT.xml,
; tools/ and VERSION.txt. See README.md.

#define AppName "School CBT Exam Server"
#define AppPublisher "School CBT"
#define AppExeName "SchoolCBT.exe"
#define StageDir SourcePath + "staging"
#define AppVersion FileExists(StageDir + "\VERSION.txt") ? Trim(FileRead(FileOpen(StageDir + "\VERSION.txt"))) : "0.0.0"
#define DefaultPort 8080

[Setup]
AppId={{8E4D2C1A-7B3F-4A6E-9C2D-5F1B8A0E6D34}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\SchoolCBT
DisableProgramGroupPage=yes
DisableDirPage=no
OutputDir=output
OutputBaseFilename=SchoolCBT-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
; Refuse anything older than Windows 10, 64-bit (section 6.3 step 1).
MinVersion=10.0
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayName={#AppName}
; Code signing (section 6.5): configure SignTool and uncomment to sign the
; installer and the service wrapper. Unsigned builds work but show SmartScreen.
;SignTool=schoolcbt

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
english.InstallingService=Installing the exam server service...
english.StartingService=Starting the exam server service...

[Tasks]
Name: "firewall"; Description: "Allow exam PCs on the local network (firewall rule scoped to this subnet)"; GroupDescription: "Windows settings:"
Name: "powersettings"; Description: "Disable sleep and hibernate so the PC stays reachable"; GroupDescription: "Windows settings:"
Name: "shortcut"; Description: "Create the lab PC shortcut files"; GroupDescription: "Lab PCs:"

[Files]
Source: "{#StageDir}\node.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\VERSION.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\SchoolCBT.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\SchoolCBT.xml"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StageDir}\tools\*"; DestDir: "{app}\tools"; Flags: ignoreversion

[Dirs]
; Make sure the app folder exists even if a future build ships no static files.
Name: "{app}\app"

[Run]
; Service wrapper: register and start (files are in place by now).
Filename: "{app}\{#AppExeName}"; Parameters: "install"; StatusMsg: "{cm:InstallingService}"; Flags: runhidden waituntilterminated
Filename: "{app}\{#AppExeName}"; Parameters: "start"; StatusMsg: "{cm:StartingService}"; Flags: runhidden waituntilterminated

; Windows settings (section 6.3 steps 5 and 6).
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\tools\add-firewall-rule.ps1"" -Port {code:GetPort}"; StatusMsg: "Adding firewall rule..."; Flags: runhidden waituntilterminated; Tasks: firewall
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\tools\set-power-settings.ps1"""; StatusMsg: "Applying power settings..."; Flags: runhidden waituntilterminated; Tasks: powersettings

; Lab PC shortcut files (section 6.6).
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\tools\write-lab-shortcut.ps1"" -Port {code:GetPort} -OutputDirectory ""{app}\lab"""; StatusMsg: "Writing lab shortcut files..."; Flags: runhidden waituntilterminated; Tasks: shortcut

; First-run page (section 6.3 step 8).
Filename: "{code:GetServerUrl}/setup"; Description: "Open the first-run setup page"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "{app}\{#AppExeName}"; Parameters: "stop"; Flags: runhidden waituntilterminated; RunOnceId: "StopService"
Filename: "{app}\{#AppExeName}"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveService"
Filename: "powershell.exe"; Parameters: "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File ""{app}\tools\remove-firewall-rule.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "RemoveFirewall"

[UninstallDelete]
; The service folder is removed with the program; data under ProgramData is
; kept so an uninstall does not destroy exam results (runbook).
Type: filesandordirs; Name: "{app}\lab"

[Code]
var
  ServerPort: Integer;
  { Port the existing installation already uses, or 0 on a fresh install. An
    upgrade keeps it, and it is allowed to be "in use" because it is ours. }
  ExistingServerPort: Integer;
  PortPage: TInputQueryWizardPage;

{ Shell out to PowerShell to test whether a TCP port is accepting connections. }
function PortInUse(Port: Integer): Boolean;
var
  ResultCode: Integer;
  Command: String;
begin
  Command := '-NoProfile -NonInteractive -Command "' +
    'try { $c = New-Object Net.Sockets.TcpClient; ' +
    '$c.Connect(''127.0.0.1'',' + IntToStr(Port) + '); $c.Close(); exit 0 } ' +
    'catch { exit 1 }"';
  if Exec('powershell.exe', Command, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    Result := ResultCode = 0
  else
    Result := False;
end;

function ParsePort(Text: String): Integer;
var
  Value: Integer;
begin
  Value := StrToIntDef(Text, -1);
  if (Value < 1) or (Value > 65535) then
    Result := -1
  else
    Result := Value;
end;

{ Port from an existing SchoolCBT.xml, or 0 when there is no installation. }
function ExistingPort(): Integer;
var
  XmlPath, Text: String;
  Raw: AnsiString;
  P: Integer;
begin
  Result := 0;
  XmlPath := ExpandConstant('{autopf}\SchoolCBT\SchoolCBT.xml');
  if not FileExists(XmlPath) then
    Exit;
  if not LoadStringFromFile(XmlPath, Raw) then
    Exit;
  Text := String(Raw);
  P := Pos('<env name="PORT" value="', Text);
  if P = 0 then
    Exit;
  Delete(Text, 1, P + Length('<env name="PORT" value="') - 1);
  P := Pos('"', Text);
  if P = 0 then
    Exit;
  Result := StrToIntDef(Copy(Text, 1, P - 1), 0);
end;

function InitializeSetup(): Boolean;
begin
  ExistingServerPort := ExistingPort();
  ServerPort := {#DefaultPort};
  { An upgrade keeps the port the service is already configured for (section
    6.3); a silent update relies on this because the wizard never runs. }
  if ExistingServerPort > 0 then
    ServerPort := ExistingServerPort;
  Result := True;
end;

{ Ask for the port on its own wizard page and refuse one that is taken
  (section 6.3 step 2). }
procedure InitializeWizard();
begin
  PortPage := CreateInputQueryPage(wpSelectDir,
    'Server port',
    'Which TCP port should the exam server listen on?',
    'The service and the firewall rule are configured for this port. The default is {#DefaultPort}.');
  PortPage.Add('Port:', False);
  PortPage.Values[0] := IntToStr(ServerPort);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Value: Integer;
begin
  Result := True;
  if CurPageID = PortPage.ID then
  begin
    Value := ParsePort(PortPage.Values[0]);
    if Value < 0 then
    begin
      MsgBox('Enter a port between 1 and 65535.', mbError, MB_OK);
      Result := False;
    end
    else if (Value <> ExistingServerPort) and PortInUse(Value) then
    begin
      MsgBox('TCP port ' + IntToStr(Value) + ' is already in use. Choose another.', mbError, MB_OK);
      Result := False;
    end
    else
      ServerPort := Value;
  end;
end;

function GetPort(Param: String): String;
begin
  Result := IntToStr(ServerPort);
end;

function GetServerUrl(Param: String): String;
begin
  Result := 'http://localhost:' + IntToStr(ServerPort);
end;

function ServiceExists(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec(ExpandConstant('{cmd}'), '/c sc query SchoolCBT >nul 2>&1', '',
    SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

{ Stop and remove an existing service and back up the database before an
  upgrade replaces the app files (section 6.3 step 3). }
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  ServiceExe, DbPath, BackupDir, Stamp: String;
begin
  Result := '';
  NeedsRestart := False;

  ServiceExe := ExpandConstant('{app}\{#AppExeName}');
  if FileExists(ServiceExe) and ServiceExists() then
  begin
    Exec(ServiceExe, 'stop', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    Exec(ServiceExe, 'uninstall', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;

  DbPath := ExpandConstant('{commonappdata}\SchoolCBT\data\school.db');
  if FileExists(DbPath) then
  begin
    BackupDir := ExpandConstant('{commonappdata}\SchoolCBT\backups');
    ForceDirectories(BackupDir);
    Stamp := GetDateTimeString('yyyy-mm-dd_hh-nn-ss', '-', ':');
    CopyFile(DbPath, BackupDir + '\pre-update-' + Stamp + '.db', False);
  end;
end;

{ Point the service definition at the chosen port (defaults to 8080). }
procedure ApplyServicePort();
var
  XmlPath, Text: String;
  Raw: AnsiString;
begin
  XmlPath := ExpandConstant('{app}\SchoolCBT.xml');
  if LoadStringFromFile(XmlPath, Raw) then
  begin
    Text := String(Raw);
    StringChangeEx(Text, '<env name="PORT" value="8080" />',
      '<env name="PORT" value="' + IntToStr(ServerPort) + '" />', True);
    SaveStringToFile(XmlPath, AnsiString(Text), False);
  end;
end;

procedure CreateDataFolders();
var
  DataRoot: String;
  ResultCode: Integer;
begin
  DataRoot := ExpandConstant('{commonappdata}\SchoolCBT');
  ForceDirectories(DataRoot + '\data');
  ForceDirectories(DataRoot + '\logs');
  ForceDirectories(DataRoot + '\backups');
  ForceDirectories(DataRoot + '\secrets');

  { Let the low-privilege service account write to its data root. }
  Exec('icacls.exe',
    '"' + DataRoot + '" /grant "NT AUTHORITY\LocalService:(OI)(CI)M" /T /C',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure WriteConfigFile();
var
  ConfigPath, Json: String;
begin
  ConfigPath := ExpandConstant('{commonappdata}\SchoolCBT\config.json');
  if FileExists(ConfigPath) then
    Exit;
  Json := '{' + #13#10 +
    '  "port": ' + IntToStr(ServerPort) + ',' + #13#10 +
    '  "cloud_url": "",' + #13#10 +
    '  "second_backup_path": ""' + #13#10 +
    '}' + #13#10;
  SaveStringToFile(ConfigPath, AnsiString(Json), False);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    CreateDataFolders();
    ApplyServicePort();
    WriteConfigFile();
  end;
end;
