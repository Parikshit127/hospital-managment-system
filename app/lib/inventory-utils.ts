export async function nextDocNumber(
  db: any,
  prefix: string,
  field: string,
  column: string,
): Promise<string> {
  const model = db[field];
  const year = new Date().getFullYear();
  const pattern = `${prefix}-${year}-`;
  const latest = await model.findFirst({
    where: { [column]: { startsWith: pattern } },
    orderBy: { id: 'desc' },
    select: { [column]: true },
  });
  const lastSeq = latest?.[column]
    ? parseInt(String(latest[column]).split('-').pop() || '0', 10)
    : 0;
  return `${pattern}${String(lastSeq + 1).padStart(5, '0')}`;
}

export function calcMovingAverage(
  currentQty: number,
  currentAvg: number,
  incomingQty: number,
  incomingCost: number,
): number {
  const totalQty = currentQty + incomingQty;
  if (totalQty <= 0) return incomingCost;
  return (currentQty * currentAvg + incomingQty * incomingCost) / totalQty;
}

export function itemCodePrefix(itemType: string): string {
  const map: Record<string, string> = {
    CONSUMABLE: 'CON',
    REAGENT: 'REG',
    IMPLANT: 'IMP',
    LINEN: 'LIN',
    STATIONERY: 'STA',
    MAINTENANCE: 'MNT',
    EQUIPMENT_SPARE: 'ESP',
    FOOD_DIETARY: 'FDT',
    OTHER: 'OTH',
  };
  return map[itemType] || 'INV';
}
