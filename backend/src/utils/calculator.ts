export type ProductParams = {
  weightPerPiece: number; // WghPcs
  quantityPerMeasurement: number; // Qty
  tolerance: number; // DevW
};

export function standardWeight({ weightPerPiece, quantityPerMeasurement }: ProductParams): number {
  return weightPerPiece * quantityPerMeasurement;
}

export function minWeight({ weightPerPiece, quantityPerMeasurement }: ProductParams): number {
  return standardWeight({ weightPerPiece, quantityPerMeasurement, tolerance: 0 }) - weightPerPiece / 2;
}

export function maxWeight({ weightPerPiece, quantityPerMeasurement }: ProductParams): number {
  return standardWeight({ weightPerPiece, quantityPerMeasurement, tolerance: 0 }) + weightPerPiece / 2;
}

export function dMin({ weightPerPiece, quantityPerMeasurement, tolerance }: ProductParams): number {
  return standardWeight({ weightPerPiece, quantityPerMeasurement, tolerance }) - tolerance;
}

export function dMax({ weightPerPiece, quantityPerMeasurement, tolerance }: ProductParams): number {
  return standardWeight({ weightPerPiece, quantityPerMeasurement, tolerance }) + tolerance;
}

export type Classification = 'GREEN' | 'YELLOW' | 'RED';

export function classify(weight: number, p: ProductParams): Classification {
  const s = standardWeight(p);
  const mn = s - p.weightPerPiece / 2;
  const mx = s + p.weightPerPiece / 2;
  const dmn = s - p.tolerance;
  const dmx = s + p.tolerance;

  if (weight >= dmn && weight <= dmx) return 'GREEN';
  if ((weight < dmn && weight >= mn) || (weight > dmx && weight <= mx)) return 'YELLOW';
  return 'RED';
}
