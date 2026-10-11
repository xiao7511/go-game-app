# Export a reproducible, explicit source subset. No Git history, private material, cache or signing data.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$taskRepo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskId=[Guid]::NewGuid().ToString('N').Substring(0,8)
$taskStage=[IO.Path]::GetFullPath((Join-Path $taskRepo ('.nobi-isolated/mobile-device/ios-source-'+$taskId)))
if(!$taskStage.StartsWith($taskRepo+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe export directory'}
$taskNames=@('.gitattributes','package.json','package-lock.json','capacitor.config.ts','CNAME','index.html','login.html','register.html','game.html','online.html','config.js','supabaseClient.js','platform.js','game.js','multiplayer-ext.js','guandan-game.js','guandan-mp-ext.js','manifest.json','icon-192-v1.png','icon-512-v1.png','apple-touch-icon-v1.png','favicon-v1.ico','icon.svg','tooling/package.json','tooling/package-lock.json','tooling/sdk-entry.js','www/multiplayer-ext.js','www/game.js','www/game.html','docs/nobi-v2/asset-manifest.json','docs/nobi-v2/guandan-audio-provenance.md','docs/nobi-v2/mobile-device-testing.md','docs/nobi-v2/testflight-preparation.md')
$taskNames+=@('frontend.mjs','public-config.mjs','online-public-config.mjs','device-online-config.mjs','verify-assets.mjs','verify-build.mjs','security-audit.mjs','prepare-mobile-test.mjs','verify-mobile-assets.mjs','ios-readiness.mjs','ios-prepare-mac.sh') | ForEach-Object {'scripts/'+$_}
foreach($taskFolder in @('ui','images/cards','assets/music','assets/sounds','ios')){
 foreach($taskFile in Get-ChildItem -LiteralPath (Join-Path $taskRepo $taskFolder) -File -Recurse){
  if(!$taskFile.FullName.StartsWith($taskRepo+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected source path'}
  $taskRelative=$taskFile.FullName.Substring($taskRepo.Length+1).Replace('\','/')
  if($taskRelative -match '(^|/)(build|Pods|public|output|DerivedData|xcuserdata|\.git)(/|$)' -or $taskRelative -match '(capacitor\.config\.json|config\.xml|\.DS_Store)$'){continue}
  $taskNames+=$taskRelative
 }
}
$taskManifest=@()
foreach($taskName in ($taskNames | Sort-Object -Unique)){
 if($taskName -match '\.(key|pem|p12|pfx|jks|keystore|mobileprovision|csr|cer|crt)$' -or $taskName -match '(^|/)\.env' -or $taskName -match '\.local\.js$'){throw 'Forbidden source export file'}
 $taskSource=[IO.Path]::GetFullPath((Join-Path $taskRepo $taskName))
 if(!$taskSource.StartsWith($taskRepo+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Source outside workspace'}
 if($taskName -match '\.(js|mjs|json|html|ts|md|swift|sh)$'){
  $taskText=[IO.File]::ReadAllText($taskSource)
  if($taskText -match '-----BEGIN (RSA |EC |ENCRYPTED )?PRIVATE KEY-----|sb_secret_[a-zA-Z0-9_-]+'){throw 'Sensitive material in source export'}
  foreach($taskMatch in [regex]::Matches($taskText,'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+')){
   $taskPayload=$taskMatch.Value.Split('.')[1].Replace('-','+').Replace('_','/')
   $taskPayload=$taskPayload.PadRight($taskPayload.Length+(4-$taskPayload.Length%4)%4,'=')
   try{$taskClaims=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($taskPayload)) | ConvertFrom-Json}catch{throw 'Unverified JWT in source export'}
   if($taskClaims.role -ne 'anon'){throw 'Non-anonymous JWT in source export'}
  }
 }
 $taskDest=Join-Path $taskStage $taskName
 [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($taskDest)) | Out-Null
 Copy-Item -LiteralPath $taskSource -Destination $taskDest
 $taskManifest+=@{path=$taskName;sha256=(Get-FileHash -LiteralPath $taskDest -Algorithm SHA256).Hash.ToLowerInvariant()}
}
[IO.File]::WriteAllText((Join-Path $taskStage 'source-manifest.json'),(ConvertTo-Json -InputObject $taskManifest -Depth 4))
$taskOutput=Join-Path $taskRepo 'dist/mobile-device'
[IO.Directory]::CreateDirectory($taskOutput) | Out-Null
$taskZip=Join-Path $taskOutput ('Nobi-ios-preparation-'+$taskId+'.zip')
$taskZipStream=[IO.File]::Open($taskZip,[IO.FileMode]::CreateNew)
$taskArchive=[IO.Compression.ZipArchive]::new($taskZipStream,[IO.Compression.ZipArchiveMode]::Create)
try {
 foreach($taskName in (@($taskManifest | ForEach-Object {$_.path})+'source-manifest.json')){
  # Explicit slash-separated names work on macOS as well as Windows.
  $taskEntry=$taskArchive.CreateEntry($taskName,[IO.Compression.CompressionLevel]::Optimal)
  $taskInput=[IO.File]::OpenRead((Join-Path $taskStage $taskName));$taskEntryStream=$taskEntry.Open()
  try{$taskInput.CopyTo($taskEntryStream)}finally{$taskInput.Dispose();$taskEntryStream.Dispose()}
 }
}finally{$taskArchive.Dispose();$taskZipStream.Dispose()}
Write-Output ('Exported '+$taskManifest.Count+' source files; no Git history or signing material.')
Write-Output $taskZip
Write-Output ('SHA256 '+(Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant())
