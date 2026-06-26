/**
 * Converts Prisma query results (Decimal, BigInt, Date) into plain JSON-safe values
 * for Server → Client Component props and server action responses.
 */
export function serializePrisma<T>(data: T): T {
  return JSON.parse(
    JSON.stringify(data, (_, value) => {
      if (typeof value === 'bigint') return Number(value);
      if (value instanceof Date) return value.toISOString();
      if (
        typeof value === 'object' &&
        value !== null &&
        value.constructor?.name === 'Decimal'
      ) {
        return Number(value);
      }
      return value;
    }),
  );
}
