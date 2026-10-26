#!/bin/bash
# Runs the comments server in the background at login (launchd). Re-run to update; pass --uninstall to remove.
set -e
LABEL="com.claude-comments.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DIR="$(cd "$(dirname "$0")" && pwd)"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

if [ "$1" = "--uninstall" ]; then
	rm -f "$PLIST"
	echo "Removed $LABEL"
	exit 0
fi

NODE="$(command -v node)"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>Label</key><string>$LABEL</string>
	<key>ProgramArguments</key>
	<array><string>$NODE</string><string>$DIR/server.js</string></array>
	<key>RunAtLoad</key><true/>
	<key>KeepAlive</key><true/>
	<key>StandardOutPath</key><string>$DIR/data/server.log</string>
	<key>StandardErrorPath</key><string>$DIR/data/server.log</string>
</dict>
</plist>
EOF

mkdir -p "$DIR/data"
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL → http://localhost:4848"
