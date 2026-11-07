// Star colours from the B−V colour index.

/** Ballesteros (2012) B−V → effective temperature in kelvin. */
export function bvToTemperature(bv: number): number {
  const c = Math.min(2.0, Math.max(-0.4, bv));
  return 4600 * (1 / (0.92 * c + 1.7) + 1 / (0.92 * c + 0.62));
}

/**
 * Approximate blackbody colour (Tanner Helland's fit), as linear-ish RGB in
 * [0, 1], normalised so the brightest channel is 1.
 */
export function temperatureToRgb(kelvin: number): [number, number, number] {
  const t = Math.min(40000, Math.max(1000, kelvin)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (x: number) => Math.min(255, Math.max(0, x)) / 255;
  const rgb: [number, number, number] = [c(r), c(g), c(b)];
  const m = Math.max(...rgb) || 1;
  return [rgb[0] / m, rgb[1] / m, rgb[2] / m];
}

export function bvToRgb(bv: number): [number, number, number] {
  return temperatureToRgb(bvToTemperature(bv));
}
