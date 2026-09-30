#!/bin/bash
# Terminalの外でサーバーを起動し、このウィンドウを閉じる
DIR="$(cd "$(dirname "$0")" && pwd)"
osascript >/dev/null 2>&1 <<OSA
do shell script "cd " & quoted form of "$DIR" & " && (nohup ./html-game-launcher >/dev/null 2>&1 &)"
OSA
osascript >/dev/null 2>&1 -e 'tell application "Terminal" to close (every window whose name contains "start.command")' &
exit 0
