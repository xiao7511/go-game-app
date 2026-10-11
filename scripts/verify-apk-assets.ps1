param([string]$ApkPath)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if(!$ApkPath){$ApkPath=Join-Path $taskRoot 'android/app/build/outputs/apk/debug/app-debug.apk'}
$taskApk=(Resolve-Path -LiteralPath $ApkPath).Path
$taskBuild=[IO.Path]::GetFullPath((Join-Path $taskRoot 'android/app/build'))+[IO.Path]::DirectorySeparatorChar
if(!$taskApk.StartsWith($taskBuild,[StringComparison]::OrdinalIgnoreCase)){throw 'APK must be inside the project Android build directory'}
$taskHash=(Get-FileHash -LiteralPath $taskApk -Algorithm SHA256).Hash.ToLowerInvariant()
$taskTarget=[IO.Path]::GetFullPath((Join-Path $taskRoot ('.nobi-isolated/phase3a/apk-'+$taskHash.Substring(0,12))))
$taskPrefix=$taskTarget+[IO.Path]::DirectorySeparatorChar
$taskArchive=[IO.Compression.ZipFile]::OpenRead($taskApk)
try {
 foreach($taskEntry in $taskArchive.Entries) {
  if($taskEntry.FullName -match '\.(key|pem|p12|pfx|jks|keystore|mobileprovision|csr)$'){throw 'Forbidden signing material in APK'}
  if(!$taskEntry.FullName.StartsWith('assets/public/') -or !$taskEntry.Name){continue}
  $taskRelative=$taskEntry.FullName.Substring('assets/public/'.Length)
  $taskFile=[IO.Path]::GetFullPath((Join-Path $taskTarget $taskRelative))
  if(!$taskFile.StartsWith($taskPrefix,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe ZIP path'}
  [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($taskFile)) | Out-Null
  $taskInput=$taskEntry.Open();$taskOutput=[IO.File]::Create($taskFile)
  try{$taskInput.CopyTo($taskOutput)}finally{$taskInput.Dispose();$taskOutput.Dispose()}
 }
}finally{$taskArchive.Dispose()}
@{directory=$taskTarget;sha256=$taskHash;bytes=(Get-Item -LiteralPath $taskApk).Length} | ConvertTo-Json -Compress
