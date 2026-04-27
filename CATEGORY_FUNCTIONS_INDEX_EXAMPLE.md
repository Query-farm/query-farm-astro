# Functions Index with Categories - Implementation Example

## How It Works

The Functions Index table is now organized by category, with each category as its own section. Each function displays a category badge that links back to its category section.

## Data Structure

Functions now have a `category` field:

```typescript
{
  id: 'crypto_sha256',
  name: 'crypto_sha256',
  type: 'scalar',
  category: 'Hashing',  // ← New field
  // ... rest of the function data
}
```

## Categories in crypto Extension

- **Hashing** (2 functions): crypto_sha256, crypto_sha512
- **HMAC** (1 function): crypto_hmac_sha256
- **Password** (2 functions): crypto_bcrypt, crypto_bcrypt_verify
- **Key Generation** (1 function): crypto_generate_keys
- **Auditing** (1 function): crypto_audit_trail
- **Aggregation** (2 functions): crypto_hash_agg, crypto_merkle_root

## Updated Functions Index Table Structure

```astro
<!-- In crypto.astro -->
---
import { cryptoFunctions } from '../../data/crypto-functions';

// Group functions by category
const categories = cryptoFunctions.reduce((acc, fn) => {
  if (!acc[fn.category]) {
    acc[fn.category] = [];
  }
  acc[fn.category].push(fn);
  return acc;
}, {} as Record<string, typeof cryptoFunctions>);

// Sort categories
const categoryOrder = ['Hashing', 'HMAC', 'Password', 'Key Generation', 'Auditing', 'Aggregation'];
const sortedCategories = categoryOrder.filter(cat => categories[cat]);
---

<section id="functions-index" class="py-16 lg:py-24 bg-soil-50">
  <div class="section-container">
    <SectionHeader
      eyebrow="Reference"
      title="Functions Index"
      description="Quick reference to all available cryptographic functions organized by category."
      class="mb-12"
    />

    <div class="max-w-6xl mx-auto">
      <Card padding="none" class="overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <!-- Table Header -->
            <thead class="bg-soil-100 border-b-2 border-soil-300">
              <tr>
                <th class="px-4 py-3 text-left font-semibold text-soil-900">Function</th>
                <th class="px-4 py-3 text-left font-semibold text-soil-900">Type</th>
                <th class="px-4 py-3 text-left font-semibold text-soil-900">Description</th>
              </tr>
            </thead>

            <tbody>
              {sortedCategories.map((categoryName, catIndex) => {
                const categoryId = categoryName.toLowerCase().replace(/\s+/g, '-');
                const funcs = categories[categoryName];

                return (
                  <>
                    {/* Category Header Row (spans all columns) */}
                    <tr id={`functions-index-${categoryId}`} class="scroll-mt-32">
                      <td colspan="3" class="px-4 py-3 bg-harvest-50 border-y border-harvest-200">
                        <div class="flex items-center gap-2">
                          <span class="flex items-center justify-center w-6 h-6 rounded bg-harvest-200 text-harvest-800 text-xs font-bold">
                            {funcs.length}
                          </span>
                          <span class="font-bold text-soil-900">{categoryName}</span>
                        </div>
                      </td>
                    </tr>

                    {/* Function Rows */}
                    {funcs.map((fn, fnIndex) => (
                      <tr class={`hover:bg-soil-50 ${fnIndex === funcs.length - 1 && catIndex !== sortedCategories.length - 1 ? 'border-b border-soil-300' : ''}`}>
                        <td class="px-4 py-3">
                          <a href={`#${fn.id}`} class="font-mono text-harvest-700 hover:text-harvest-800 font-medium">
                            {fn.name}()
                          </a>
                        </td>
                        <td class="px-4 py-3">
                          {fn.type === 'scalar' && <Badge variant="info" size="sm">Scalar</Badge>}
                          {fn.type === 'table' && <Badge variant="success" size="sm">Table</Badge>}
                          {fn.type === 'aggregate' && (
                            <span class="inline-flex items-center font-medium rounded-md border px-2 py-1 text-xs bg-orange-100 text-orange-800 border-orange-300">
                              Aggregate
                            </span>
                          )}
                        </td>
                        <td class="px-4 py-3 text-soil-700">{fn.description.split('.')[0]}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  </div>
</section>
```

## Visual Layout

**Single table with category header rows:**

```
┌─────────────────────────────────────────────────────────────┐
│  Functions Index                                            │
│  Quick reference to all available cryptographic...          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Function              │ Type      │ Description             │
├─────────────────────────────────────────────────────────────┤
│ [2] Hashing                                                 │ ← Category header (colspan=3)
│ ─────────────────────────────────────────────────────────── │   id="functions-index-hashing"
│ crypto_sha256()       │ Scalar    │ Computes SHA-256 hash   │
│ crypto_sha512()       │ Scalar    │ Computes SHA-512 hash   │
├─────────────────────────────────────────────────────────────┤ ← Thicker border between categories
│ [2] Password                                                │ ← Category header (colspan=3)
│ ─────────────────────────────────────────────────────────── │   id="functions-index-password"
│ crypto_bcrypt()       │ Scalar    │ Hash password with...   │
│ crypto_bcrypt_verify()│ Scalar    │ Verify password against │
├─────────────────────────────────────────────────────────────┤
│ [1] HMAC                                                    │
│ ─────────────────────────────────────────────────────────── │
│ crypto_hmac_sha256()  │ Scalar    │ Create HMAC signature   │
├─────────────────────────────────────────────────────────────┤
│ [1] Key Generation                                          │
│ ─────────────────────────────────────────────────────────── │
│ crypto_generate_keys()│ Table     │ Generate RSA key pairs  │
├─────────────────────────────────────────────────────────────┤
│ [1] Auditing                                                │
│ ─────────────────────────────────────────────────────────── │
│ crypto_audit_trail()  │ Table     │ Create audit trail      │
├─────────────────────────────────────────────────────────────┤
│ [2] Aggregation                                             │
│ ─────────────────────────────────────────────────────────── │
│ crypto_hash_agg()     │ Aggregate │ Aggregate hash values   │
│ crypto_merkle_root()  │ Aggregate │ Build Merkle tree root  │
└─────────────────────────────────────────────────────────────┘
```

**Benefits:**
- ✅ Single unified table (cleaner)
- ✅ Category headers clearly separate groups
- ✅ Each category has an anchor ID for deep linking
- ✅ Function count badge shows size of each category
- ✅ Easier to scan vertically
- ✅ Better responsive behavior on mobile

## Function Component Display

Each function now shows:

```
┌────────────────────────────────────────────┐
│ crypto_sha256                              │
│ [Scalar Function] [Hashing] ← Links back  │
│                      │                     │
│                      └─→ #functions-index-hashing
└────────────────────────────────────────────┘
```

## Benefits

1. **Better Organization**: Functions grouped logically
2. **Easier Navigation**: Click category badge to return to index
3. **Scalability**: Works for extensions with 50+ functions
4. **Visual Hierarchy**: Count badges show category size
5. **Scroll Anchors**: Deep linking to specific categories

## Implementation Notes

- Category IDs are auto-generated: `categoryName.toLowerCase().replace(/\s+/g, '-')`
- Category order can be customized with `categoryOrder` array
- Scroll offset (`scroll-mt-32`) accounts for sticky header
- Category badge in function header uses tag icon
