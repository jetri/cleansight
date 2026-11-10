import { geometrySchema } from './api/types';
import type { Geometry, Point } from './api/types';

const epsilon = 1e-9;
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function onSegment(a: Point, b: Point, c: Point) {
  return Math.abs(cross(a, b, c)) < epsilon &&
    c[0] >= Math.min(a[0], b[0]) - epsilon && c[0] <= Math.max(a[0], b[0]) + epsilon &&
    c[1] >= Math.min(a[1], b[1]) - epsilon && c[1] <= Math.max(a[1], b[1]) + epsilon;
}
function intersects(a: Point, b: Point, c: Point, d: Point) {
  const ab = cross(a, b, c) * cross(a, b, d);
  const cd = cross(c, d, a) * cross(c, d, b);
  return (ab < -epsilon && cd < -epsilon) || onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b);
}

/** Early feedback only. The server owns revision validation and activation. */
export function validateGeometry(value: Geometry): string | null {
  const result = geometrySchema.safeParse(value);
  if (!result.success) return 'Use at least one named ground polygon with 3-128 finite vertices in 0-100%, and a boundary buffer in 0-25%.';
  const names = new Set<string>();
  for (const [index, polygon] of [...value.zones, ...value.exclusions].entries()) {
    const name = polygon.name.trim();
    const key = `${index < value.zones.length ? 'ground' : 'exclusion'}:${name}`;
    if (!name || names.has(key)) return 'Every polygon needs a distinct, nonempty name within its kind.';
    names.add(key);
    const points = polygon.points;
    if (new Set(points.map(point => point.join(','))).size !== points.length) return `${name}: remove duplicate vertices.`;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      area += a[0] * b[1] - b[0] * a[1];
      for (let j = i + 1; j < points.length; j++) {
        if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
        if (intersects(a, b, points[j]!, points[(j + 1) % points.length]!)) return `${name}: polygon edges cross or overlap.`;
      }
    }
    if (Math.abs(area) < epsilon) return `${name}: the polygon is collapsed. Add a non-collinear vertex.`;
  }
  return null;
}

export function normalizedPoint(clientX: number, clientY: number, bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>): Point | null {
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const x = (clientX - bounds.left) / bounds.width;
  const y = (clientY - bounds.top) / bounds.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
}
