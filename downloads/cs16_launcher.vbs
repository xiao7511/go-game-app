' 开启错误捕获，防止静默崩溃
On Error Resume Next

Dim fso, shell, gameDir, downloadURL, zipPath, args, rawUrl, targetServer, rawName
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' 默认兜底服务器 IP
targetServer = "43.128.27.245:27015"
rawName = ""

' 1. 动态接收大厅传来的自定义协议参数
Set args = WScript.Arguments
If args.Count > 0 Then
    rawUrl = args(0)
    
    ' --- 解析连接地址 (IP:Port) ---
    If InStr(rawUrl, "connect/") > 0 Then
        Dim tempConnect
        tempConnect = Mid(rawUrl, InStr(rawUrl, "connect/") + 8)
        
        If InStr(tempConnect, "/name/") > 0 Then
            tempConnect = Left(tempConnect, InStr(tempConnect, "/name/") - 1)
        End If
        
        If Right(tempConnect, 1) = "/" Then
            tempConnect = Left(tempConnect, Len(tempConnect) - 1)
        End If
        
        If tempConnect <> "" Then
            targetServer = tempConnect
        End If
    End If
    
    ' --- 解析玩家昵称 (name/) ---
    If InStr(rawUrl, "/name/") > 0 Then
        Dim tempName
        tempName = Mid(rawUrl, InStr(rawUrl, "/name/") + 6)
        If Right(tempName, 1) = "/" Then
            tempName = Left(tempName, Len(tempName) - 1)
        End If
        rawName = URLDecode(tempName)
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
        psCmd = "powershell -WindowStyle Hidden -Command ""Invoke-WebRequest -Uri '" & downloadURL & "' -OutFile '" & zipPath & "'"""
        shell.Run psCmd, 0, True 
        
        MsgBox "下载完成！正在自动解压/安装到 D:\cs1.6 ...", 64, "开始解压"
        
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
End If

' 3. 执行启动前置操作并进入游戏
If fso.FolderExists(gameDir) Then
    If fso.FileExists("D:\cs1.6\vgui.reg") Then
        shell.Run "reg.exe import D:\cs1.6\vgui.reg", 0, True
    End If
    
    ' 强制设定当前工作目录
    shell.CurrentDirectory = gameDir
    
    ' 启动游戏（只带昵称参数 -name，服务器连接改由后文控制台稳妥输入）
    Dim nameArg
    nameArg = ""
    If rawName <> "" Then
        nameArg = " -name """ & rawName & """"
    End If
    
    Dim launchCmd
    launchCmd = """D:\cs1.6\hl.exe"" -game cstrike -nomaster" & nameArg
    
    ' 启动游戏进程
    shell.Run launchCmd, 1, False
    
    ' 4. 等待 4 秒让游戏完全加载并进入主界面
    WScript.Sleep 4000
    
    ' 5. 模拟键盘：自动按下 "`" 键打开控制台，输入动态获取的服务器 IP 并回车
    shell.SendKeys "`"
    WScript.Sleep 250
    shell.SendKeys "connect " & targetServer
    WScript.Sleep 250
    shell.SendKeys "~"
End If

' ==========================================
' 辅助函数：VBS 中的简单 URL/Percent 解码实现
' ==========================================
Function URLDecode(expr)
    Dim strResult, i, a, b
    strResult = ""
    For i = 1 To Len(expr)
        a = Mid(expr, i, 1)
        If a = "+" Then
            strResult = strResult & " "
        ElseIf a = "%" Then
            If i + 2 <= Len(expr) Then
                b = Mid(expr, i + 1, 2)
                strResult = strResult & Chr(CInt("&H" & b))
                i = i + 2
            End If
        Else
            strResult = strResult & a
        End If
    Next
    URLDecode = strResult
End Function
