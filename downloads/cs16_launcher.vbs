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
downloadURL = "https://game-pkg.nobistudio.com/cs16_green.zip"
zipPath = "D:\cs1.6_setup.zip"

' 2. 判断 D 盘游戏目录是否存在
If Not fso.FolderExists(gameDir) Then
    Dim btnPressed
    btnPressed = MsgBox("检测到本地未安装 CS1.6 (D:\cs1.6不存在)，是否立即从云端自动下载并安装？", 4 + 32, "CS1.6 Web Lobby")
    
    If btnPressed = 6 Then 
        MsgBox "正在后台静默下载游戏包，请稍候...", 64, "下载中"
        
        ' 使用简洁的 PowerShell 下载命令
        Dim psDownload
        psDownload = "powershell -WindowStyle Hidden -Command ""(New-Object Net.WebClient).DownloadFile('" & downloadURL & "', '" & zipPath & "')"""
        shell.Run psDownload, 0, True 
        
        MsgBox "下载完成！正在自动解压到 D:\cs1.6 ...", 64, "开始解压"
        
        If Not fso.FolderExists(gameDir) Then
            fso.CreateFolder(gameDir)
        End If
        
        ' 使用简洁的 PowerShell 解压命令
        Dim psUnzip
        psUnzip = "powershell -WindowStyle Hidden -Command ""Expand-Archive -Path '" & zipPath & "' -DestinationPath '" & gameDir & "' -Force"""
        shell.Run psUnzip, 0, True
        
        If fso.FileExists(zipPath) Then
            fso.DeleteFile(zipPath)
        End If
        
        MsgBox "CS1.6 客户端部署完成，即将为你进入游戏！", 64, "安装成功"
    End If
End If

' 3. 执行启动前置操作并进入游戏
If fso.FolderExists(gameDir) Then
    If fso.FileExists("D:\cs1.6\vgui.reg") Then
        shell.Run "reg.exe import D:\cs1.6\vgui.reg", 0, True
    End If
    
    shell.CurrentDirectory = gameDir
    
    ' 强制指定你的云端服务器 IP 和端口，确保百分之百能连上服务器
    Dim targetServer
    targetServer = "43.128.27.245:27015"
    
    ' 启动游戏并自动连入
    shell.Run """D:\cs1.6\hl.exe"" -game cstrike +connect " & targetServer & " -nomaster", 1, False
End If
