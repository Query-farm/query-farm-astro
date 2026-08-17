# DuckDB Extension Function Documentation Components

This directory contains reusable components for documenting DuckDB extension functions.

## Components

### DuckDBExtensionFunctionDoc.astro
Main wrapper component that renders complete function documentation including signature, parameters, returns, description, examples, and navigation.

### DuckDBExtensionFunctionSignature.astro
Displays the function signature with syntax highlighting.

### DuckDBExtensionFunctionParameters.astro
Renders a table of function parameters with type information, parameter type (positional/named), default values, and descriptions.

### DuckDBExtensionFunctionReturns.astro
Displays return type information - either as simple text for scalar/aggregate functions or as a table for table-returning functions.

## Usage

### Basic Example (Scalar Function)

```astro
---
import DuckDBExtensionFunctionDoc from '../components/docs/DuckDBExtensionFunctionDoc.astro';
---

<DuckDBExtensionFunctionDoc
  id="crypto_sha256"
  name="crypto_sha256"
  type="scalar"
  signature={`<span class="font-semibold text-soil-900">crypto_sha256</span>(<span class="text-field-700">input</span>: <span class="text-sun-700">VARCHAR</span>) → <span class="text-sun-700">VARCHAR</span>`}
  parameters={[
    {
      name: 'input',
      type: 'VARCHAR',
      paramType: 'positional',
      description: 'The text to hash'
    }
  ]}
  returns="64-character hexadecimal string representing the SHA-256 hash"
  description="Computes the SHA-256 cryptographic hash of the input string."
  examples={`-- Basic usage
SELECT crypto_sha256('Hello, World!') AS hash;`}
/>
```

### Function with Named Parameters

```astro
<DuckDBExtensionFunctionDoc
  id="crypto_bcrypt"
  name="crypto_bcrypt"
  type="scalar"
  signature={`<span class="font-semibold text-soil-900">crypto_bcrypt</span>(<span class="text-field-700">password</span>: <span class="text-sun-700">VARCHAR</span>, <span class="text-soil-600">cost</span> := <span class="text-sun-700">INTEGER</span> = 10) → <span class="text-sun-700">VARCHAR</span>`}
  parameters={[
    {
      name: 'password',
      type: 'VARCHAR',
      paramType: 'positional',
      description: 'The password to hash'
    },
    {
      name: 'cost',
      type: 'INTEGER',
      paramType: 'named',
      default: '10',
      description: 'Work factor (4-31)'
    }
  ]}
  returns="Bcrypt hash string (60 characters)"
  description="Hashes a password using the bcrypt algorithm."
  examples={`INSERT INTO users (username, password_hash)
VALUES ('alice', crypto_bcrypt('secret_password', cost := 12));`}
/>
```

### Table-Returning Function

```astro
<DuckDBExtensionFunctionDoc
  id="crypto_generate_keys"
  name="crypto_generate_keys"
  type="table"
  signature={`<span class="font-semibold text-soil-900">crypto_generate_keys</span>(<span class="text-field-700">count</span>: <span class="text-sun-700">INTEGER</span>) → TABLE(...)`}
  parameters={[
    {
      name: 'count',
      type: 'INTEGER',
      paramType: 'positional',
      description: 'Number of key pairs to generate'
    }
  ]}
  returnsTable={[
    { name: 'key_id', type: 'INTEGER', description: 'Unique identifier' },
    { name: 'public_key', type: 'VARCHAR', description: 'PEM-encoded public key' },
    { name: 'private_key', type: 'VARCHAR', description: 'PEM-encoded private key' }
  ]}
  description="Generates RSA public/private key pairs in bulk."
  examples={`SELECT * FROM crypto_generate_keys(10);`}
/>
```

### Aggregate Function

```astro
<DuckDBExtensionFunctionDoc
  id="crypto_hash_agg"
  name="crypto_hash_agg"
  type="aggregate"
  signature={`<span class="font-semibold text-soil-900">crypto_hash_agg</span>(<span class="text-field-700">value</span>: <span class="text-sun-700">VARCHAR</span>) → <span class="text-sun-700">VARCHAR</span>`}
  parameters={[
    {
      name: 'value',
      type: 'VARCHAR',
      paramType: 'positional',
      description: 'The value to hash (from each row)'
    }
  ]}
  returns="Aggregated hash combining all input values"
  description="Aggregates multiple values into a single cryptographic hash."
  examples={`SELECT crypto_hash_agg(email) AS users_fingerprint FROM users;`}
/>
```

## Data Structure Approach

For larger extension pages, you can define function data in a separate TypeScript file:

```typescript
// src/data/my-extension-functions.ts
import type { FunctionDocData } from './crypto-functions';

export const myFunctions: FunctionDocData[] = [
  {
    id: 'my_function',
    name: 'my_function',
    type: 'scalar',
    signature: '...',
    parameters: [...],
    returns: '...',
    description: '...',
    examples: '...'
  }
];
```

Then use it in your page:

```astro
---
import DuckDBExtensionFunctionDoc from '../components/docs/DuckDBExtensionFunctionDoc.astro';
import { myFunctions } from '../data/my-extension-functions';
---

{myFunctions.map(func => (
  <DuckDBExtensionFunctionDoc {...func} />
))}
```

## Props

### DuckDBExtensionFunctionDoc

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `id` | string | Yes | Unique ID for the function (used for anchor links) |
| `name` | string | Yes | Function name |
| `type` | 'scalar' \| 'table' \| 'aggregate' | Yes | Function type |
| `signature` | string | Yes | HTML string with syntax-highlighted signature |
| `parameters` | Parameter[] | Yes | Array of parameter objects |
| `returns` | string | No | Return type description (for scalar/aggregate) |
| `returnsTable` | ReturnColumn[] | No | Return table columns (for table functions) |
| `description` | string | Yes | Function description |
| `examples` | string | Yes | SQL code examples |

### Parameter Object

```typescript
{
  name: string;           // Parameter name
  type: string;           // SQL type (e.g., VARCHAR, INTEGER)
  paramType: 'positional' | 'named';  // Parameter type
  default?: string;       // Default value (for named parameters)
  description: string;    // Parameter description
  varargs?: boolean;      // If true, this parameter can repeat any number of times
}
```

### ReturnColumn Object

```typescript
{
  name: string;          // Column name
  type: string;          // SQL type
  description: string;   // Column description
}
```

## Styling

The components use the Query.Farm design system with:
- **Harvest green** for function names
- **Duck yellow** for positional parameters
- **Purple** for named parameters
- **Blue** for types
- Proper badges and visual hierarchy
