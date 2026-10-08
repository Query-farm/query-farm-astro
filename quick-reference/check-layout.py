#!/usr/bin/env python3
"""Verify every reference PDF using Poppler's text geometry and page metadata."""
import json
import re
import subprocess
import tempfile
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DIRECTORY = json.loads((ROOT / 'quick-reference/directory.json').read_text())
errors = []
with tempfile.TemporaryDirectory(prefix='qf-layout-') as tmp:
    for entry in DIRECTORY + [{'slug': 'index', 'pages': 1}]:
        slug = entry['slug']
        pdf = ROOT / 'public/quick-reference' / f'{slug}.pdf'
        info = subprocess.check_output(['pdfinfo', str(pdf)], text=True)
        actual = int(re.search(r'^Pages:\s+(\d+)', info, re.M)[1])
        if actual != entry['pages']:
            errors.append(f'{slug}: expected {entry["pages"]} pages, got {actual}')
        if '612 x 792 pts' not in info:
            errors.append(f'{slug}: unexpected paper size')
        bbox = Path(tmp) / f'{slug}.html'
        subprocess.run(['pdftotext', '-bbox', str(pdf), str(bbox)], check=True)
        tree = ET.parse(bbox)
        for i, page in enumerate(tree.findall('.//{*}page'), 1):
            for word in page.findall('.//{*}word'):
                a = {key: float(value) for key, value in word.attrib.items()}
                if a['xMin'] < 29 or a['xMax'] > 583 or a['yMax'] > 789:
                    errors.append(f'{slug} p{i}: text outside margin: {word.text}')
                # Body columns end/start at x=296/316; crossing their midpoint
                # catches long unbroken API names and overflowing code lines.
                if slug != 'index' and 208 < a['yMin'] < 754 and a['xMin'] < 305 < a['xMax']:
                    errors.append(f'{slug} p{i}: text crosses column gutter: {word.text}')
        text = subprocess.check_output(['pdftotext', str(pdf), '-'], text=True)
        for literal in ['docs(slug', 'meta.githubUrl', 'data.examples', 'example.sql']:
            if literal in text:
                errors.append(f'{slug}: unrendered Typst: {literal}')
        if slug != 'index':
            links = subprocess.check_output(['pdfinfo', '-url', str(pdf)], text=True)
            if f'https://query.farm/products/extensions/{slug}/' not in links:
                errors.append(f'{slug}: missing documentation link')
        fonts = subprocess.check_output(['pdffonts', str(pdf)], text=True)
        for line in fonts.splitlines()[2:]:
            if not re.search(r'\byes\s+yes\s+yes\b', line):
                errors.append(f'{slug}: font is not embedded/subset/Unicode: {line}')

combined = ROOT / 'public/quick-reference/query-farm-extensions.pdf'
info = subprocess.check_output(['pdfinfo', str(combined)], text=True)
count = int(re.search(r'^Pages:\s+(\d+)', info, re.M)[1])
expected = 1 + sum(entry['pages'] for entry in DIRECTORY)
if count != expected:
    errors.append(f'collection: expected {expected} pages, got {count}')
if errors:
    raise SystemExit('\n'.join(errors))
print(f'PASS: {len(DIRECTORY)} guides + directory; {count}-page collection; page geometry, columns, embedded fonts, links and text checked.')
