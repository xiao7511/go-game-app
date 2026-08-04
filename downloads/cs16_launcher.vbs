' 开启错误捕获，防止静默崩溃
On Error Resume Next

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

' 如果上面有错误，弹出来看
If Err.Number <> 0 Then
    MsgBox "参数解析出错: " & Err.Description, 16, "调试错误"
    Err.Clear
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
        
        Dim psCmd
        psCmd = "powershell -WindowStyle Hidden -Command ""(New-Object Net.WebClient).DownloadFile('" & downloadURL & "', '" & zipPath & "')"""
        shell.Run psCmd, 0, True 
        
        MsgBox "下载完成！正在自动解压到 D:\cs1.6 ...", 64, "开始解压"
        
        If Not fso.FolderExists(gameDir) Then
            fso.CreateFolder(gameDir)
        End If
        
        Dim unzipCmd
        unzipCmd = "powershell -WindowStyle Hidden -Command ""Expand-Archive -Path '" & zipPath & "' -DestinationPath '" & gameDir & "' -Force"""
        shell.Run unzipCmd, 0, True
        
        If fso.FileExists(zipPath) Then
            fso.DeleteFile(zipPath)
        End If
        
        MsgBox "CS1.6 客户端部署完成，即将为你进入游戏！", 64, "安装成功"
    End If
Else
    ' 【测试点】如果目录存在，弹个窗确认是否走到了这里
    ' MsgBox "检测到游戏目录已存在，准备启动...", 64, "调试提示"
End If

' 3. 执行启动前置操作
If fso.FolderExists(gameDir) Then
    If fso.FileExists("D:\cs1.6\vgui.reg") Then
        shell.Run "reg.exe import D:\cs1.6\vgui.reg", 0, True
    End If
    
    ' 4. 切入当前工作目录并一键带参数启动游戏
    shell.CurrentDirectory = gameDir
    
    ' 强行把你的服务器 IP 和端口写死在这里，确保一定能连上服务器
    Dim targetServer
    targetServer = "43.128.27.245:27016"
    
    ' 启动命令
    shell.Run "hl.exe -game cstrike -nomaster +connect " & targetServer, 1, False
End If
