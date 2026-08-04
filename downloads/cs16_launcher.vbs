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

' ===【配置你的固定路径和 Cloudflare R2 下载直链】===
gameDir = "D:\cs1.6"
downloadURL = "https://game-pkg.nobistudio.com/cs16_green.zip" ' 替换为你的 R2 公开访问链接
zipPath = "D:\cs1.6_setup.zip"                                 ' 压缩包缓存固定路径

' 2. 判断 D 盘游戏目录是否存在
If Not fso.FolderExists(gameDir) Then
    Dim btnPressed
    btnPressed = MsgBox("检测到本地未安装 CS1.6 (D:\cs1.6不存在)，是否立即从云端自动下载并安装？", 4 + 32, "CS1.6 Web Lobby")
    
    If btnPressed = 6 Then 
        MsgBox "正在后台静默下载游戏包，请稍候...", 64, "下载中"
        
        Dim psCmd
        ' 使用 PowerShell 静默下载到固定路径
        psCmd = "powershell -WindowStyle Hidden -Command ""(New-Object Net.WebClient).DownloadFile('" & downloadURL & "', '" & zipPath & "')"""
        shell.Run psCmd, 0, True 
        
        MsgBox "下载完成！正在自动解压到 D:\cs1.6 ...", 64, "开始解压"
        
        ' 自动创建目标文件夹
        If Not fso.FolderExists(gameDir) Then
            fso.CreateFolder(gameDir)
        End If
        
        ' 调用系统自带的 Expand-Archive 自动解压到 D:\cs1.6
        Dim unzipCmd
        unzipCmd = "powershell -WindowStyle Hidden -Command ""Expand-Archive -Path '" & zipPath & "' -DestinationPath '" & gameDir & "' -Force"""
        shell.Run unzipCmd, 0, True
        
        ' 解压完成后，自动删除下载的临时压缩包
        If fso.FileExists(zipPath) Then
            fso.DeleteFile(zipPath)
        End If
        
        MsgBox "CS1.6 客户端部署完成，即将为你进入游戏！", 64, "安装成功"
    End If
End If

' 3. 如果目录已存在（或刚刚自动安装完成），执行启动前置操作
If fso.FolderExists(gameDir) Then
    ' 每次启动前，静默导入本地免密 CD-KEY 注册表补丁（如果存在）
    If fso.FileExists("D:\cs1.6\vgui.reg") Then
        shell.Run "reg.exe import D:\cs1.6\vgui.reg", 0, True
    End If
    
    ' 4. 切入当前工作目录并一键带参数启动游戏
    shell.CurrentDirectory = gameDir
    ' 4. 切入当前工作目录并启动
shell.CurrentDirectory = gameDir

    ' === 临时加一行弹窗，看拼出来的完整命令对不对 ===
    MsgBox "即将执行的命令是: hl.exe -game cstrike -nomaster" & connectParam, 64, "调试参数"
    shell.Run "hl.exe -game cstrike -nomaster" & connectParam, 1, False
End If
