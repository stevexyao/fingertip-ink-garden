#!/usr/bin/env python3
"""Serve the built artwork on loopback without npm or third-party packages."""
import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

parser = argparse.ArgumentParser(description='指尖花开本地启动器')
parser.add_argument('--no-open', action='store_true')
parser.add_argument('--port', type=int, default=5186)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent / 'dist'
if not (root / 'index.html').exists():
    raise SystemExit('找不到成品网页，请先在项目目录运行 npm install、npm run assets、npm run build。')
handler = partial(SimpleHTTPRequestHandler, directory=str(root))
server = None
for port in range(args.port, args.port + 11):
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), handler)
        break
    except OSError:
        continue
if server is None:
    raise SystemExit('本地端口正在使用，请关闭旧窗口后再打开。')
url = f'http://127.0.0.1:{server.server_port}/'
print(f'指尖花开已启动：{url}\n关闭此窗口或按 Control+C 即可停止。', flush=True)
if not args.no_open:
    webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
