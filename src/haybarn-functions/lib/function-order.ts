export function compareFunctionNames(a: string, b: string): number {
  return Number(a.startsWith('__')) - Number(b.startsWith('__')) || a.localeCompare(b);
}
