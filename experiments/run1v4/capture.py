"""Capture BEFORE and AFTER HTML pages using a simple SPA server."""
import http.server
import os
import sys
import threading
import time
import urllib.request

PORT = 4199
if len(sys.argv) < 3:
    print("Usage: capture.py <dist_dir> <result_dir>")
    sys.exit(1)

DIST_DIR = os.path.abspath(sys.argv[1])
RESULT_DIR = sys.argv[2]

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIST_DIR, **kwargs)
    
    def do_GET(self):
        p = self.path.split('?')[0].split('#')[0]
        fp = os.path.join(DIST_DIR, p.lstrip('/'))
        if not os.path.exists(fp) or os.path.isdir(fp):
            self.path = '/index.html'
        return super().do_GET()

server = http.server.HTTPServer(('', PORT), SPAHandler)
thread = threading.Thread(target=server.serve_forever, daemon=True)
thread.start()
time.sleep(0.5)

pages = [('/', 'home'), ('/playground', 'playground'), ('/docs', 'docs')]
exp_dir = os.path.join(os.path.dirname(__file__), RESULT_DIR)
os.makedirs(exp_dir, exist_ok=True)

for page_path, page_name in pages:
    url = f'http://localhost:{PORT}{page_path}'
    try:
        resp = urllib.request.urlopen(url)
        content = resp.read()
        filepath = os.path.join(exp_dir, f'{page_name}.html')
        with open(filepath, 'wb') as f:
            f.write(content)
        print(f'  {page_name}.html: {len(content)} bytes')
    except Exception as e:
        print(f'  ERROR fetching {url}: {e}')

server.shutdown()
print('Done capturing')
