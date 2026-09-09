const text = { type: 'string' };
const optionalText = { type: ['string', 'null'] };
const texts = { type: 'array', items: text };
const links = { type: 'object', required: ['html', 'markdown', 'json'], properties: { html: text, markdown: text, json: text } };
const catalog = {
  type: 'object',
  required: ['schema_name', 'function_name', 'function_type', 'description', 'return_type', 'parameters', 'parameter_types', 'varargs', 'examples', 'stability', 'has_side_effects', 'alias_of'],
  properties: {
    schema_name: { const: 'main' }, function_name: text, function_type: text, description: optionalText,
    comment: optionalText, return_type: optionalText, parameters: texts,
    parameter_types: { type: 'array', items: optionalText }, varargs: optionalText, macro_definition: optionalText,
    has_side_effects: { type: ['boolean', 'null'] }, internal: { type: ['boolean', 'null'] },
    examples: texts, stability: optionalText, categories: texts, alias_of: optionalText,
  },
};
export const functionSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Haybarn Function Guide — function document, version 1',
  description: 'Catalog facts, editorial guidance and observed availability for one function in one captured build. Additive fields may be introduced within schema version 1. Null is unknown or unrecorded.',
  type: 'object',
  required: ['$schema', 'schemaVersion', 'name', 'schema', 'slug', 'description', 'category', 'kinds', 'aliasOf', 'snapshot', 'links', 'interpretation', 'overloads', 'editorial', 'examples', 'availability'],
  properties: {
    $schema: { const: '/products/haybarn/functions/api/v1/function.schema.json' }, schemaVersion: { const: 1 },
    name: text, schema: { const: 'main' }, slug: { type: 'string', pattern: '^[a-z0-9_-]+$' },
    description: optionalText, category: text, kinds: texts, aliasOf: texts,
    snapshot: { type: 'object', required: ['id', 'engine', 'label', 'engineVersion', 'sourceId', 'source', 'binarySha256', 'capturedAt', 'requestedExtensions', 'loadedExtensions', 'scope'],
      properties: { id: text, engine: { enum: ['haybarn', 'duckdb'] }, label: text, engineVersion: text,
        sourceId: text, source: text, binarySha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
        capturedAt: text, requestedExtensions: texts, scope: text,
        loadedExtensions: { type: 'array', items: { type: 'object', required: ['extension_name', 'extension_version', 'installed_from'], properties: { extension_name: text, extension_version: text, installed_from: text } } },
      },
    },
    links, interpretation: texts,
    overloads: { type: 'array', minItems: 1, items: { type: 'object', required: ['id', 'url', 'signature', 'parameterOrder', 'catalog'],
      properties: { id: { type: 'string', pattern: '^overload-[a-f0-9]{16}$' }, url: text, signature: text,
        parameterOrder: { enum: ['catalog-order', 'alphabetical-not-call-order'] }, catalog,
        callingConvention: {
          type: 'object', required: ['source', 'parameters', 'positional', 'named', 'variadic', 'evidence'],
          properties: {
            source: { enum: ['engine-binder', null] },
            parameters: { type: 'array', items: { $ref: '#/$defs/argument' } },
            positional: { type: ['array', 'null'], items: { $ref: '#/$defs/argument' } },
            named: { type: ['array', 'null'], items: { $ref: '#/$defs/argument' } },
            variadic: { anyOf: [{ type: 'null' }, { type: 'object', required: ['type', 'minimumCount', 'maximumCount', 'namedArgumentMode'], properties: {
              type: text, minimumCount: { type: 'null' }, maximumCount: { type: 'null' }, namedArgumentMode: { type: 'null' },
            } }] },
            evidence: { anyOf: [{ type: 'null' }, { type: 'object', required: ['query', 'diagnostic'], properties: { query: text, diagnostic: text } }] },
          },
        },
        syntax: { type: 'object', required: ['kind', 'operator'], properties: {
          kind: { enum: ['operator', 'function'] },
          operator: { anyOf: [{ type: 'null' }, { type: 'object', required: ['symbol', 'form', 'operands', 'expression'], properties: {
            symbol: text, form: { enum: ['infix', 'prefix', 'postfix'] }, operands: texts, expression: text,
          } }] },
        } },
      },
    } },
    editorial: { type: 'object', required: ['argumentNotes', 'recipes'], properties: {
      argumentNotes: { type: 'array', items: { type: 'object', required: ['name', 'note', 'overloadIds'], properties: { name: text, note: text, overloadIds: texts } } },
      recipes: { type: 'array', items: { type: 'object', required: ['id', 'title', 'description', 'sql', 'source', 'verification', 'intendedRuntime'], properties: {
        id: text, title: text, description: text, sql: text, source: { const: 'guide-recipe' }, verification: { type: 'null' },
        intendedRuntime: { type: 'object', required: ['engine', 'packageVersion'], properties: { engine: { const: 'haybarn-wasm' }, packageVersion: text } },
      } } },
    } },
    examples: { type: 'array', items: { type: 'object', required: ['original', 'sql', 'overloadIds', 'source', 'verification'], properties: {
      original: text, sql: text, overloadIds: texts, source: { const: 'engine-catalog' }, verification: { type: 'null' },
    } } },
    translations: { type: 'array', description: 'Scoped SQLGlot translation examples, separate from engine catalog facts.', items: {
      type: 'object', required: ['function', 'scope', 'source', 'target', 'formatTokens', 'provenance'], properties: {
        function: text, scope: text, relation: { enum: ['direct', 'rewrite'] },
        source: { type: 'object', required: ['engine', 'dialect', 'name', 'sql'], properties: { engine: text, dialect: text, name: text, names: texts, sql: text } },
        target: { type: 'object', required: ['dialect', 'name', 'sql'], properties: { dialect: text, name: text, sql: text } },
        formatTokens: { type: 'array', items: { type: 'object', required: ['source', 'target'], properties: { source: text, target: text } } },
        executionVerified: { type: 'boolean' },
        provenance: { type: 'object', required: ['name', 'commit', 'url'], properties: { name: text, commit: text, url: text } },
      },
    } },
    additionalDocumentation: { type: 'array', items: { type: 'object', required: ['title', 'url'], properties: { title: text, url: text } } },
    runnableExamples: { type: 'array', items: { type: 'object', required: ['function', 'original', 'sql', 'source', 'verification'], properties: {
      function: text, original: optionalText, sql: text, source: { enum: ['engine-catalog', 'catalog-with-sample-data', 'guide-example'] },
      verification: { type: 'object', required: ['engine', 'packageVersion', 'sourceId', 'binarySha256', 'rowCount'], properties: {
        engine: { const: 'haybarn-wasm' }, packageVersion: text, sourceId: text, binarySha256: text, rowCount: { type: 'integer', minimum: 0 },
      } },
    } } },
    availability: { type: 'array', items: { type: 'object', required: ['snapshot', 'observed', 'overloadCount', 'matchingOverloadIds', 'json'], properties: {
      snapshot: text, observed: { type: 'boolean' }, overloadCount: { type: 'integer', minimum: 0 }, matchingOverloadIds: texts, json: optionalText,
    } } },
  },
  $defs: { argument: { type: 'object', required: ['name', 'type', 'mode', 'position'], properties: {
    name: text, type: optionalText, mode: { enum: ['positional', 'named', null] }, position: { type: ['integer', 'null'], minimum: 0 },
  } } },
};
