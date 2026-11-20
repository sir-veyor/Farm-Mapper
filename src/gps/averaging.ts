export interface Sample { lon: number; lat: number; accuracyM: number; time: number }

export interface AvgResult {
  lon: number;
  lat: number;
  accuracyM: number;     // median accuracy of the samples used (not divided by sqrt(n): GPS errors are correlated)
  spreadM: number;       // RMS distance of used samples from the mean
  samplesUsed: number;
  samplesRejected: number;
  lowQuality: boolean;   // nothing met the accuracy threshold; best half used instead
}

export class NotEnoughFixes extends Error {
  constructor() { super('Not enough GPS fixes to average. Move to open sky and try again.'); this.name = 'NotEnoughFixes'; }
}

const median = (v: number[]): number => {
  const s = [...v].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Weighted mean position (weight 1/accuracy^2) over samples that meet the accuracy threshold. */
export function averageSamples(input: Sample[], opts: { maxAcceptAccuracyM: number }): AvgResult {
  const seen = new Set<number>();
  const samples = input.filter((s) => Number.isFinite(s.lon + s.lat + s.accuracyM) && !seen.has(s.time) && seen.add(s.time));
  if (samples.length < 3) throw new NotEnoughFixes();

  let used = samples.filter((s) => s.accuracyM <= opts.maxAcceptAccuracyM);
  let lowQuality = false;
  if (!used.length) {
    used = [...samples].sort((a, b) => a.accuracyM - b.accuracyM).slice(0, Math.max(3, Math.ceil(samples.length / 2)));
    lowQuality = true;
  }

  const lat0 = used[0].lat, lon0 = used[0].lon;
  const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110540;
  const pts = used.map((s) => ({ x: (s.lon - lon0) * kx, y: (s.lat - lat0) * ky, w: 1 / Math.max(s.accuracyM, 0.5) ** 2 }));
  const wSum = pts.reduce((a, p) => a + p.w, 0);
  const mx = pts.reduce((a, p) => a + p.w * p.x, 0) / wSum;
  const my = pts.reduce((a, p) => a + p.w * p.y, 0) / wSum;
  const spread = Math.sqrt(pts.reduce((a, p) => a + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / pts.length);

  return {
    lon: lon0 + mx / kx, lat: lat0 + my / ky,
    accuracyM: median(used.map((s) => s.accuracyM)), spreadM: spread,
    samplesUsed: used.length, samplesRejected: samples.length - used.length, lowQuality,
  };
}
