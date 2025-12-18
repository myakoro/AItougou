Set WshShell = CreateObject("WScript.Shell")
strPath = WScript.CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = strPath
WshShell.Run "cmd /c SyncAIを起動.bat", 0, False
