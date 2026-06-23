@echo off
setlocal enabledelayedexpansion

:: 1. 自动获取当前批处理文件所在的绝对路径，供大厅协议绑定
set "CURRENT_DIR=%~dp0"
set "CURRENT_DIR=!CURRENT_DIR:\=\\!"

:: 将 cs16:// 协议直接写入当前登录用户的注册表 (HKCU)
reg add "HKCU\Software\Classes\cs16" /v "" /d "URL:CS16 Protocol" /f
reg add "HKCU\Software\Classes\cs16" /v "URL Protocol" /d "" /f
reg add "HKCU\Software\Classes\cs16\shell\open\command" /v "" /d "wscript.exe \"!CURRENT_DIR!cs16_launcher.vbs\" \"%%1\"" /f

:: ======================================================
:: 🎮 免密注入 CS1.6 所有可能的 CD-KEY 注册表路径
:: ======================================================
echo 正在为您全量注入免密版 CS1.6 CD-KEY 补丁群...

reg add "HKCU\Software\Valve\CounterStrike\Settings" /v "Key" /d "5RP2E-EPH3K-BR3LG-KMGTE-FN8PY" /f
reg add "HKCU\Software\Valve\Half-Life\Settings" /v "Key" /d "5RP2E-EPH3K-BR3LG-KMGTE-FN8PY" /f
reg add "HKCU\Software\Valve\CS\Settings" /v "Key" /d "5RP2E-EPH3K-BR3LG-KMGTE-FN8PY" /f
reg add "HKCU\Software\Valve\Strike\Settings" /v "Key" /d "5RP2E-EPH3K-BR3LG-KMGTE-FN8PY" /f
reg add "HKCU\Software\valve\counterstrike\settings" /v "key" /d "5RP2E-EPH3K-BR3LG-KMGTE-FN8PY" /f
reg add "HKCU\Software\valve\half-life\settings" /v "key" /d "5RP2E-EPH3K-BR3LG-KMGTE-FN8PY" /f

echo ======================================================
echo  [免密注册表群] 补丁已全部强行覆盖完毕！
echo ======================================================
pause