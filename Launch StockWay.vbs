' Silent StockWay launcher — no console flash
' Prefers LIVE Electron (current source). Packaged dist\exe is frozen from last build.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = root

exe = root & "\dist\win-unpacked\StockWay.exe"
electron = root & "\node_modules\electron\dist\electron.exe"
play = root & "\play.bat"
icon = root & "\assets\icon.ico"

' Kill stale StockWay / Electron / port holders so we never reopen an old instance
sh.Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command ""Get-Process StockWay,electron,Electron -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue; foreach ($p in 8080,3847,3848,8091) { Get-NetTCPConnection -LocalPort $p -EA SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -EA SilentlyContinue } }""", 0, True

' LIVE first: electron . serves current js/css/html from this folder
If fso.FileExists(electron) Then
  If Not fso.FileExists(icon) Then
    sh.Run "cmd /c npm run icons", 0, True
  End If
  sh.Run """" & electron & """ .", 1, False
ElseIf fso.FileExists(exe) Then
  ' Fallback only when Electron isn't installed — frozen last build
  sh.Run """" & exe & """", 1, False
Else
  sh.Run "cmd /c """ & play & """", 0, False
End If
