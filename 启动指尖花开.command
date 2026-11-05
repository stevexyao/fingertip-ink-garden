#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  exec python3 scripts/serve.py
fi
print '需要 Python 3 才能本地启动。也可以直接打开《使用说明》里的 HTTPS 网页。'
read -k 1 '?按任意键退出…'
