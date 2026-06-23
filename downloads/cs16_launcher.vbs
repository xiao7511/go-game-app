Dim fso, shell, gameDir, downloadURL, zipPath, args, connectParam
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' 1. 动态接收大厅传来的自定义协议参数
Set args = WScript.Arguments
connectParam = ""

If args.Count > 0 Then
    Dim rawUrl
    rawUrl = args(0)
    If InStr(rawUrl, "connect/") > 0 Then
        connectParam = " +connect " & Mid(rawUrl, InStr(rawUrl, "connect/") + 8)
        If Right(connectParam, 1) = "/" Then
            connectParam = Left(connectParam, Len(connectParam) - 1)
        End If
    End If
End If

gameDir = "D:\cs1.6"
downloadURL = "https://yourserver.com/downloads/cs16_green.zip"
zipPath = "D:\cs1.6_setup.zip"

' 2. 判断 D 盘游戏目录是否存在
If Not fso.FolderExists(gameDir) Then
    Dim btnPressed
    btnPressed = MsgBox("CS1.6 client not found in D:\cs1.6. Download now?", 4 + 32, "CS1.6 Web Lobby")
    
    If btnPressed = 6 Then 
        MsgBox "Downloading game package in background. Please wait...", 64, "Download Started"
        Dim psCmd
        psCmd = "powershell -WindowStyle Hidden -Command (New-Object Net.WebClient).DownloadFile('" & downloadURL & "', '" & zipPath & "')"
        shell.Run psCmd, 0, True 
        MsgBox "Download complete! Please extract cs16_green.zip into D:\cs1.6", 64, "Success"
        shell.Run "explorer.exe D:\", 1
    End If
Else
    ' 3. ?? 每次启动前，先悄悄静默导入游戏目录下的本地免密 CD-KEY 补丁
    shell.Run "reg.exe import D:\cs1.6\vgui.reg", 0, True
    
    ' 4. 切入当前工作目录并一键启动
    shell.CurrentDirectory = gameDir
    shell.Run "hl.exe -game cstrike -nomaster" & connectParam, 1, False
End If