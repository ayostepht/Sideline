export interface SparkPoint {
  index: number;
  value: number;
  x: number;
  y: number;
}

export interface SparkGeometry {
  /** SVG path data. Gaps (nulls) start a new "M" segment. Empty string when no points. */
  path: string;
  points: SparkPoint[];
  /** Y of the reference line, or null when none was given. */
  referenceY: number | null;
}

/** Pure path builder. Values may contain null for gaps. */
export function buildSparkline(
  values: ReadonlyArray<number | null>,
  width: number,
  height: number,
  reference?: number | null,
  pad = 2,
): SparkGeometry {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const ref =
    reference !== undefined && reference !== null && Number.isFinite(reference) ? reference : null;
  if (nums.length === 0) return { path: "", points: [], referenceY: null };
  const domain = ref === null ? nums : [...nums, ref];
  const min = Math.min(...domain);
  const max = Math.max(...domain);
  const innerH = Math.max(0, height - pad * 2);
  const innerW = Math.max(0, width - pad * 2);
  const yOf = (v: number): number =>
    max === min ? height / 2 : pad + innerH - ((v - min) / (max - min)) * innerH;
  const xOf = (i: number): number =>
    values.length <= 1 ? width / 2 : pad + (i / (values.length - 1)) * innerW;
  const r = (n: number): number => Math.round(n * 100) / 100;
  const points: SparkPoint[] = [];
  let path = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      pen = false;
      return;
    }
    const x = r(xOf(i));
    const y = r(yOf(v));
    points.push({ index: i, value: v, x, y });
    path += `${pen ? "L" : path ? " M" : "M"}${x} ${y}`;
    pen = true;
  });
  return { path, points, referenceY: ref === null ? null : r(yOf(ref)) };
}
