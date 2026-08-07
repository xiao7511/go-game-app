On Error Resume Next

Dim fso, shell, targetDir, r2Domain, vbsUrl, regUrl, localVbs, localReg
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

targetDir = "D:\Cs1.6"
If Not fso.FolderExists(targetDir) Then
    fso.CreateFolder(targetDir)
End If

' 你的 Cloudflare R2 绑定的自定义域名
r2Domain = "https://game-pkg.nobistudio.com"

vbsUrl = r2Domain & "/launcher.vbs"
regUrl = r2Domain & "/fix_cs16.reg"

localVbs = targetDir & "\launcher.vbs"
localReg = targetDir & "\fix_cs16.reg"

' 1. 从 Cloudflare R2 自动下载/更新最新版的 launcher.vbs 和 fix_cs16.reg
Dim psCmd
psCmd = "powershell -WindowStyle Hidden -Command ""try { Invoke-WebRequest -Uri '" & vbsUrl & "' -OutFile '" & localVbs & "' -ErrorAction Stop; Invoke-WebRequest -Uri '" & regUrl & "' -OutFile '" & localReg & "' -ErrorAction Stop } catch {}"""
shell.Run psCmd, 0, True

' 2. 自动静默导入注册表，确保协议和键值永远保持最新
If fso.FileExists(localReg) Then
    shell.Run "reg.exe import """ & localReg & """", 0, True
End If

' 3. 下载并注册完成后，自动把大厅传来的所有参数原封不动传递并交棒给刚刚从 R2 下载的最新的 launcher.vbs 运行
Dim argsStr, arg
argsStr = ""
For Each arg in WScript.Arguments
    argsStr = argsStr & " """ & arg & """"
Next

If fso.FileExists(localVbs) Then
    ' 执行本地刚更新的完整版业务逻辑
    shell.Run "wscript.exe """ & localVbs & """" & argsStr, 0, False
End If