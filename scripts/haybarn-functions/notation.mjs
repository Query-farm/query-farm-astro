// SQL operators are exposed as scalar catalog entries. Their notation is a
// presentation layer; never rewrite the engine's name, parameters, or kind.
export const isOperatorName = name => /^[+\-*/%<>=~!@^&|]+(?:__postfix)?$/.test(name);
export const operatorSymbol = name => name.replace(/__postfix$/, '');
export const referenceName = name => isOperatorName(name) ? operatorSymbol(name) : `${name}()`;

export function operandNames(row) {
  return row.parameters.map((name, i) => /^col\d+$/.test(name) ? row.parameters.length === 2 ? ['left', 'right'][i] : 'operand' : name);
}

export function operatorNotation(row, includeTypes = false) {
  if (!isOperatorName(row.function_name) || row.varargs || ![1, 2].includes(row.parameters.length)) return null;
  const operands = operandNames(row).map((name, i) => includeTypes ? `${name}: ${row.parameter_types[i] ?? 'unknown'}` : name);
  const symbol = operatorSymbol(row.function_name);
  const form = operands.length === 2 ? 'infix' : row.function_name.endsWith('__postfix') ? 'postfix' : 'prefix';
  const expression = form === 'infix' ? `${operands[0]} ${symbol} ${operands[1]}` : form === 'postfix' ? `${operands[0]}${symbol}` : `${symbol}${operands[0]}`;
  return { symbol, form, operands: operandNames(row), expression };
}
