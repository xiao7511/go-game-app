On Error Resume Next

Dim fso, shell, gameDir, downloadURL, zipPath, args, rawUrl, targetServer, rawName
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

gameDir = "D:\Cs1.6"
downloadURL = "https://game-pkg.nobistudio.com/cs16_green.zip"
zipPath = "D:\cs1.6_setup.zip"

targetServer = "43.128.27.245:27015"
rawName = ""

' 1. 接收大厅传来的参数 (IP 和昵称)
Set args = WScript.Arguments
If args.Count > 0 Then
    rawUrl = args(0)
    
    ' 解析连接地址 (IP:Port)
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
    
    ' 解析玩家昵称 (name/)
    If InStr(rawUrl, "/name/") > 0 Then
        Dim tempName
        tempName = Mid(rawUrl, InStr(rawUrl, "/name/") + 6)
        If Right(tempName, 1) = "/" Then
            tempName = Left(tempName, Len(tempName) - 1)
        End If
        rawName = URLDecode(tempName)
    End If
End If

' 2. 自动判断本地游戏目录是否存在，不存在则自动下载并解压
If Not fso.FolderExists(gameDir) Then
    Dim btnPressed
    btnPressed = MsgBox("检测到本地未安装 CS1.6，是否立即从云端自动下载并安装？", 4 + 32, "CS1.6 自动部署")
    
    If btnPressed = 6 Then 
        MsgBox "正在后台静默下载游戏包，请稍候...", 64, "下载中"   
        
        Dim psCmd
        psCmd = "powershell -WindowStyle Hidden -Command ""Invoke-WebRequest -Uri '" & downloadURL & "' -OutFile '" & zipPath & "'"""
        shell.Run psCmd, 0, True 
        
        MsgBox "下载完成！正在自动解压到 D:\Cs1.6 ...", 64, "开始解压"
        
        If Not fso.FolderExists(gameDir) Then
            fso.CreateFolder(gameDir)
        End If
        
        Dim unzipCmd
        unzipCmd = "powershell -WindowStyle Hidden -Command ""Expand-Archive -Path '" & zipPath & "' -DestinationPath '" & gameDir & "' -Force"""
        shell.Run unzipCmd, 0, True
        
        If fso.FileExists(zipPath) Then
            fso.DeleteFile(zipPath)
        End If
        
        MsgBox "CS1.6 部署完成，即将为你进入游戏！", 64, "安装成功"
    Else
        WScript.Quit
    End If
End If

' 3. 启动游戏并自动连入服务器
If fso.FolderExists(gameDir) Then
    If fso.FileExists(gameDir & "\vgui.reg") Then
        shell.Run "reg.exe import """ & gameDir & "\vgui.reg""", 0, True
    End If
    
    shell.CurrentDirectory = gameDir
    ' shell.Run """" & gameDir & "\hl.exe"" -game cstrike -nomaster", 1, False
    shell.Run """" & gameDir & "\hl.exe"" -game cstrike -console +connect " & targetServer, 1, False
    
    ' 等待 6 秒确保游戏完全加载到主界面
    WScript.Sleep 10000
    
    ' 模拟键盘敲控制台设置昵称并登录服务器
    shell.SendKeys "`"
    WScript.Sleep 200
    
    If rawName <> "" Then
        shell.SendKeys "name """ & rawName & """"
        shell.Sleep 200
        shell.SendKeys "~"
        WScript.Sleep 200
        shell.SendKeys "`"
        WScript.Sleep 200
    End If
    
    shell.SendKeys "`"
    WScript.Sleep 200
    shell.SendKeys "connect " & targetServer
    WScript.Sleep 200
    shell.SendKeys "~"
End If

' URL 解码辅助函数
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
