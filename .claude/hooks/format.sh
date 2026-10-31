#!/usr/bin/env bash
# Format the file that was just written/edited (best effort, never blocks).
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -n "$f" ] && [ -f "$f" ] && case "$f" in
  *.ts|*.tsx|*.css|*.json|*.md|*.yml) npx --no-install prettier --write "$f" >/dev/null 2>&1 ;;
esac
exit 0
