' Runs its arguments as one command line in a hidden console window (SW_HIDE) and waits for it.
' A scheduled task whose action is a console program gets a headless console; programs that need
' a real console host (claude -p, wt.exe) then stall. wscript.exe is a GUI host, so the window it
' creates is a real console, never shown.
Option Explicit
Dim sh, args, i, cmd, rc
Set sh = CreateObject("WScript.Shell")
Set args = WScript.Arguments
If args.Count < 1 Then WScript.Quit 2
cmd = ""
For i = 0 To args.Count - 1
  If i > 0 Then cmd = cmd & " "
  cmd = cmd & """" & args(i) & """"
Next
On Error Resume Next
rc = sh.Run(cmd, 0, True)
If Err.Number <> 0 Then WScript.Quit 3
WScript.Quit rc
