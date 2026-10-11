# Public recordings: source pages and permissions in docs/nobi-v2/guandan-audio-provenance.md.
$ErrorActionPreference='Stop'
$taskRepoRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskEntries=@(
 @{Name='guandan-moonlight.mp3'; Title="Ludwig van Beethoven - sonata no. 14 in c sharp minor 'moonlight', op. 27 no. 2 - i. adagio sostenuto.ogg"},
 @{Name='guandan-nocturne.mp3'; Title='Nocturne Op. 9 no. 2 in E flat major.mp3'},
 @{Name='guandan-dreaming.mp3'; Title='Robert Schumann - scenes from childhood, op. 15 - vii. dreaming.ogg'}
)
foreach($taskEntry in $taskEntries){
 $taskApi='https://commons.wikimedia.org/w/api.php?action=query&prop=videoinfo&viprop=url%7Cderivatives&format=json&titles='+[uri]::EscapeDataString('File:'+$taskEntry.Title)
 $taskResult=Invoke-RestMethod -Uri $taskApi -TimeoutSec 30
 $taskVideo=($taskResult.query.pages.PSObject.Properties | Select-Object -First 1).Value.videoinfo[0]
 $taskUrl=if($taskEntry.Title.EndsWith('.mp3')){$taskVideo.url}else{($taskVideo.derivatives | Where-Object {$_.type -like '*mpeg*'} | Select-Object -First 1).src}
 $taskSource=[uri]$taskUrl
 if($taskSource.Scheme -ne 'https' -or $taskSource.Host -ne 'upload.wikimedia.org'){throw 'Unexpected recording host'}
 $taskTarget=Join-Path $taskRepoRoot ('assets/music/'+$taskEntry.Name)
 Invoke-WebRequest -Uri $taskSource -OutFile $taskTarget -TimeoutSec 60
 Write-Output ($taskEntry.Name+' imported: '+(Get-Item -LiteralPath $taskTarget).Length+' bytes')
}
Invoke-WebRequest -Uri 'https://cdn.freesound.org/previews/189/189778_71257-hq.mp3' -OutFile (Join-Path $taskRepoRoot 'assets/sounds/guandan-bomb-recording.mp3') -TimeoutSec 30
Write-Output 'Imported CC0 real explosion recording; run prepare-guandan-bomb.mjs to extract the gameplay clip.'
