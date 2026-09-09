"""Collect function links and real anchors from DuckDB's documentation."""
import json
import re
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parents[2]
names = {row['function_name'] for path in (root / 'src/haybarn-functions/data/snapshots').glob('*.json') for row in json.loads(path.read_text())['functions']}
cache = root / '.cache/upstream-docs'
cache.mkdir(parents=True, exist_ok=True)


def fetch(url):
    for _ in range(4):
        key = cache / (urlparse(url).path.strip('/').replace('/', '_') + '.html')
        if key.exists():
            html = key.read_text()
        else:
            with urlopen(Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=25) as response:
                html = response.read().decode()
            key.write_text(html)
        redirect = re.search(r'<meta[^>]+http-equiv="refresh"[^>]+url=([^" >]+)', html, re.I)
        if not redirect:
            return url, html
        url = urljoin(url, redirect[1])
    raise ValueError('Too many redirects: ' + url)


class Page(HTMLParser):
    def __init__(self, url):
        super().__init__()
        self.url = url
        self.links = set()
        self.title = ''
        self.heading = None
        self.text = []
        self.matches = {}
        self.anchor = None
        self.code = None

    def handle_starttag(self, tag, attributes):
        attributes = dict(attributes)
        if tag == 'a' and attributes.get('href'):
            self.links.add(urljoin(self.url, attributes['href']).split('#')[0])
        if tag in ('title', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'):
            self.heading = (tag, attributes.get('id'))
            self.text = []
            if attributes.get('id'): self.anchor = attributes['id']
        if tag == 'code' and not self.heading: self.code = []

    def handle_data(self, text):
        if self.heading:
            self.text.append(text)
        if self.code is not None: self.code.append(text)

    def handle_endtag(self, tag):
        if tag == 'code' and self.code is not None:
            code = ''.join(self.code).strip()
            if len(code) < 160 and self.anchor:
                for name in re.findall(r'([A-Za-z_][A-Za-z_0-9]*)\s*\(', code):
                    if name.lower() in names: self.matches.setdefault(name.lower(), self.url + '#' + self.anchor)
            self.code = None
        if not self.heading or tag != self.heading[0]:
            return
        text = ''.join(self.text).strip()
        if tag in ('title', 'h1'):
            self.title = re.sub(r'\s*[–—|]\s*DuckDB$', '', text)
        anchor = self.heading[1]
        matches = re.findall(r'([A-Za-z_][A-Za-z_0-9]*)\s*\(', text)
        if text.lower() in names:
            matches.append(text.lower())
        for name in matches:
            if name.lower() in names and anchor:
                self.matches[name.lower()] = self.url + '#' + anchor
        self.heading = None


url, html = fetch('https://duckdb.org/docs/current/sql/functions/overview.html')
overview = Page(url)
overview.feed(html)
paths = ('/sql/functions/', '/data/csv/', '/data/json/', '/data/parquet/', '/sql/data_types/', '/sql/meta/', '/configuration/pragmas', '/sql/query_syntax/unnest', '/core_extensions/icu')
urls = sorted(link for link in overview.links if link.startswith('https://duckdb.org/docs/current/') and any(path in link for path in paths))


def capture(url):
    url, html = fetch(url)
    page = Page(url)
    page.feed(html)
    return page


pages = list(ThreadPoolExecutor(max_workers=8).map(capture, urls))
index = {}
for page in pages:
    for name, url in page.matches.items():
        index.setdefault(name, []).append({'title': page.title or 'DuckDB documentation', 'url': url})
output = {'source': 'https://duckdb.org/docs/current/', 'functions': dict(sorted(index.items())),
          'pages': [{'title': page.title, 'url': page.url} for page in pages]}
(root / 'src/haybarn-functions/data/upstream-docs.json').write_text(json.dumps(output, indent=2) + '\n')
print(f'Captured links for {len(index)} functions from {len(pages)} DuckDB documentation pages.')
