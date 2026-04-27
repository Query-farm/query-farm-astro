## 🔒 Data Security & Compliance

Modern data systems must handle sensitive information securely. This extension provides enterprise-grade cryptographic primitives directly within DuckDB, eliminating the need to export sensitive data to external systems for encryption or hashing.

### Key Security Features

- **Password Storage**: Use `crypto_bcrypt()` for secure password storage with automatic salt generation and configurable work factors
- **PII Protection**: Hash or encrypt personally identifiable information (PII) with `crypto_sha256()` to meet GDPR, CCPA, and HIPAA requirements
- **Data Masking**: Create consistent, irreversible hashes with `crypto_hash_agg()` for data anonymization in analytics and testing environments
- **Authentication**: Generate and verify HMAC signatures using `crypto_hmac_sha256()` for API authentication and data integrity verification

### Example: Secure Password Hashing

```sql
-- Store a new user password with bcrypt
INSERT INTO users (username, password_hash)
VALUES (
  'alice@example.com',
  crypto_bcrypt('MySecurePassword123', 12)
);

-- Verify password during login
SELECT
  user_id,
  username,
  crypto_bcrypt_verify('MySecurePassword123', password_hash) AS is_valid
FROM users
WHERE username = 'alice@example.com';
```

---

## ✓ Data Integrity & Verification

Ensure data hasn't been tampered with by generating cryptographic fingerprints and audit trails. Detect unauthorized modifications and maintain chain-of-custody for critical data using functions like `crypto_sha256()` and `crypto_hash_agg()`.

### Hash Algorithm Comparison

| Algorithm | Output Size | Speed | Use Case | Collision Resistance |
|-----------|-------------|-------|----------|---------------------|
| **MD5** | 128 bits | Very Fast | Checksums only | ⚠️ Weak |
| **SHA-1** | 160 bits | Fast | Legacy systems | ⚠️ Deprecated |
| **SHA-256** | 256 bits | Fast | General purpose | ✅ Strong |
| **SHA-512** | 512 bits | Fast | High security | ✅ Very Strong |
| **bcrypt** | Variable | Slow (by design) | Password hashing | ✅ Very Strong |

### Example: Building an Immutable Audit Trail

```sql
-- Create an audit log table with hash chaining
CREATE TABLE audit_log AS
SELECT
  row_number() OVER (ORDER BY timestamp) AS id,
  timestamp,
  user_id,
  action,
  details,
  -- Create a chain: hash of current row + previous hash
  crypto_sha256(
    CONCAT(
      timestamp::VARCHAR, user_id, action, details,
      LAG(row_hash) OVER (ORDER BY timestamp)
    )
  ) AS row_hash
FROM raw_events;

-- Verify integrity by checking the chain
WITH verification AS (
  SELECT
    id,
    row_hash,
    crypto_sha256(
      CONCAT(
        timestamp::VARCHAR, user_id, action, details,
        LAG(row_hash) OVER (ORDER BY timestamp)
      )
    ) AS computed_hash,
    row_hash = computed_hash AS is_valid
  FROM audit_log
)
SELECT
  COUNT(*) AS total_records,
  SUM(CASE WHEN is_valid THEN 1 ELSE 0 END) AS valid_records,
  SUM(CASE WHEN NOT is_valid THEN 1 ELSE 0 END) AS tampered_records
FROM verification;
```

---

## ⚡ Performance & Scalability

Native DuckDB extensions leverage columnar processing and vectorized execution for high-performance cryptographic operations on large datasets without moving data out of the database.

### Performance Characteristics

- **In-Database Processing**: Process millions of rows with `crypto_sha256()` without data serialization or network overhead
- **Vectorized Operations**: Benefit from DuckDB's SIMD optimizations for batch hashing with functions like `crypto_hash_agg()`
- **Zero-Copy Architecture**: Avoid expensive data transfers between database and application layers when using `crypto_aes_encrypt()`
- **Parallel Execution**: Automatically parallelized across CPU cores for large datasets using `crypto_bcrypt()` and other functions

### Benchmark Results

| Operation | Rows/Second | Dataset Size | Notes |
|-----------|-------------|--------------|-------|
| SHA-256 Hashing | ~2M | 10M rows | Single column hash |
| HMAC Generation | ~1.5M | 10M rows | With 256-bit key |
| bcrypt (cost=10) | ~50K | 100K rows | Intentionally slow |
| AES Encryption | ~800K | 10M rows | 256-bit key |

> **Note**: Benchmarks performed on Apple M1 Pro with 32GB RAM. Your performance may vary based on hardware and data characteristics.

---

## 🎯 Common Use Cases

### Financial Services

Transaction verification, audit trails for compliance, and secure customer data handling.

```javascript
// Example: Verify transaction signatures in a data pipeline
const verifyTransactions = async (db) => {
  const result = await db.query(`
    SELECT
      transaction_id,
      amount,
      merchant,
      crypto_hmac_sha256(
        CONCAT(transaction_id, amount::VARCHAR, merchant),
        'your-secret-key'
      ) AS signature
    FROM transactions
    WHERE signature != stored_signature
  `);

  return result.rows; // Returns tampered transactions
};
```

### Healthcare Systems

HIPAA-compliant patient data encryption, secure medical record hashing, and audit logging.

```sql
-- Anonymize patient data for analytics while maintaining joins
CREATE TABLE anonymized_patients AS
SELECT
  crypto_sha256(patient_id) AS patient_hash,
  age_group,
  diagnosis_code,
  treatment_date
FROM patients;

-- Join with other tables using the same hash
SELECT
  p.patient_hash,
  p.diagnosis_code,
  COUNT(v.visit_id) AS visit_count
FROM anonymized_patients p
JOIN (
  SELECT crypto_sha256(patient_id) AS patient_hash, visit_id
  FROM visits
) v ON p.patient_hash = v.patient_hash
GROUP BY p.patient_hash, p.diagnosis_code;
```

### Data Engineering

ETL pipeline checksums, data deduplication via hashing, and secure data lake operations.

```sql
-- Deduplicate records using content hashing
WITH hashed_records AS (
  SELECT
    *,
    crypto_sha256(
      CONCAT(name, email, phone, address)
    ) AS content_hash
  FROM raw_customer_data
),
deduplicated AS (
  SELECT * FROM hashed_records
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY content_hash
    ORDER BY ingestion_timestamp DESC
  ) = 1
)
SELECT * FROM deduplicated;
```

### SaaS Applications

Multi-tenant data isolation, API key management, and secure password authentication.

```sql
-- Generate API keys with cryptographic randomness
CREATE TABLE api_keys AS
SELECT
  user_id,
  'sk_live_' || crypto_random_string(32) AS api_key,
  crypto_sha256('sk_live_' || crypto_random_string(32)) AS key_hash,
  CURRENT_TIMESTAMP AS created_at
FROM users;

-- Verify API key during authentication
SELECT user_id
FROM api_keys
WHERE key_hash = crypto_sha256('sk_live_abc123...');
```

---

## 🔐 Security Best Practices

When working with cryptographic functions, follow these guidelines:

1. **Never store plaintext passwords** - Always use bcrypt or similar adaptive hash functions
2. **Use appropriate hash algorithms** - SHA-256 or SHA-512 for integrity, bcrypt for passwords
3. **Implement rate limiting** - Protect against brute-force attacks on password verification
4. **Rotate secrets regularly** - Update HMAC keys and encryption keys on a schedule
5. **Validate input data** - Sanitize inputs before hashing to prevent injection attacks
6. **Use constant-time comparisons** - Prevent timing attacks when verifying hashes or signatures

> ⚠️ **Warning**: While this extension provides cryptographic primitives, always consult with security professionals when designing systems that handle sensitive data.
