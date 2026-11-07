import type { categories } from '../lib/catalog';
type Category = typeof categories[number]['id'];
interface CategoryGuide { title: string; summary: string; approach: string; caution: string; example: string; choices: [string, string][]; }

export const categoryGuides: Record<Category, CategoryGuide> = {
  text: {
    title: 'SQL text and regular expression functions',
    summary: 'Clean labels, split strings, and replace patterns with Haybarn SQL. Choose literal string functions for simple edits and regular expressions for patterns.',
    approach: 'Build a cleaning expression in stages: trim surrounding spaces, normalize case, then replace the parts that vary. Keep the original column alongside the cleaned value while checking your rules.',
    caution: 'Regular expressions interpret punctuation as syntax. For a fixed search string, a literal replacement is easier to reason about. NULL text also needs an explicit policy before combining fields.',
    example: 'regexp_replace', choices: [['trim', 'Remove whitespace at the edges.'], ['lower', 'Normalize letter case for matching.'], ['replace', 'Replace literal text.'], ['regexp_replace', 'Replace a pattern, once or globally.'], ['string_split', 'Split delimited text into a list.']],
  },
  numeric: {
    title: 'SQL numeric and rounding functions',
    summary: 'Calculate and round numeric values in Haybarn SQL, with examples that distinguish exact decimals from floating point numbers.',
    approach: 'Choose the numeric type before the formula. Use a suitable DECIMAL precision and scale for exact decimal quantities, and floating point types when approximate arithmetic is appropriate.',
    caution: 'Rounding each input can produce a different total from rounding the final sum. Decide which rule your calculation needs and keep it consistent.',
    example: 'round', choices: [['round', 'Round to a chosen decimal precision.'], ['floor', 'Move down to an integer boundary.'], ['ceil', 'Move up to an integer boundary.'], ['abs', 'Measure magnitude without the sign.']],
  },
  dates: {
    title: 'SQL date parsing, formatting, and time buckets',
    summary: 'Parse date strings, format timestamps, and group events into calendar periods with Haybarn SQL date and time functions.',
    approach: 'Treat parsing, grouping, and formatting as separate steps. Parse source text into a date or timestamp, group on a typed calendar bucket, then format the final label for display.',
    caution: 'A timestamp with a time zone represents an instant; calendar grouping depends on the selected timezone. The examples here use dates or timestamps without time zones to keep the result explicit.',
    example: 'date_trunc', choices: [['try_strptime', 'Parse text while retaining invalid rows as NULL.'], ['strptime', 'Parse text and raise an error on invalid input.'], ['date_trunc', 'Find the start of a calendar unit.'], ['strftime', 'Format a typed value for display.']],
  },
  lists: {
    title: 'SQL list and array functions',
    summary: 'Transform, filter, and index lists in Haybarn SQL. Learn when to keep a collection in one value and when to expand it into rows.',
    approach: 'Use a lambda when the same expression applies to every item. Filtering changes which items remain; transformation changes their values. Use unnest() when later steps need joins or row-based aggregation.',
    caution: 'SQL list positions start at 1. JSON array paths start at 0. An empty list, a NULL list, and a list containing a NULL item are three different inputs.',
    example: 'list_transform', choices: [['list_transform', 'Apply an expression to every item.'], ['list_filter', 'Keep items that satisfy a predicate.'], ['list_extract', 'Read one item by position.'], ['range', 'Build a sequence with an exclusive stop.'], ['generate_series', 'Build a sequence with an inclusive stop.'], ['unnest', 'Expand items into rows.']],
  },
  json: {
    title: 'SQL JSON extraction and path functions',
    summary: 'Query JSON fields in Haybarn SQL, extract plain text, and distinguish missing paths from JSON null values.',
    approach: 'Choose the result type first. Use json_extract() to keep a JSON value, json_extract_string() for text, and a subsequent cast for a typed number or date. Use json_exists() when only the presence of a field matters.',
    caution: 'A missing path and a field containing JSON null are different cases. JSON arrays use zero-based positions. Invalid JSON can raise an error before extraction, so validate untrusted text with json_valid().',
    example: 'json_extract_string', choices: [['json_extract', 'Keep the extracted value as JSON.'], ['json_extract_string', 'Read an unquoted text value.'], ['json_exists', 'Check whether a path is present.'], ['json_type', 'Inspect the JSON value type.'], ['json_valid', 'Check whether text is valid JSON.']],
  },
  aggregate: {
    title: 'SQL aggregate functions and NULL handling',
    summary: 'Count rows, total values, and summarize groups with Haybarn SQL. Understand how NULL values and empty inputs affect aggregate results.',
    approach: 'Start by defining what one output row represents, then choose the GROUP BY keys. Use FILTER on individual aggregates when different metrics need different subsets of the same input.',
    caution: 'Joins can multiply rows before aggregation and inflate totals. Check the input row count first. count(*) counts rows, while count(column) excludes NULL values in that column.',
    example: 'count', choices: [['count', 'Count rows or non-null values.'], ['sum', 'Total numeric values.'], ['avg', 'Calculate the mean of non-null values.'], ['median', 'Find the middle value of a distribution.']],
  },
  nested: {
    title: 'SQL map and struct functions',
    summary: 'Build typed nested values in Haybarn SQL and retrieve their fields or keys. Choose structs for named fields and maps for key-value lookup.',
    approach: 'A struct gives each field a name and its own type. A map uses one key type and one value type for its entries. Choose the representation that reflects how the data will be queried.',
    caution: 'A missing map key and a key with a NULL value can return the same lookup result. Check key membership separately when that distinction affects your logic.',
    example: 'map_extract_value', choices: [['struct_pack', 'Build a struct from named expressions.'], ['struct_extract', 'Read a named struct field.'], ['map_extract_value', 'Look up a value by key.'], ['map_contains', 'Test whether a map contains a key.']],
  },
  files: {
    title: 'SQL file readers and table functions',
    summary: 'Query CSV and Parquet files or expand lists into rows with Haybarn SQL. Work through small examples that run in the browser.',
    approach: 'Table functions belong in FROM and produce rows for the rest of the query. Start with a small sample, inspect the column types, and select the columns your analysis actually needs.',
    caution: 'Browser examples use the engine’s virtual filesystem. A path on your computer is not automatically available to the browser engine. Remote files also need a server that permits browser access.',
    example: 'read_csv', choices: [['read_csv', 'Read CSV with inferred or explicit column types.'], ['read_parquet', 'Read typed Parquet columns.'], ['unnest', 'Turn list items into rows.']],
  },
  system: {
    title: 'SQL database inspection and utility functions',
    summary: 'Inspect tables and column types, identify the current database, and compare values with Haybarn SQL utility functions.',
    approach: 'Use metadata queries when you need to understand a database before querying its data. Restrict results by database and schema to avoid confusing objects with the same name.',
    caution: 'Catalog metadata describes the connected engine and loaded extensions. Function availability can differ between the browser runtime and a native installation; select the matching reference snapshot.',
    example: 'duckdb_columns', choices: [['duckdb_tables', 'Find tables in the connected databases.'], ['duckdb_columns', 'Inspect column names and declared types.'], ['current_database', 'Identify the selected database.'], ['greatest', 'Choose the largest value within a row.'], ['least', 'Choose the smallest value within a row.']],
  },
  operators: {
    title: 'SQL operators and integer division',
    summary: 'Read the captured SQL operator overloads in Haybarn, compare operand types, and see how integer division differs from floating point division.',
    approach: 'Operator symbols can have different behavior for different operand types. Check the matching overload and use explicit casts when the intended types are unclear.',
    caution: 'These pages list operators present in the captured function catalog. SQL grammar constructs such as AND, OR, and IS NULL are not all represented as catalog functions.',
    example: '//', choices: [['//', 'Divide integer operands and discard the fraction.'], ['/', 'Divide integer inputs with a floating point result.'], ['%', 'Compute a remainder.'], ['||', 'Concatenate compatible values.']],
  },
};
