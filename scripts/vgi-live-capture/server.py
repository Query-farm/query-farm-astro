import base64, fcntl, json, os, pty, select, signal, struct, subprocess, termios, threading, time
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import argparse
parser=argparse.ArgumentParser(description='Serve a real Codex PTY on loopback for screen capture.')
parser.add_argument('--project',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--port',type=int,default=4348)
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[2]
OUT=args.output.resolve(); OUT.mkdir(parents=True,exist_ok=True)
PROJECT=args.project.resolve()
events=[]; master=None; process=None; started=None
prompt='Use $vgi-worker to connect GitHub releases to DuckDB in Python. Read BRIEF.md, build the worker, test it, and run the live API + local inventory query.'
def start():
 global master,process,started
 if process: return
 master,slave=pty.openpty();fcntl.ioctl(slave,termios.TIOCSWINSZ,struct.pack('HHHH',34,112,0,0))
 env=dict(os.environ,TERM='xterm-256color',COLORTERM='truecolor')
 command=['codex','--no-daemon','--no-alt-screen','-s','danger-full-access','-a','never','-c','project_doc_max_bytes=0',prompt]
 process=subprocess.Popen(command,cwd=PROJECT,stdin=slave,stdout=slave,stderr=slave,env=env,start_new_session=True)
 os.close(slave);started=time.monotonic()
 def read():
  with (OUT/'terminal-events.jsonl').open('w') as log:
   while process.poll() is None:
    ready,_,_=select.select([master],[],[],.3)
    if ready:
     try: data=os.read(master,65536)
     except OSError: break
     event={'at':round(time.monotonic()-started,3),'data':base64.b64encode(data).decode()};events.append(event);log.write(json.dumps(event)+'\n');log.flush()
 threading.Thread(target=read,daemon=True).start()
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path.startswith('/events'):
   after=int(self.path.split('after=')[-1]) if 'after=' in self.path else 0
   data=json.dumps({'events':events[after:],'cursor':len(events),'elapsed':round(time.monotonic()-started,1) if started else 0,'running':process is not None and process.poll() is None}).encode();mime='application/json'
  elif self.path=='/xterm.js':data=(ROOT/'node_modules/@xterm/xterm/lib/xterm.js').read_bytes();mime='application/javascript'
  elif self.path=='/xterm.css':data=(ROOT/'node_modules/@xterm/xterm/css/xterm.css').read_bytes();mime='text/css'
  else:data=(Path(__file__).with_name('terminal.html')).read_bytes();mime='text/html'
  self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
 def do_POST(self):
  if self.headers.get('Origin') not in (None, f'http://127.0.0.1:{args.port}'):
   self.send_error(403);return
  body=self.rfile.read(int(self.headers.get('Content-Length',0)))
  if self.path=='/start':start()
  elif self.path=='/input' and master is not None:os.write(master,body)
  self.send_response(200);self.end_headers();self.wfile.write(b'ok')
ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
