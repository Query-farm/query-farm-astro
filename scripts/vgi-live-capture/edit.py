"""Make labeled highlights from a real capture; retain the full-speed original."""
import json, subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'public/vgi/agents'
SCRATCH=ROOT/'.cache/vgi-live-capture'
SCENES=[
 (16,34,1,'The request goes to the running Codex CLI, with the VGI skill installed.'),
 (146,178,2,'Codex writes the Python worker that exposes GitHub releases to DuckDB.'),
 (250,265,1.5,'The agent runs tests against HTTP fixtures, including pagination and empty results.'),
 (345,369,2,'The worker also passes actual DuckDB SQL checks, including API errors and the inventory join.'),
 (407,422,1.5,'Codex runs the live GitHub API query through the worker.'),
 (450,470,1,'The final answer includes the live query result and the command to reproduce it. The local inventory is sample data.'),
]
segments=[];captions=[];cursor=0
for i,(start,end,speed,caption) in enumerate(SCENES):
 segment=SCRATCH/f'highlight-{i}.mp4'
 label=SCRATCH/f'speed-{speed:g}.png'
 filter=f"[0:v]setpts=(PTS-STARTPTS)/{speed}[main];[main][1:v]overlay=700:18:shortest=1"
 subprocess.run(['ffmpeg','-y','-ss',str(start),'-t',str(end-start),'-i',str(OUT/'github-build-full.mp4'),'-loop','1','-i',str(label),'-filter_complex',filter,'-t',str((end-start)/speed),'-an','-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-r','25',str(segment)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 segments.append(segment);duration=(end-start)/speed;captions.append((cursor,cursor+duration,caption));cursor+=duration
(SCRATCH/'concat.txt').write_text(''.join(f"file '{path}'\n" for path in segments))
subprocess.run(['ffmpeg','-y','-f','concat','-safe','0','-i',str(SCRATCH/'concat.txt'),'-c','copy','-movflags','+faststart',str(OUT/'github-build.mp4')],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
def stamp(seconds):
 ms=round(seconds*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02}.{ms%1000:03}'
(OUT/'github-build.vtt').write_text('WEBVTT\n\n'+'\n'.join(f'{stamp(a)} --> {stamp(b)}\n{text}\n' for a,b,text in captions))
(OUT/'github-build-edit.json').write_text(json.dumps({'source':'github-build-full.mp4','scenes':[{'source_start':a,'source_end':b,'speed':s,'caption':c} for a,b,s,c in SCENES],'highlight_seconds':cursor},indent=2)+'\n')
print(json.dumps({'highlight_seconds':cursor,'scenes':len(SCENES)}))
