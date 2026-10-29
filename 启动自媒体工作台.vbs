Set system = CreateObject("WScript.Shell")
Set files = CreateObject("Scripting.FileSystemObject")
root = files.GetParentFolderName(WScript.ScriptFullName)
system.CurrentDirectory = root
system.Run Chr(34) & root & "\node_modules\electron\dist\electron.exe" & Chr(34) & " " & Chr(34) & root & Chr(34), 1, False
