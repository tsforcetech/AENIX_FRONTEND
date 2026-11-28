/**
 * MASTERS M2: defaults from the Asset categories master — useful life and residual value as a
 * percentage of cost. Display maths only; finance confirms each asset's figures.
 */
export interface AssetCategoryDefaults {
  usefulLifeMonths: number;
  residualPct: number;
}

/** Residual value (AED, 2 dp) for a cost and a residual %; 0 when the cost is not a positive number. */
export function residualFromPct(cost: number, residualPct: number): number {
  if (!Number.isFinite(cost) || cost <= 0 || !Number.isFinite(residualPct) || residualPct <= 0) return 0;
  return Math.round(cost * residualPct) / 100;
}

/** Form values (as text) to pre-fill when a category is chosen. */
export function categoryPrefill(
  defaults: AssetCategoryDefaults,
  costText: string,
): { usefulLifeMonths: string; residualValue: string } {
  return {
    usefulLifeMonths: String(defaults.usefulLifeMonths),
    residualValue: String(residualFromPct(Number(costText), defaults.residualPct)),
  };
}
