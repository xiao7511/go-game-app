' 开启错误捕获，防止静默崩溃
On Error Resume Next

Dim fso, shell, gameDir, downloadURL, zipPath, args, rawUrl, connectParam, nameParam
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' 1. 动态接收大厅传来的自定义协议参数
Set args = WScript.Arguments
connectParam = ""
nameParam = ""

If args.Count > 0 Then
    rawUrl = args(0)
    
    ' --- 解析连接地址 (IP:Port) ---
    If InStr(rawUrl, "connect/") > 0 Then
        Dim tempConnect
        tempConnect = Mid(rawUrl, InStr(rawUrl, "connect/") + 8)
        
        ' 如果后面还带了 /name/，我们需要把 IP:Port 部分截断出来
        If InStr(tempConnect, "/name/") > 0 Then
            tempConnect = Left(tempConnect, InStr(tempConnect, "/name/") - 1)
        End If
        
        connectParam = " +connect " & tempConnect
        If Right(connectParam, 1) = "/" Then
            connectParam = Left(connectParam, Len(connectParam) - 1)
        End If
    End If
    
    ' --- 解析玩家昵称 (name/) ---
    If InStr(rawUrl, "/name/") > 0 Then
        Dim rawName
        rawName = Mid(rawUrl, InStr(rawUrl, "/name/") + 6)
        ' 去除可能存在的末尾斜杠
        If Right(rawName, 1) = "/" Then
            rawName = Left(rawName, Len(rawName) - 1)
        End If
        ' URL 解码（防止中文乱码）
        rawName = URLDecode(rawName)
        If rawName <> "" Then
            nameParam = " +name """ & rawName & """"
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
        psCmd = "powershell -WindowStyle Hidden -Command ""Invoke-WebRequest -Uri '" & downloadURL & "' -OutFile '" & zipPath & "'"""
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

' 3. 执行启动前置操作并进入游戏
If fso.FolderExists(gameDir) Then
    If fso.FileExists("D:\cs1.6\vgui.reg") Then
        shell.Run "reg.exe import D:\cs1.6\vgui.reg", 0, True
    End If
    
    ' 强制设定当前工作目录
    shell.CurrentDirectory = gameDir
    
    ' 【优化】将解析出来的 connectParam（连房）和 nameParam（昵称）组合拼接
    Dim launchCmd
    launchCmd = "cmd.exe /c cd /d D:\cs1.6 && start hl.exe -game cstrike -nomaster" & nameParam & connectParam
    
    ' 调试看看最终执行的命令对不对（上线后可注释掉）
    ' MsgBox "即将执行的启动命令: " & launchCmd, 64, "调试"
    
    ' 启动游戏并直接带入昵称与连接参数
    shell.Run launchCmd, 0, False
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
