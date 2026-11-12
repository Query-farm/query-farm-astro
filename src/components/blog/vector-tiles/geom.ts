// Turn the exported GeoJSON-style geometries into SVG path data at build time.

export type Geometry = { type: string; coordinates: any };
export type Project = (x: number, y: number) => [number, number];

let scaleDigits = 10;
const f = (v: number) => (Math.round(v * scaleDigits) / scaleDigits).toString();

function ring(points: number[][], project: Project, close: boolean): string {
  let out = '';
  let last = '';
  for (const p of points) {
    const [x, y] = project(p[0], p[1]);
    const xy = `${f(x)} ${f(y)}`;
    if (xy === last) continue; // drop points that round onto the previous one
    out += `${out ? 'L' : 'M'}${xy}`;
    last = xy;
  }
  return out + (close ? 'Z' : '');
}

/** SVG path data for a line or polygon geometry (single or multi), rounded to `digits` decimals. */
export function pathData(g: Geometry, project: Project, digits = 1): string {
  scaleDigits = 10 ** digits;
  switch (g.type) {
    case 'LineString':
      return ring(g.coordinates, project, false);
    case 'MultiLineString':
      return g.coordinates.map((l: number[][]) => ring(l, project, false)).join('');
    case 'Polygon':
      return g.coordinates.map((r: number[][]) => ring(r, project, true)).join('');
    case 'MultiPolygon':
      return g.coordinates.flatMap((p: number[][][]) => p.map(r => ring(r, project, true))).join('');
    default:
      return '';
  }
}

/** Point coordinates of a point geometry (single or multi). */
export function points(g: Geometry, project: Project): [number, number][] {
  if (g.type === 'Point') return [project(g.coordinates[0], g.coordinates[1])];
  if (g.type === 'MultiPoint') return g.coordinates.map((p: number[]) => project(p[0], p[1]));
  return [];
}

/** A rough centre of a geometry (mean of its vertices), for assigning it to a tile. */
export function centre(g: Geometry): [number, number] {
  const flat: number[][] = [];
  const walk = (c: any) => (typeof c[0] === 'number' ? flat.push(c) : c.forEach(walk));
  walk(g.coordinates);
  const n = flat.length || 1;
  return [flat.reduce((s, p) => s + p[0], 0) / n, flat.reduce((s, p) => s + p[1], 0) / n];
}

export const fmtInt = (n: number) => n.toLocaleString('en-US');
export const fmtBytes = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`;
