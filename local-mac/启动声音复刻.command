#!/bin/zsh
cd -- "${0:A:h}" || exit 1
for voice_python in /opt/homebrew/bin/python3 /usr/local/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3; do
  if [[ -x "$voice_python" ]] && "$voice_python" -c 'import sys; assert sys.version_info >= (3,9)' >/dev/null 2>&1; then
    exec "$voice_python" server.py
  fi
done
if /usr/bin/xcode-select -p >/dev/null 2>&1 && /usr/bin/python3 -c 'import sys; assert sys.version_info >= (3,9)' >/dev/null 2>&1; then
  exec /usr/bin/python3 server.py
fi
print '本机尚未安装 Python 3.9 或以上版本。'
print '请从 https://www.python.org/downloads/macos/ 安装官方 macOS universal2 版本，然后重新双击本文件。'
print '本程序不需要安装其他依赖。按回车关闭。'
read
