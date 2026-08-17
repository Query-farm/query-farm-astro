# Function Signature Renderer - Implementation Guide

## Overview

Function signatures are now generated from clean data structures instead of HTML strings, making styling consistent and data easier to maintain.

## Migration: Before vs After

### **OLD WAY** (HTML in data):
```typescript
{
  id: 'crypto_sha256',
  name: 'crypto_sha256',
  signature: `<span class="text-harvest-700">crypto_sha256</span>(<span class="text-duck-700">input</span>: <span class="text-blue-600">VARCHAR</span>) → <span class="text-blue-600">VARCHAR</span>`,
  parameters: [{ name: 'input', type: 'VARCHAR', paramType: 'positional', description: '...' }],
  returns: '64-character hexadecimal string...',
}
```

### **NEW WAY** (Clean data):
```typescript
{
  id: 'crypto_sha256',
  name: 'crypto_sha256',
  returnType: 'VARCHAR',  // ← Just the type, no HTML!
  parameters: [{ name: 'input', type: 'VARCHAR', paramType: 'positional', description: '...' }],
  returns: '64-character hexadecimal string...',
}
```

The component automatically generates:
```
crypto_sha256(input: VARCHAR) → VARCHAR
```

With proper color styling (Strata Sun palette — see DESIGN_BRIEF.md §3/§4):
- Function name: soil-900, semibold (ink)
- Positional params: field-700 (the one cool note)
- Named params: soil-600 — the `:=` separator carries the real distinction
- Types (arguments and return): sun-700 (the only gold that carries text on paper)

## How It Works

### 1. **FunctionSignatureRenderer Component**

Located: `/src/components/docs/FunctionSignatureRenderer.astro`

**Props:**
```typescript
{
  functionName: string;         // e.g., "crypto_sha256"
  parameters: Parameter[];       // Already defined in your data
  returnType?: string;           // e.g., "VARCHAR", "BOOLEAN"
  returnsTable?: {               // For table functions
    columns: { name: string; type: string }[];
  };
}
```

**Rendering Logic:**
- **Positional parameters**: `name: TYPE`
- **Named parameters**: `name := TYPE` or `name := TYPE = default`
- **Return types**: `→ VARCHAR` or `→ TABLE(col1 TYPE1, col2 TYPE2)`

### 2. **Data Structure**

**TypeScript Interface:**
```typescript
export interface FunctionDocData {
  id: string;
  name: string;
  type: 'scalar' | 'table' | 'aggregate';
  category: string;

  // OLD (deprecated but still supported)
  signature: string;

  // NEW (preferred)
  returnType?: string;           // For scalar/aggregate functions

  parameters: FunctionParameter[];
  returns?: string;              // Human-readable description
  returnsTable?: ReturnColumn[]; // For table functions
  // ... rest
}
```

## Conversion Examples

### **Scalar Function:**
```typescript
// Before
signature: `<span class="text-harvest-700">crypto_sha512</span>(<span class="text-duck-700">input</span>: <span class="text-blue-600">VARCHAR</span>) → <span class="text-blue-600">VARCHAR</span>`

// After
returnType: 'VARCHAR'
// Parameters array already has the input parameter defined!
```

### **Named Parameter Function:**
```typescript
// crypto_bcrypt example
{
  name: 'crypto_bcrypt',
  returnType: 'VARCHAR',
  parameters: [
    { name: 'password', type: 'VARCHAR', paramType: 'positional', description: '...' },
    { name: 'cost', type: 'INTEGER', paramType: 'named', default: '10', description: '...' }
  ]
}

// Renders as:
// crypto_bcrypt(password: VARCHAR, cost := INTEGER = 10) → VARCHAR
```

### **Table Function:**
```typescript
{
  name: 'crypto_generate_keys',
  type: 'table',
  parameters: [
    { name: 'count', type: 'INTEGER', paramType: 'positional', description: '...' },
    { name: 'key_size', type: 'INTEGER', paramType: 'named', default: '2048', description: '...' }
  ],
  returnsTable: [
    { name: 'key_id', type: 'INTEGER', description: '...' },
    { name: 'public_key', type: 'VARCHAR', description: '...' },
    { name: 'private_key', type: 'VARCHAR', description: '...' },
    { name: 'created_at', type: 'TIMESTAMP', description: '...' }
  ]
}

// Renders as:
// crypto_generate_keys(count: INTEGER, key_size := INTEGER = 2048)
//   → TABLE(key_id INTEGER, public_key VARCHAR, private_key VARCHAR, created_at TIMESTAMP)
```

### **Aggregate Function:**
```typescript
{
  name: 'crypto_hash_agg',
  type: 'aggregate',
  returnType: 'VARCHAR',
  parameters: [
    { name: 'value', type: 'VARCHAR', paramType: 'positional', description: '...' },
    { name: 'algorithm', type: 'VARCHAR', paramType: 'named', default: "'sha256'", description: '...' }
  ]
}

// Renders as:
// crypto_hash_agg(value: VARCHAR, algorithm := VARCHAR = 'sha256') → VARCHAR
```

## Benefits

✅ **Separation of Concerns**: Data contains data, not presentation logic
✅ **Type Safety**: TypeScript validates the structure
✅ **Consistency**: All signatures use the same styling automatically
✅ **Maintainability**: Change styling in one place (the component)
✅ **Readability**: Clean data structure is easier to read and write
✅ **Backwards Compatible**: Old `signature` field still works

## Migration Checklist

For each function in `crypto-functions.ts`:

1. [ ] Add `returnType: 'TYPE'` field (for scalar/aggregate)
2. [ ] Verify `parameters` array is complete and accurate
3. [ ] For table functions, verify `returnsTable` array exists
4. [ ] Mark old `signature` field as `// DEPRECATED` (don't delete yet)
5. [ ] Test that signature renders correctly

## Color Reference

From the FunctionSignatureRenderer component:
- **Function Name**: `font-semibold text-soil-900`
- **Positional Parameters**: `text-field-700`
- **Named Parameters**: `text-soil-600`
- **Types**: `text-sun-700`
- **Background**: `bg-soil-50` inside a `border-soil-200` rule

The same four inks are reproduced by the lazy client-side renderer in
`DuckDBExtensionFunctionReference.astro` (`renderCard`). Change one and change
the other, or hydrated cards stop matching server-rendered ones.

## Current Status

**Migrated:**
- ✅ crypto_sha256 (includes returnType)

**To Migrate:**
- ⏳ crypto_sha512
- ⏳ crypto_hmac_sha256
- ⏳ crypto_bcrypt
- ⏳ crypto_bcrypt_verify
- ⏳ crypto_generate_keys
- ⏳ crypto_audit_trail
- ⏳ crypto_hash_agg
- ⏳ crypto_merkle_root

## Example: Full Migration

```typescript
export const cryptoFunctions: FunctionDocData[] = [
  {
    id: 'crypto_sha256',
    name: 'crypto_sha256',
    type: 'scalar',
    category: 'Hashing',
    returnType: 'VARCHAR',  // ← New clean approach
    parameters: [
      {
        name: 'input',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'The text to hash'
      }
    ],
    returns: '64-character hexadecimal string representing the SHA-256 hash',
    description: 'Computes the SHA-256 cryptographic hash...',
    examples: `...`,
    relatedFunctions: [...]
  }
  // ... more functions
];
```
