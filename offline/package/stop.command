#!/bin/bash
pkill -x html-game-launcher
osascript >/dev/null 2>&1 -e 'tell application "Terminal" to close (every window whose name contains "stop.command")' &
exit 0
