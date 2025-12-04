---
title: 'DuckDB Extension Best Practices: A Developer Guide'
description: 'Learn how to build, optimize, and deploy DuckDB extensions with this comprehensive guide covering architecture, performance, and testing.'
pubDate: 2024-02-01
author: 'Query.Farm Team'
tags: ['duckdb', 'extensions', 'tutorial', 'best-practices']
---

# DuckDB Extension Best Practices

Building high-quality DuckDB extensions requires understanding both the DuckDB architecture and extension API. This guide shares best practices we've learned while developing over 20 extensions at Query.Farm.

## Extension Architecture

### 1. Keep Extensions Focused

Each extension should solve one problem well. Don't create monolithic extensions that try to do everything.

**Good:** `json-transform` extension focused on JSON operations
**Bad:** `data-utils` extension that does JSON, CSV, and XML processing

### 2. Minimize Dependencies

External dependencies increase complexity and potential conflicts. Use DuckDB's built-in capabilities whenever possible.

```cpp
// Prefer DuckDB's string utilities
auto result = StringUtil::Format("Value: %s", value);

// Avoid external libraries for common operations
// #include <boost/algorithm/string.hpp> // Not ideal
```

### 3. Leverage DuckDB's Type System

DuckDB's rich type system handles complex data structures efficiently. Use `LogicalType` appropriately:

```cpp
// Register function with proper types
CreateScalarFunctionInfo::Create(
    "my_function",
    {LogicalType::VARCHAR, LogicalType::INTEGER},
    LogicalType::BOOLEAN,
    my_function_impl
);
```

## Performance Optimization

### 1. Use Vectorized Execution

DuckDB processes data in vectors (chunks of ~2000 rows). Write functions that operate on entire vectors:

```cpp
// Good: Vectorized processing
void VectorFunction(DataChunk &args, ExpressionState &state, Vector &result) {
    auto &input = args.data[0];
    auto input_data = FlatVector::GetData<string_t>(input);
    auto result_data = FlatVector::GetData<int64_t>(result);

    for (idx_t i = 0; i < args.size(); i++) {
        result_data[i] = ProcessString(input_data[i]);
    }
}

// Bad: Row-by-row processing
```

### 2. Avoid Memory Allocations

Minimize allocations in hot paths. Reuse buffers when possible:

```cpp
// Reuse vector instead of creating new ones
Vector intermediate(LogicalType::VARCHAR, args.size());
// Process data...
```

### 3. Profile Your Code

Use DuckDB's profiling tools to identify bottlenecks:

```sql
PRAGMA enable_profiling='json';
PRAGMA profiling_output='/tmp/profile.json';

-- Your query here
SELECT my_extension_function(column) FROM table;
```

## Testing Strategies

### 1. Unit Tests

Test individual functions thoroughly:

```cpp
TEST_CASE("Test JSON extraction") {
    DuckDB db(nullptr);
    Connection con(db);

    auto result = con.Query("SELECT json_extract('{\"key\": 42}', 'key')");
    REQUIRE(result->success);
    REQUIRE(result->GetValue(0, 0).GetValue<int64_t>() == 42);
}
```

### 2. Edge Cases

Always test edge cases:
- NULL values
- Empty strings/arrays
- Large datasets (>100k rows)
- Special characters in strings
- Type mismatches

### 3. Performance Regression Tests

Track performance over time:

```python
def test_performance():
    # Baseline: Process 1M rows
    start = time.time()
    con.execute("SELECT transform_data(x) FROM range(1000000) t(x)")
    duration = time.time() - start

    # Should complete in under 1 second
    assert duration < 1.0
```

## Error Handling

### Provide Clear Error Messages

Users should understand what went wrong and how to fix it:

```cpp
// Good
throw InvalidInputException(
    "JSON path '%s' not found in object. Available keys: %s",
    path, available_keys
);

// Bad
throw Exception("Invalid input");
```

### Validate Input Early

Catch errors before expensive operations:

```cpp
if (args.data[0].GetType() != LogicalType::VARCHAR) {
    throw InvalidTypeException(
        "Expected VARCHAR, got %s",
        args.data[0].GetType().ToString()
    );
}
```

## Documentation

### 1. Function Descriptions

Document each function clearly:

```sql
-- Extract value from JSON path
-- Parameters:
--   json: JSON string to parse
--   path: JSONPath expression (e.g., '$.user.name')
-- Returns: Extracted value as VARCHAR or NULL if path not found
-- Example: SELECT json_extract('{"user": {"name": "Alice"}}', '$.user.name')
--          Returns: 'Alice'
```

### 2. Performance Characteristics

Explain performance implications:

```
Time Complexity: O(n) where n is JSON string length
Memory: O(m) where m is extracted value size
Best for: Small to medium JSON documents (<10MB)
```

### 3. Compatibility Notes

Document version requirements and limitations:

```
Requires: DuckDB >= 0.9.0
Thread-safe: Yes
NULL handling: Returns NULL on NULL input
```

## Distribution

### 1. Build for Multiple Platforms

Support major platforms:
- Linux (x86_64, ARM64)
- macOS (Intel, Apple Silicon)
- Windows (x86_64)

### 2. Version Your Extensions

Use semantic versioning:
- MAJOR: Breaking changes
- MINOR: New features
- PATCH: Bug fixes

### 3. Provide Installation Instructions

Make it easy to install:

```sql
-- Install from Query.Farm repository
INSTALL my_extension FROM 'query.farm';
LOAD my_extension;

-- Or from GitHub
INSTALL my_extension FROM 'github://queryfarm/my-extension';
```

## Security Considerations

### 1. Input Validation

Never trust user input:

```cpp
// Validate string lengths
if (input.GetStringLength() > MAX_SAFE_LENGTH) {
    throw InvalidInputException("Input too large");
}

// Sanitize paths
if (path.contains("..")) {
    throw InvalidInputException("Path traversal not allowed");
}
```

### 2. Resource Limits

Prevent resource exhaustion:

```cpp
const size_t MAX_ITERATIONS = 1000000;
size_t count = 0;

while (hasMore && count++ < MAX_ITERATIONS) {
    // Process...
}

if (count >= MAX_ITERATIONS) {
    throw Exception("Iteration limit exceeded");
}
```

## Conclusion

Building great DuckDB extensions requires attention to:
- Clean architecture and focused functionality
- Vectorized, high-performance implementations
- Comprehensive testing and error handling
- Clear documentation and easy installation

Want to learn more? Check out our [extension catalog](/products/extensions) or [schedule a consultation](/company/schedule) to discuss your custom extension needs.

Happy building! 🚜
