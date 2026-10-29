$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$executable = Join-Path $projectRoot 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path -LiteralPath $executable)) { throw '缺少桌面运行程序，请先完成安装。' }
$desktopFolder = [Environment]::GetFolderPath('Desktop')
$linkPath = Join-Path $desktopFolder '自媒体工作台.lnk'
$shellLink = New-Object -ComObject WScript.Shell
$shortcut = $shellLink.CreateShortcut($linkPath)
$shortcut.TargetPath = $executable
$shortcut.Arguments = '"' + $projectRoot + '"'
$shortcut.WorkingDirectory = $projectRoot
$shortcut.Description = '视频转文案、评论分析、下一条选题'
$shortcut.Save()
Write-Output $linkPath
