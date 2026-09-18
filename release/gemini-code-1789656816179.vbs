Set WshShell = CreateObject("WScript.Shell")

' 클립보드에 주소 복사
WshShell.Run "cmd.exe /c echo chrome://extensions/| clip", 0, True

' 크롬 창 활성화/실행
WshShell.Run "chrome.exe"
WScript.Sleep 500

' 주소창 포커스(Ctrl+L) 및 붙여넣기(Ctrl+V) 후 엔터
WshShell.SendKeys "^l"
WScript.Sleep 100
WshShell.SendKeys "^v{ENTER}"