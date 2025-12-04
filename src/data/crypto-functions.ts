// Type definitions for function documentation
export interface FunctionParameter {
  name: string;
  type: string;
  paramType: 'positional' | 'named';
  default?: string;
  description: string;
}

export interface ReturnColumn {
  name: string;
  type: string;
  description: string;
}

export interface RelatedFunction {
  name: string;
  id: string;
  description: string;
}

export interface FunctionDocData {
  id: string;
  name: string;
  type: 'scalar' | 'table' | 'aggregate';
  category: string; // e.g., "Hashing", "Password", "Key Generation"
  signature: string; // DEPRECATED: Use returnType instead
  returnType?: string; // e.g., "VARCHAR", "BOOLEAN", "INTEGER"
  parameters: FunctionParameter[];
  returns?: string; // Human-readable description of return value
  returnsTable?: ReturnColumn[];
  description: string;
  examples: string;
  parametersTitle?: string;
  relatedFunctions?: RelatedFunction[];
}

// Example function data
export const cryptoFunctions: FunctionDocData[] = [
  {
    id: 'crypto_sha256',
    name: 'crypto_sha256',
    type: 'scalar',
    category: 'Hashing',
    signature: `<span class="text-harvest-700">crypto_sha256</span>(<span class="text-duck-700">input</span>: <span class="text-blue-600">VARCHAR</span>) → <span class="text-blue-600">VARCHAR</span>`, // DEPRECATED
    returnType: 'VARCHAR',
    parameters: [
      {
        name: 'input',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'The text to hash'
      }
    ],
    returns: '64-character hexadecimal string representing the SHA-256 hash',
    description: 'Computes the SHA-256 cryptographic hash of the input string. SHA-256 is part of the SHA-2 family and produces a 256-bit (32-byte) hash value. Commonly used for data integrity verification and anonymization.',
    examples: `-- Basic usage
SELECT crypto_sha256('Hello, World!') AS hash;
-- Result: a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e

-- Anonymize email addresses for analytics
SELECT
  crypto_sha256(email) AS user_id,
  COUNT(*) AS purchases
FROM orders
GROUP BY crypto_sha256(email)
ORDER BY purchases DESC
LIMIT 10;`,
    relatedFunctions: [
      { name: 'crypto_sha512', id: 'crypto_sha512', description: 'More secure 512-bit hash alternative' },
      { name: 'crypto_hash_agg', id: 'crypto_hash_agg', description: 'Aggregate multiple values into single hash' },
      { name: 'crypto_hmac_sha256', id: 'crypto_hmac_sha256', description: 'Create authenticated hash with secret key' }
    ]
  },
  {
    id: 'crypto_sha512',
    name: 'crypto_sha512',
    type: 'scalar',
    category: 'Hashing',
    signature: `<span class="text-harvest-700">crypto_sha512</span>(<span class="text-duck-700">input</span>: <span class="text-blue-600">VARCHAR</span>) → <span class="text-blue-600">VARCHAR</span>`, // DEPRECATED
    returnType: 'VARCHAR',
    parameters: [
      {
        name: 'input',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'The text to hash'
      }
    ],
    returns: '128-character hexadecimal string representing the SHA-512 hash',
    description: 'Computes the SHA-512 cryptographic hash of the input. More secure than SHA-256 with a 512-bit output. Recommended for high-security applications.',
    examples: `SELECT crypto_sha512('sensitive data') AS hash;
-- Result: 128-character hex string`,
    relatedFunctions: [
      { name: 'crypto_sha256', id: 'crypto_sha256', description: 'Faster 256-bit hash alternative' },
      { name: 'crypto_hash_agg', id: 'crypto_hash_agg', description: 'Aggregate hash with SHA-512 option' }
    ]
  },
  {
    id: 'crypto_hmac_sha256',
    name: 'crypto_hmac_sha256',
    type: 'scalar',
    category: 'HMAC',
    signature: `<span class="text-harvest-700">crypto_hmac_sha256</span>(<span class="text-duck-700">message</span>: <span class="text-blue-600">VARCHAR</span>, <span class="text-duck-700">key</span>: <span class="text-blue-600">VARCHAR</span>) → <span class="text-blue-600">VARCHAR</span>`, // DEPRECATED
    returnType: 'VARCHAR',
    parameters: [
      {
        name: 'message',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'The message to sign'
      },
      {
        name: 'key',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'Secret key for HMAC'
      }
    ],
    parametersTitle: 'Parameters (Positional)',
    returns: '64-character hexadecimal HMAC signature',
    description: 'Creates an HMAC (Hash-based Message Authentication Code) signature using SHA-256. Used for API authentication, webhook verification, and message integrity.',
    examples: `-- Sign API requests
SELECT
  request_id,
  payload,
  crypto_hmac_sha256(payload, 'my_secret_key') AS signature
FROM api_requests;`
  },
  {
    id: 'crypto_bcrypt',
    name: 'crypto_bcrypt',
    type: 'scalar',
    category: 'Password',
    signature: `<span class="text-harvest-700">crypto_bcrypt</span>(<span class="text-duck-700">password</span>: <span class="text-blue-600">VARCHAR</span>, <span class="text-purple-600">cost</span> := <span class="text-blue-600">INTEGER</span> = 10) → <span class="text-blue-600">VARCHAR</span>`, // DEPRECATED
    returnType: 'VARCHAR',
    parameters: [
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
        description: 'Work factor (4-31, higher is slower/more secure)'
      }
    ],
    returns: 'Bcrypt hash string containing salt and hash (60 characters)',
    description: 'Hashes a password using the bcrypt algorithm with automatic salt generation. Recommended for password storage. The cost parameter controls computational cost (2^cost iterations).',
    examples: `-- Hash with default cost (10)
INSERT INTO users (username, password_hash)
VALUES ('alice', crypto_bcrypt('secret_password'));

-- Hash with custom cost for higher security (using named parameter)
INSERT INTO admin_users (username, password_hash)
VALUES ('admin', crypto_bcrypt('admin_password', cost := 12));

-- Another example with explicit named parameter
SELECT crypto_bcrypt('my_password', cost := 14) AS secure_hash;`,
    relatedFunctions: [
      { name: 'crypto_bcrypt_verify', id: 'crypto_bcrypt_verify', description: 'Verify password against bcrypt hash' },
      { name: 'crypto_hash_agg', id: 'crypto_hash_agg', description: 'Not for passwords - use for data aggregation' }
    ]
  },
  {
    id: 'crypto_bcrypt_verify',
    name: 'crypto_bcrypt_verify',
    type: 'scalar',
    category: 'Password',
    signature: `<span class="text-harvest-700">crypto_bcrypt_verify</span>(<span class="text-duck-700">password</span>: <span class="text-blue-600">VARCHAR</span>, <span class="text-duck-700">hash</span>: <span class="text-blue-600">VARCHAR</span>) → <span class="text-blue-600">BOOLEAN</span>`, // DEPRECATED
    returnType: 'BOOLEAN',
    parameters: [
      {
        name: 'password',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'Plaintext password to verify'
      },
      {
        name: 'hash',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'Bcrypt hash to verify against'
      }
    ],
    parametersTitle: 'Parameters (Positional)',
    returns: 'TRUE if password matches hash, FALSE otherwise',
    description: 'Verifies a plaintext password against a bcrypt hash. Timing-safe comparison to prevent timing attacks.',
    examples: `-- Verify user login
SELECT
  user_id,
  username,
  crypto_bcrypt_verify('user_input', password_hash) AS is_valid
FROM users
WHERE username = 'alice';`
  },
  {
    id: 'crypto_generate_keys',
    name: 'crypto_generate_keys',
    type: 'table',
    category: 'Key Generation',
    signature: `<span class="text-harvest-700">crypto_generate_keys</span>(<span class="text-duck-700">count</span>: <span class="text-blue-600">INTEGER</span>, <span class="text-purple-600">key_size</span> := <span class="text-blue-600">INTEGER</span> = 2048) → TABLE(key_id INTEGER, public_key VARCHAR, private_key VARCHAR, created_at TIMESTAMP)`,
    parameters: [
      {
        name: 'count',
        type: 'INTEGER',
        paramType: 'positional',
        description: 'Number of key pairs to generate'
      },
      {
        name: 'key_size',
        type: 'INTEGER',
        paramType: 'named',
        default: '2048',
        description: 'RSA key size in bits (1024, 2048, or 4096)'
      }
    ],
    returnsTable: [
      { name: 'key_id', type: 'INTEGER', description: 'Unique identifier for the key pair' },
      { name: 'public_key', type: 'VARCHAR', description: 'PEM-encoded public key' },
      { name: 'private_key', type: 'VARCHAR', description: 'PEM-encoded private key' },
      { name: 'created_at', type: 'TIMESTAMP', description: 'Generation timestamp' }
    ],
    description: 'Generates RSA public/private key pairs in bulk. Useful for provisioning multiple users or services with cryptographic keys. Returns a table where each row contains one complete key pair.',
    examples: `-- Generate 10 RSA key pairs with default 2048-bit keys
SELECT * FROM crypto_generate_keys(10);

-- Generate 5 high-security 4096-bit key pairs
SELECT * FROM crypto_generate_keys(5, key_size := 4096);

-- Store generated keys in a table
CREATE TABLE user_keys AS
SELECT
  key_id,
  public_key,
  private_key,
  created_at
FROM crypto_generate_keys(100);

-- Generate keys and immediately assign to users
INSERT INTO user_keypairs (user_id, public_key, private_key)
SELECT
  u.user_id,
  k.public_key,
  k.private_key
FROM users u
CROSS JOIN LATERAL crypto_generate_keys(1) k
WHERE u.needs_keypair = true;`
  },
  {
    id: 'crypto_audit_trail',
    name: 'crypto_audit_trail',
    type: 'table',
    category: 'Auditing',
    signature: `<span class="text-harvest-700">crypto_audit_trail</span>(<span class="text-duck-700">table_name</span>: <span class="text-blue-600">VARCHAR</span>, <span class="text-duck-700">operation</span>: <span class="text-blue-600">VARCHAR</span>) → TABLE(record_hash VARCHAR, previous_hash VARCHAR, sequence_num INTEGER, chain_valid BOOLEAN)`,
    parameters: [
      {
        name: 'table_name',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'Name of the table to audit'
      },
      {
        name: 'operation',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'Operation to audit (INSERT, UPDATE, DELETE)'
      }
    ],
    parametersTitle: 'Parameters (Positional)',
    returnsTable: [
      { name: 'record_hash', type: 'VARCHAR', description: 'SHA-256 hash of the current record' },
      { name: 'previous_hash', type: 'VARCHAR', description: 'Hash of previous record (chain linkage)' },
      { name: 'sequence_num', type: 'INTEGER', description: 'Sequence number in audit chain' },
      { name: 'chain_valid', type: 'BOOLEAN', description: 'Whether the audit chain is valid' }
    ],
    description: 'Creates a cryptographic audit trail for database operations using blockchain-style hash chaining. Each record contains a hash of its data plus the previous record\'s hash, making tampering detectable.',
    examples: `-- Generate audit trail for financial transactions
SELECT * FROM crypto_audit_trail('financial_transactions', 'INSERT');

-- Verify audit chain integrity
WITH audit AS (
  SELECT * FROM crypto_audit_trail('sensitive_data', 'UPDATE')
)
SELECT
  sequence_num,
  record_hash,
  chain_valid,
  CASE
    WHEN NOT chain_valid THEN 'TAMPERING DETECTED!'
    ELSE 'Valid'
  END AS status
FROM audit
WHERE NOT chain_valid;`
  },
  {
    id: 'crypto_hash_agg',
    name: 'crypto_hash_agg',
    type: 'aggregate',
    category: 'Aggregation',
    signature: `<span class="text-harvest-700">crypto_hash_agg</span>(<span class="text-duck-700">value</span>: <span class="text-blue-600">VARCHAR</span>, <span class="text-purple-600">algorithm</span> := <span class="text-blue-600">VARCHAR</span> = 'sha256') → <span class="text-blue-600">VARCHAR</span>`, // DEPRECATED
    returnType: 'VARCHAR',
    parameters: [
      {
        name: 'value',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'The value to hash (from each row)'
      },
      {
        name: 'algorithm',
        type: 'VARCHAR',
        paramType: 'named',
        default: 'sha256',
        description: "Hash algorithm to use ('sha256' or 'sha512')"
      }
    ],
    returns: 'Aggregated hash combining all input values',
    description: 'Aggregates multiple values into a single cryptographic hash. Order-independent - produces the same hash regardless of row order. Useful for creating fingerprints of entire datasets or groups.',
    examples: `-- Generate fingerprint for all users
SELECT crypto_hash_agg(email) AS users_fingerprint
FROM users;

-- Hash all transaction IDs for a daily batch
SELECT
  DATE(created_at) AS batch_date,
  crypto_hash_agg(transaction_id) AS batch_hash
FROM transactions
GROUP BY DATE(created_at);

-- Use SHA-512 for higher security
SELECT crypto_hash_agg(sensitive_field, algorithm := 'sha512') AS secure_hash
FROM sensitive_table;

-- Detect data changes by comparing hashes
WITH current_hash AS (
  SELECT crypto_hash_agg(data_column) AS hash FROM production_table
),
backup_hash AS (
  SELECT crypto_hash_agg(data_column) AS hash FROM backup_table
)
SELECT
  CASE
    WHEN c.hash = b.hash THEN 'Data matches'
    ELSE 'Data has changed!'
  END AS status
FROM current_hash c, backup_hash b;`
  },
  {
    id: 'crypto_merkle_root',
    name: 'crypto_merkle_root',
    type: 'aggregate',
    category: 'Aggregation',
    signature: `<span class="text-harvest-700">crypto_merkle_root</span>(<span class="text-duck-700">value</span>: <span class="text-blue-600">VARCHAR</span>) → <span class="text-blue-600">VARCHAR</span>`, // DEPRECATED
    returnType: 'VARCHAR',
    parameters: [
      {
        name: 'value',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'The value to include in the Merkle tree (from each row)'
      }
    ],
    returns: 'Merkle root hash (64-character hex string)',
    description: 'Computes a Merkle tree root hash for a set of values. Like blockchain transaction verification - any change to input data produces a different root. More efficient than concatenating all values for large datasets.',
    examples: `-- Calculate Merkle root for a block of transactions
SELECT
  block_id,
  crypto_merkle_root(transaction_hash) AS merkle_root
FROM blockchain_transactions
GROUP BY block_id;

-- Verify data integrity using Merkle root
WITH daily_blocks AS (
  SELECT
    DATE(timestamp) AS date,
    crypto_merkle_root(record_id::VARCHAR) AS merkle_root
  FROM audit_log
  GROUP BY DATE(timestamp)
)
SELECT
  date,
  merkle_root,
  LAG(merkle_root) OVER (ORDER BY date) AS previous_root
FROM daily_blocks;

-- Create tamper-evident file manifest
SELECT crypto_merkle_root(file_hash) AS manifest_hash
FROM uploaded_files
WHERE upload_batch_id = 'batch_123';`
  }
];
