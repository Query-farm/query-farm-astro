import type {
  ExtensionData,
  ExtensionMetadata,
  FunctionDocData,
  Pragma,
  Secret,
  Macro,
  Filesystem,
  StorageExtension,
  LogType,
  LogStorageType,
  TechnicalOverview,
  PricingInfo,
  PlatformInfo
} from '../extension-types';

const metadata: ExtensionMetadata = {
  name: 'crypto',
  displayName: 'Crypto',
  icon: '🔐',
  description: 'Cryptographic functions for secure data handling including hashing, encryption, and digital signatures.',
  githubUrl: 'https://github.com/queryfarm/duckdb-crypto',
  cta: {
    title: 'Ready to Secure Your Data?',
    description: 'Install the Crypto extension today and start using enterprise-grade cryptography in DuckDB.'
  },
  license: 'MIT',
  pricing: 'paid',
  firstRelease: '2024-03-15',
  lastRelease: '2025-01-15',
  binarySize: '2.4 MB',
  writtenIn: 'C++',
  sourceAvailable: 'https://github.com/Query-farm/duckdb-crypto',
  dependencies: [],
  usageStats: {
    count: 12500,
    period: 'last 30 days'
  },
  githubStars: 245,
  platforms: [
    { platform: 'Linux', architectures: ['x86_64', 'aarch64'] },
    { platform: 'macOS', architectures: ['Apple Silicon', 'Intel'] },
    { platform: 'Windows', architectures: ['x86_64'] },
    { platform: 'WASM', architectures: [] }
  ] as PlatformInfo[],
  duckdbVersions: ['1.1.0', '1.1.1', '1.1.2', '1.1.3'],
  unsupportedVersions: ['1.0.0', '0.10.3', '0.10.2', '0.10.1'],
  relatedExtensions: ['hashfunctions', 'data-validator', 'bitfilters'],
  image: '/images/extensions/crypto.svg'
};

const functions: FunctionDocData[] = [
  {
    id: 'crypto_sha256',
    name: 'crypto_sha256',
    type: 'scalar',
    category: 'Hashing',
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
    examples: [
      {
        description: 'Basic usage',
        code: "SELECT crypto_sha256('Hello, World!') AS hash;",
        output: 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e'
      },
      {
        description: 'Anonymize email addresses for analytics',
        code: `SELECT
  crypto_sha256(email) AS user_id,
  COUNT(*) AS purchases
FROM orders
GROUP BY crypto_sha256(email)
ORDER BY purchases DESC
LIMIT 10;`
      }
    ],
    relatedFunctions: ['crypto_sha512', 'crypto_hash_agg', 'crypto_hmac_sha256'],
    tags: ['hashing', 'sha-256', 'cryptographic', 'integrity', 'anonymization', 'deterministic']
  },
  {
    id: 'crypto_sha512',
    name: 'crypto_sha512',
    type: 'scalar',
    category: 'Hashing',
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
    examples: [
      {
        description: 'Hash sensitive data with SHA-512',
        code: "SELECT crypto_sha512('sensitive data') AS hash;",
        output: '128-character hex string'
      }
    ],
    relatedFunctions: ['crypto_sha256', 'crypto_hash_agg'],
    tags: ['hashing', 'sha-512', 'cryptographic', 'integrity', 'high-security', 'deterministic']
  },
  {
    id: 'crypto_hmac_sha256',
    name: 'crypto_hmac_sha256',
    type: 'scalar',
    category: 'HMAC',
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
    examples: [
      {
        description: 'Sign API requests with HMAC',
        code: `SELECT
  request_id,
  payload,
  crypto_hmac_sha256(payload, 'my_secret_key') AS signature
FROM api_requests;`
      }
    ],
    tags: ['hmac', 'signing', 'authentication', 'api-security', 'webhook', 'message-integrity']
  },
  {
    id: 'crypto_bcrypt',
    name: 'crypto_bcrypt',
    type: 'scalar',
    category: 'Password',
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
    examples: [
      {
        description: 'Hash password with default cost (10)',
        code: `INSERT INTO users (username, password_hash)
VALUES ('alice', crypto_bcrypt('secret_password'));`
      },
      {
        description: 'Hash with custom cost for higher security',
        code: `INSERT INTO admin_users (username, password_hash)
VALUES ('admin', crypto_bcrypt('admin_password', cost := 12));`
      },
      {
        description: 'Explicit named parameter syntax',
        code: "SELECT crypto_bcrypt('my_password', cost := 14) AS secure_hash;"
      }
    ],
    relatedFunctions: ['crypto_bcrypt_verify'],
    tags: ['password', 'bcrypt', 'hashing', 'authentication', 'slow-hash', 'salted', 'secure-storage']
  },
  {
    id: 'crypto_bcrypt_verify',
    name: 'crypto_bcrypt_verify',
    type: 'scalar',
    category: 'Password',
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
    examples: [
      {
        description: 'Verify user login credentials',
        code: `SELECT
  user_id,
  username,
  crypto_bcrypt_verify('user_input', password_hash) AS is_valid
FROM users
WHERE username = 'alice';`
      }
    ],
    tags: ['password', 'bcrypt', 'verification', 'authentication', 'timing-safe', 'login']
  },
  {
    id: 'crypto_generate_keys',
    name: 'crypto_generate_keys',
    type: 'table',
    category: 'Key Generation',
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
    examples: [
      {
        description: 'Generate 10 RSA key pairs with default 2048-bit keys',
        code: 'SELECT * FROM crypto_generate_keys(10) LIMIT 3;',
        outputTable: {
          columns: [
            { name: 'key_id', align: 'right' },
            { name: 'public_key', align: 'left' },
            { name: 'private_key', align: 'left' },
            { name: 'created_at', align: 'left' }
          ],
          rows: [
            [1, '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEF...', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0B...', '2025-12-03 15:30:45.123'],
            [2, '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEF...', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0B...', '2025-12-03 15:30:45.234'],
            [3, '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEF...', '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0B...', '2025-12-03 15:30:45.345']
          ]
        }
      },
      {
        description: 'Generate 5 high-security 4096-bit key pairs',
        code: 'SELECT * FROM crypto_generate_keys(5, key_size := 4096);'
      },
      {
        description: 'Store generated keys in a table',
        code: `CREATE TABLE user_keys AS
SELECT
  key_id,
  public_key,
  private_key,
  created_at
FROM crypto_generate_keys(100);`
      },
      {
        description: 'Generate keys and immediately assign to users',
        code: `INSERT INTO user_keypairs (user_id, public_key, private_key)
SELECT
  u.user_id,
  k.public_key,
  k.private_key
FROM users u
CROSS JOIN LATERAL crypto_generate_keys(1) k
WHERE u.needs_keypair = true;`
      }
    ],
    tags: ['rsa', 'key-generation', 'public-key', 'private-key', 'asymmetric', 'bulk-operation', 'cryptography']
  },
  {
    id: 'crypto_audit_trail',
    name: 'crypto_audit_trail',
    type: 'table',
    category: 'Auditing',
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
    examples: [
      {
        description: 'Generate audit trail for financial transactions',
        code: "SELECT * FROM crypto_audit_trail('financial_transactions', 'INSERT') LIMIT 5;",
        outputTable: {
          columns: [
            { name: 'record_hash', align: 'left' },
            { name: 'previous_hash', align: 'left' },
            { name: 'sequence_num', align: 'right' },
            { name: 'chain_valid', align: 'center' }
          ],
          rows: [
            ['a7f3b2c8d1e9f0a5b3c7d4e8f1a2b5c9d0e7f3a6b8c1d4e7f0a3b6c9d2e5', '0000000000000000000000000000000000000000000000000000000000000000', 1, true],
            ['b8c1d4e7f0a3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b0c3d6e9f2a5', 'a7f3b2c8d1e9f0a5b3c7d4e8f1a2b5c9d0e7f3a6b8c1d4e7f0a3b6c9d2e5', 2, true],
            ['c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b0c3d6e9f2a5b8c1d4e7f0a3b6', 'b8c1d4e7f0a3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b0c3d6e9f2a5', 3, true],
            ['d0e3f6a9b2c5d8e1f4a7b0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1b4c7', 'c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b0c3d6e9f2a5b8c1d4e7f0a3b6', 4, true],
            ['e1f4a7b0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8', 'd0e3f6a9b2c5d8e1f4a7b0c3d6e9f2a5b8c1d4e7f0a3b6c9d2e5f8a1b4c7', 5, true]
          ]
        }
      },
      {
        description: 'Verify audit chain integrity and detect tampering',
        code: `WITH audit AS (
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
WHERE NOT chain_valid;`,
        outputTable: {
          columns: [
            { name: 'sequence_num', align: 'right' },
            { name: 'record_hash', align: 'left' },
            { name: 'chain_valid', align: 'center' },
            { name: 'status', align: 'left' }
          ],
          rows: [
            [42, 'f2a5b8c1d4e7f0a3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b0c3d6', false, 'TAMPERING DETECTED!'],
            [103, 'a3b6c9d2e5f8a1b4c7d0e3f6a9b2c5d8e1f4a7b0c3d6e9f2a5b8c1d4e7', false, 'TAMPERING DETECTED!']
          ]
        }
      }
    ],
    tags: ['auditing', 'blockchain', 'hash-chain', 'tamper-detection', 'compliance', 'forensics', 'immutable']
  },
  {
    id: 'crypto_hash_agg',
    name: 'crypto_hash_agg',
    type: 'aggregate',
    category: 'Aggregation',
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
    examples: [
      {
        description: 'Generate fingerprint for all users',
        code: `SELECT crypto_hash_agg(email) AS users_fingerprint
FROM users;`
      },
      {
        description: 'Hash all transaction IDs for a daily batch',
        code: `SELECT
  DATE(created_at) AS batch_date,
  crypto_hash_agg(transaction_id) AS batch_hash
FROM transactions
GROUP BY DATE(created_at);`
      },
      {
        description: 'Use SHA-512 for higher security',
        code: `SELECT crypto_hash_agg(sensitive_field, algorithm := 'sha512') AS secure_hash
FROM sensitive_table;`
      },
      {
        description: 'Detect data changes by comparing hashes',
        code: `WITH current_hash AS (
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
      }
    ],
    tags: ['aggregation', 'fingerprint', 'dataset-hash', 'order-independent', 'integrity', 'data-verification']
  },
  {
    id: 'crypto_merkle_root',
    name: 'crypto_merkle_root',
    type: 'aggregate',
    category: 'Aggregation',
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
    examples: [
      {
        description: 'Calculate Merkle root for a block of transactions',
        code: `SELECT
  block_id,
  crypto_merkle_root(transaction_hash) AS merkle_root
FROM blockchain_transactions
GROUP BY block_id;`
      },
      {
        description: 'Verify data integrity using Merkle root',
        code: `WITH daily_blocks AS (
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
FROM daily_blocks;`
      },
      {
        description: 'Create tamper-evident file manifest',
        code: `SELECT crypto_merkle_root(file_hash) AS manifest_hash
FROM uploaded_files
WHERE upload_batch_id = 'batch_123';`
      }
    ],
    tags: ['merkle-tree', 'aggregation', 'blockchain', 'tamper-proof', 'efficient-verification', 'cryptographic']
  },
  {
    id: 'copy_encrypted_parquet',
    name: 'COPY_ENCRYPTED_PARQUET',
    type: 'copy',
    category: 'Data Export',
    parameters: [
      {
        name: 'query',
        type: 'SELECT query',
        paramType: 'positional',
        description: 'The SELECT query whose results will be exported'
      },
      {
        name: 'file_path',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'Destination file path for the encrypted Parquet file'
      }
    ],
    options: [
      {
        name: 'ENCRYPTION_KEY',
        type: 'VARCHAR',
        paramType: 'named',
        description: 'Base64-encoded AES-256 encryption key for client-side encryption'
      },
      {
        name: 'ENCRYPTION_ALGORITHM',
        type: 'VARCHAR',
        paramType: 'named',
        default: "'AES-256'",
        description: "Encryption algorithm to use: 'AES-256' or 'AES-128'"
      },
      {
        name: 'COMPRESSION',
        type: 'VARCHAR',
        paramType: 'named',
        default: "'SNAPPY'",
        description: "Compression codec: 'SNAPPY', 'GZIP', 'ZSTD', or 'NONE'"
      },
      {
        name: 'ROW_GROUP_SIZE',
        type: 'INTEGER',
        paramType: 'named',
        default: '100000',
        description: 'Number of rows per Parquet row group'
      }
    ],
    description: 'Exports query results to an encrypted Parquet file with client-side encryption. The entire file is encrypted at rest using AES-256, ensuring data confidentiality during storage and transit. Compatible with standard Parquet readers when decryption keys are provided.',
    examples: [
      {
        description: 'Export encrypted user data to Parquet',
        code: `COPY (
  SELECT user_id, email, created_at, subscription_tier
  FROM users
  WHERE created_at > '2024-01-01'
)
TO 'encrypted_users.parquet'
WITH (
  ENCRYPTION_KEY 'YourBase64EncodedKey==',
  COMPRESSION 'ZSTD'
);`
      },
      {
        description: 'Export with custom row group size for large datasets',
        code: `COPY (
  SELECT transaction_id, amount, timestamp, customer_id
  FROM transactions
  WHERE amount > 1000
)
TO 's3://my-bucket/encrypted-transactions.parquet'
WITH (
  ENCRYPTION_KEY 'YourBase64EncodedKey==',
  ROW_GROUP_SIZE 500000,
  COMPRESSION 'SNAPPY'
);`
      }
    ],
    tags: ['export', 'parquet', 'encryption', 'data-export', 'client-side-encryption', 'compression']
  },
  {
    id: 'copy_encrypted_csv',
    name: 'COPY_ENCRYPTED_CSV',
    type: 'copy',
    category: 'Data Export',
    parameters: [
      {
        name: 'query',
        type: 'SELECT query',
        paramType: 'positional',
        description: 'The SELECT query whose results will be exported'
      },
      {
        name: 'file_path',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'Destination file path for the encrypted CSV file'
      }
    ],
    options: [
      {
        name: 'ENCRYPTION_KEY',
        type: 'VARCHAR',
        paramType: 'named',
        description: 'Encryption key for securing the CSV file contents'
      },
      {
        name: 'DELIMITER',
        type: 'VARCHAR',
        paramType: 'named',
        default: "','",
        description: 'Field delimiter character'
      },
      {
        name: 'HEADER',
        type: 'BOOLEAN',
        paramType: 'named',
        default: 'true',
        description: 'Include column headers in the output'
      },
      {
        name: 'QUOTE',
        type: 'VARCHAR',
        paramType: 'named',
        default: '"',
        description: 'Quote character for string fields'
      }
    ],
    description: 'Exports query results to an encrypted CSV file. The CSV file is encrypted before being written to disk, protecting sensitive data in a portable text format. Useful for secure data exchange with systems that require CSV input.',
    examples: [
      {
        description: 'Export encrypted customer data to CSV',
        code: `COPY (
  SELECT customer_id, name, email, phone
  FROM customers
  WHERE region = 'US'
)
TO 'encrypted_customers.csv'
WITH (
  ENCRYPTION_KEY 'YourSecureKey123',
  HEADER true,
  DELIMITER ','
);`
      }
    ],
    tags: ['export', 'csv', 'encryption', 'data-export', 'text-format', 'portable']
  },
  {
    id: 'copy_signed_json',
    name: 'COPY_SIGNED_JSON',
    type: 'copy',
    category: 'Data Export',
    parameters: [
      {
        name: 'query',
        type: 'SELECT query',
        paramType: 'positional',
        description: 'The SELECT query whose results will be exported'
      },
      {
        name: 'file_path',
        type: 'VARCHAR',
        paramType: 'positional',
        description: 'Destination file path for the signed JSON file'
      }
    ],
    options: [
      {
        name: 'SIGNING_KEY',
        type: 'VARCHAR',
        paramType: 'named',
        description: 'HMAC signing key for generating digital signatures'
      },
      {
        name: 'FORMAT',
        type: 'VARCHAR',
        paramType: 'named',
        default: "'ARRAY'",
        description: "JSON format: 'ARRAY' (array of objects) or 'NEWLINE_DELIMITED' (JSONL)"
      },
      {
        name: 'PRETTY',
        type: 'BOOLEAN',
        paramType: 'named',
        default: 'false',
        description: 'Pretty-print the JSON output with indentation'
      }
    ],
    description: 'Exports query results to a cryptographically signed JSON file. Each record is signed with HMAC-SHA256, enabling tamper detection and data integrity verification. The signature is included in the output, allowing consumers to verify authenticity.',
    examples: [
      {
        description: 'Export signed API response data',
        code: `COPY (
  SELECT api_key, rate_limit, created_at, permissions
  FROM api_keys
  WHERE status = 'active'
)
TO 'signed_api_keys.json'
WITH (
  SIGNING_KEY 'your-hmac-secret-key',
  FORMAT 'ARRAY',
  PRETTY true
);`
      },
      {
        description: 'Export newline-delimited signed events',
        code: `COPY (
  SELECT event_id, event_type, user_id, timestamp, payload
  FROM audit_events
  WHERE timestamp > CURRENT_DATE - INTERVAL 7 DAYS
)
TO 'signed_events.jsonl'
WITH (
  SIGNING_KEY 'audit-signing-key',
  FORMAT 'NEWLINE_DELIMITED'
);`
      }
    ],
    tags: ['export', 'json', 'signing', 'data-export', 'integrity', 'tamper-detection', 'hmac']
  }
];

const pragmas: Pragma[] = [
  {
    name: 'crypto_default_hash_algorithm',
    default: 'sha256',
    type: 'string',
    validValues: ['sha256', 'sha512', 'blake2b'],
    description: 'Sets the default hashing algorithm used by crypto functions when no algorithm is explicitly specified.',
    example: "SET crypto_default_hash_algorithm = 'sha512';"
  },
  {
    name: 'crypto_enable_timing_safe_compare',
    default: true,
    type: 'boolean',
    description: 'Enables constant-time comparison for password verification to prevent timing attacks. Should always be enabled in production.',
    example: "SET crypto_enable_timing_safe_compare = true;"
  },
  {
    name: 'crypto_max_key_generation_batch',
    default: 1000,
    type: 'number',
    description: 'Maximum number of cryptographic keys that can be generated in a single batch operation. Prevents excessive memory usage.',
    example: "SET crypto_max_key_generation_batch = 500;"
  },
  {
    name: 'crypto_bcrypt_default_cost',
    default: 10,
    type: 'number',
    description: 'Default cost factor for bcrypt password hashing (4-31). Higher values are more secure but slower. Recommended: 10-12 for most applications.',
    example: "SET crypto_bcrypt_default_cost = 12;"
  }
];

const secrets: Secret[] = [
  {
    id: 'aws-s3-crypto',
    name: 'aws_s3_crypto',
    type: 'S3',
    category: 'Cloud Storage',
    description: 'AWS S3 credentials for encrypting and decrypting data stored in S3 buckets. Enables server-side encryption with customer-provided keys (SSE-C) and client-side encryption workflows.',
    parameters: [
      {
        name: 'access_key_id',
        type: 'VARCHAR',
        required: true,
        description: 'AWS access key ID for authentication'
      },
      {
        name: 'secret_access_key',
        type: 'VARCHAR',
        required: true,
        description: 'AWS secret access key for authentication'
      },
      {
        name: 'region',
        type: 'VARCHAR',
        required: true,
        description: 'AWS region where the S3 bucket is located (e.g., us-east-1)'
      },
      {
        name: 'session_token',
        type: 'VARCHAR',
        required: false,
        description: 'Temporary session token for AWS STS credentials'
      },
      {
        name: 'encryption_key',
        type: 'VARCHAR',
        required: false,
        description: 'Base64-encoded 256-bit AES key for client-side encryption'
      }
    ],
    examples: [
      {
        description: 'Create an S3 secret with encryption key',
        code: `CREATE SECRET aws_s3_crypto (
  TYPE S3,
  access_key_id 'AKIAIOSFODNN7EXAMPLE',
  secret_access_key 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  region 'us-east-1',
  encryption_key 'YourBase64EncodedEncryptionKey=='
);`
      },
      {
        description: 'Read encrypted data from S3',
        code: `SELECT *
FROM read_parquet('s3://my-bucket/encrypted-data/*.parquet')
WHERE created_at > '2024-01-01';`
      },
      {
        description: 'Write encrypted data to S3',
        code: `COPY (
  SELECT
    crypto_sha256(user_id) AS anonymous_id,
    transaction_amount,
    created_at
  FROM transactions
)
TO 's3://my-bucket/encrypted-output/data.parquet'
(FORMAT PARQUET, ENCRYPTION 'AES-256');`
      }
    ]
  },
  {
    id: 'azure-blob-crypto',
    name: 'azure_blob_crypto',
    type: 'Azure Blob',
    category: 'Cloud Storage',
    description: 'Azure Blob Storage credentials for encrypted data operations. Supports Azure Storage encryption at rest and customer-managed keys.',
    parameters: [
      {
        name: 'account_name',
        type: 'VARCHAR',
        required: true,
        description: 'Azure Storage account name'
      },
      {
        name: 'account_key',
        type: 'VARCHAR',
        required: true,
        description: 'Azure Storage account key for authentication'
      },
      {
        name: 'connection_string',
        type: 'VARCHAR',
        required: false,
        description: 'Full Azure Storage connection string (alternative to account_name + account_key)'
      },
      {
        name: 'encryption_scope',
        type: 'VARCHAR',
        required: false,
        description: 'Azure encryption scope for customer-managed keys'
      }
    ],
    examples: [
      {
        description: 'Create an Azure Blob secret',
        code: `CREATE SECRET azure_blob_crypto (
  TYPE AZURE,
  account_name 'mystorageaccount',
  account_key 'your-account-key-here==',
  encryption_scope 'my-encryption-scope'
);`
      },
      {
        description: 'Query encrypted blob storage',
        code: `SELECT *
FROM read_csv('azure://mycontainer/encrypted-data/*.csv')
LIMIT 100;`
      }
    ]
  },
  {
    id: 'gcs-crypto',
    name: 'gcs_crypto',
    type: 'GCS',
    category: 'Cloud Storage',
    description: 'Google Cloud Storage credentials for encrypted data operations. Supports customer-supplied encryption keys (CSEK) and Cloud KMS integration.',
    parameters: [
      {
        name: 'service_account_key',
        type: 'VARCHAR',
        required: true,
        description: 'JSON service account key for authentication'
      },
      {
        name: 'project_id',
        type: 'VARCHAR',
        required: true,
        description: 'GCP project ID'
      },
      {
        name: 'encryption_key',
        type: 'VARCHAR',
        required: false,
        description: 'Base64-encoded customer-supplied encryption key (CSEK)'
      },
      {
        name: 'kms_key_name',
        type: 'VARCHAR',
        required: false,
        description: 'Cloud KMS key resource name for encryption'
      }
    ],
    examples: [
      {
        description: 'Create a GCS secret with CSEK',
        code: `CREATE SECRET gcs_crypto (
  TYPE GCS,
  service_account_key '{"type":"service_account",...}',
  project_id 'my-project-id',
  encryption_key 'YourBase64EncodedCSEKKey=='
);`
      },
      {
        description: 'Access encrypted GCS data',
        code: `SELECT COUNT(*) AS total_records
FROM read_parquet('gs://my-bucket/encrypted-data/*.parquet');`
      }
    ]
  },
  {
    id: 'database-crypto',
    name: 'database_crypto',
    type: 'Database',
    category: 'Database Connections',
    description: 'Encrypted database connection credentials for secure access to external databases. Stores connection strings and credentials with encryption at rest.',
    parameters: [
      {
        name: 'connection_string',
        type: 'VARCHAR',
        required: true,
        description: 'Database connection string (supports PostgreSQL, MySQL, SQL Server)'
      },
      {
        name: 'username',
        type: 'VARCHAR',
        required: true,
        description: 'Database username'
      },
      {
        name: 'password',
        type: 'VARCHAR',
        required: true,
        description: 'Database password (encrypted at rest)'
      },
      {
        name: 'ssl_cert',
        type: 'VARCHAR',
        required: false,
        description: 'SSL certificate for encrypted connections'
      },
      {
        name: 'ssl_key',
        type: 'VARCHAR',
        required: false,
        description: 'SSL private key for encrypted connections'
      }
    ],
    examples: [
      {
        description: 'Create a PostgreSQL secret with SSL',
        code: `CREATE SECRET database_crypto (
  TYPE POSTGRES,
  connection_string 'host=db.example.com port=5432 dbname=mydb',
  username 'dbuser',
  password 'securepassword123',
  ssl_cert 'path/to/client-cert.pem',
  ssl_key 'path/to/client-key.pem'
);`
      },
      {
        description: 'Query external database securely',
        code: `ATTACH 'host=db.example.com' AS external_db (TYPE POSTGRES, SECRET database_crypto);

SELECT *
FROM external_db.public.sensitive_data
WHERE department = 'Finance';`
      }
    ]
  }
];

const macros: Macro[] = [
  {
    id: 'hash_pii',
    name: 'hash_pii',
    category: 'Data Privacy',
    description: 'Convenience macro for hashing personally identifiable information (PII) fields using SHA-256. Simplifies anonymization workflows by providing a shorthand for common hashing operations.',
    definition: "CREATE MACRO hash_pii(field) AS crypto_sha256(CAST(field AS VARCHAR));",
    examples: [
      {
        description: 'Anonymize PII fields in a query',
        code: `SELECT
  hash_pii(email) AS user_hash,
  hash_pii(phone) AS phone_hash,
  order_total,
  created_at
FROM orders
LIMIT 10;`,
        outputTable: {
          columns: [
            { name: 'user_hash', align: 'left' },
            { name: 'phone_hash', align: 'left' },
            { name: 'order_total', align: 'right' },
            { name: 'created_at', align: 'left' }
          ],
          rows: [
            ['a591a6d40bf42040...', 'f7c3bc1d808e04732...', 125.50, '2024-01-15'],
            ['3c59dc048e88461f...', '1679091c5a880faf6...', 89.99, '2024-01-16']
          ]
        }
      },
      {
        description: 'Create anonymized export',
        code: `COPY (
  SELECT
    hash_pii(customer_email) AS customer_id,
    hash_pii(customer_phone) AS phone_id,
    product_category,
    purchase_amount
  FROM sales
  WHERE created_at >= '2024-01-01'
) TO 'anonymized_sales.parquet' (FORMAT PARQUET);`
      }
    ]
  },
  {
    id: 'secure_compare',
    name: 'secure_compare',
    category: 'Security',
    description: 'Timing-safe string comparison macro that prevents timing attacks. Uses constant-time comparison to ensure the comparison duration does not leak information about the strings being compared.',
    definition: "CREATE MACRO secure_compare(a, b) AS crypto_hmac_sha256(CAST(a AS VARCHAR), 'compare') = crypto_hmac_sha256(CAST(b AS VARCHAR), 'compare');",
    examples: [
      {
        description: 'Safely compare sensitive tokens',
        code: `SELECT
  token_id,
  secure_compare(stored_token, input_token) AS is_valid
FROM api_tokens
WHERE user_id = 12345;`,
        outputTable: {
          columns: [
            { name: 'token_id', align: 'left' },
            { name: 'is_valid', align: 'left' }
          ],
          rows: [
            ['tok_abc123', true],
            ['tok_def456', false]
          ]
        }
      }
    ]
  },
  {
    id: 'fingerprint_row',
    name: 'fingerprint_row',
    category: 'Data Integrity',
    description: 'Generates a cryptographic fingerprint for an entire row by concatenating all column values and hashing them. Useful for change detection, deduplication, and data integrity verification.',
    definition: "CREATE MACRO fingerprint_row(cols) AS crypto_sha256(CAST(cols AS VARCHAR));",
    examples: [
      {
        description: 'Detect changed records',
        code: `SELECT
  id,
  fingerprint_row(STRUCT_PACK(*)) AS row_hash,
  name,
  email,
  updated_at
FROM users
WHERE updated_at > CURRENT_DATE - INTERVAL 7 DAYS;`
      },
      {
        description: 'Deduplicate records based on content',
        code: `WITH fingerprinted AS (
  SELECT
    *,
    fingerprint_row(STRUCT_PACK(name, email, phone)) AS content_hash
  FROM contacts
)
SELECT DISTINCT ON (content_hash)
  name,
  email,
  phone
FROM fingerprinted
ORDER BY content_hash, created_at DESC;`
      }
    ]
  },
  {
    id: 'encrypt_field',
    name: 'encrypt_field',
    category: 'Encryption',
    description: 'Simplified field encryption macro using AES-256. Wraps complex encryption operations into an easy-to-use function for encrypting sensitive data at rest.',
    definition: "CREATE MACRO encrypt_field(plaintext, key) AS encode(crypto_aes_encrypt(CAST(plaintext AS VARCHAR), key));",
    examples: [
      {
        description: 'Encrypt sensitive fields before storage',
        code: `INSERT INTO secure_storage (id, encrypted_ssn, encrypted_credit_card)
SELECT
  id,
  encrypt_field(ssn, 'your-encryption-key') AS encrypted_ssn,
  encrypt_field(credit_card, 'your-encryption-key') AS encrypted_credit_card
FROM sensitive_data;`
      }
    ]
  },
  {
    id: 'audit_hash_chain',
    name: 'audit_hash_chain',
    category: 'Auditing',
    description: 'Creates a hash chain for audit trail records by combining the current record hash with the previous hash. Ensures tamper-evident logging where any modification breaks the chain.',
    definition: "CREATE MACRO audit_hash_chain(current_data, previous_hash) AS crypto_sha256(CAST(current_data AS VARCHAR) || COALESCE(previous_hash, ''));",
    examples: [
      {
        description: 'Build tamper-evident audit log',
        code: `WITH audit_chain AS (
  SELECT
    id,
    action,
    user_id,
    created_at,
    LAG(hash) OVER (ORDER BY created_at) AS prev_hash,
    audit_hash_chain(
      STRUCT_PACK(id, action, user_id, created_at),
      LAG(hash) OVER (ORDER BY created_at)
    ) AS hash
  FROM audit_log
)
SELECT * FROM audit_chain
ORDER BY created_at;`
      },
      {
        description: 'Verify audit trail integrity',
        code: `WITH audit_chain AS (
  SELECT
    *,
    LAG(hash) OVER (ORDER BY created_at) AS prev_hash,
    audit_hash_chain(
      STRUCT_PACK(id, action, user_id, created_at),
      LAG(hash) OVER (ORDER BY created_at)
    ) AS computed_hash
  FROM audit_log
)
SELECT
  id,
  action,
  CASE
    WHEN hash = computed_hash THEN 'Valid'
    ELSE 'Tampered'
  END AS integrity_status
FROM audit_chain;`
      }
    ]
  }
];

const filesystems: Filesystem[] = [
  {
    id: 'encrypted-s3',
    name: 'encrypted_s3',
    description: 'Virtual filesystem for reading and writing encrypted data to Amazon S3. Automatically handles client-side encryption and decryption using AES-256 with customer-provided keys. Seamlessly integrates with DuckDB\'s S3 filesystem while adding transparent encryption layer.',
    category: 'Cloud Storage'
  },
  {
    id: 'encrypted-azure',
    name: 'encrypted_azure',
    description: 'Virtual filesystem for Azure Blob Storage with built-in encryption support. Provides transparent encryption and decryption using Azure-compatible encryption standards. Works with customer-managed keys and Azure Key Vault integration.',
    category: 'Cloud Storage'
  },
  {
    id: 'encrypted-local',
    name: 'encrypted_local',
    description: 'Local filesystem overlay that provides transparent file-level encryption. All files are automatically encrypted at rest using AES-256. Ideal for storing sensitive data on disk while maintaining DuckDB\'s standard file access patterns.',
    category: 'Local Storage'
  },
  {
    id: 'vault-secrets',
    name: 'vault',
    description: 'HashiCorp Vault integration filesystem for reading secrets and credentials directly from Vault. Enables secure access to centrally managed secrets without storing credentials in query scripts or configuration files.',
    category: 'Secret Management'
  }
];

const storageExtensions: StorageExtension[] = [
  {
    id: 'encrypted-postgres',
    name: 'ENCRYPTED_POSTGRES',
    category: 'Encrypted Database Storage',
    description: 'Attach to PostgreSQL databases with automatic client-side encryption and decryption. All data transferred between DuckDB and PostgreSQL is encrypted using AES-256, protecting sensitive information in transit and at rest.',
    parameters: [
      {
        name: 'host',
        type: 'VARCHAR',
        required: true,
        description: 'PostgreSQL server hostname or IP address'
      },
      {
        name: 'port',
        type: 'INTEGER',
        required: false,
        description: 'PostgreSQL server port number',
        default: '5432'
      },
      {
        name: 'database',
        type: 'VARCHAR',
        required: true,
        description: 'Name of the PostgreSQL database to attach'
      },
      {
        name: 'user',
        type: 'VARCHAR',
        required: true,
        description: 'PostgreSQL username for authentication'
      },
      {
        name: 'password',
        type: 'VARCHAR',
        required: false,
        description: 'PostgreSQL password (can use secrets instead)'
      },
      {
        name: 'encryption_key',
        type: 'VARCHAR',
        required: true,
        description: 'Base64-encoded AES-256 encryption key for data encryption'
      },
      {
        name: 'ssl_mode',
        type: 'VARCHAR',
        required: false,
        description: 'SSL connection mode (disable, require, verify-ca, verify-full)',
        default: 'require'
      }
    ],
    examples: [
      {
        description: 'Attach an encrypted PostgreSQL database using connection parameters',
        code: `-- Attach encrypted PostgreSQL database
ATTACH 'secure_db' (
  TYPE ENCRYPTED_POSTGRES,
  host 'db.example.com',
  database 'production',
  user 'analytics_user',
  password 'secret123',
  encryption_key 'base64_encoded_key_here=='
);

-- Query encrypted data
SELECT * FROM secure_db.users LIMIT 5;`,
        output: 'Database attached successfully. All queries automatically encrypt/decrypt data.'
      },
      {
        description: 'Use with DuckDB secrets for credential management',
        code: `-- Create secret for PostgreSQL credentials
CREATE SECRET pg_creds (
  TYPE POSTGRES,
  host 'db.example.com',
  user 'analytics_user',
  password 'secret123'
);

-- Attach using secret reference
ATTACH 'secure_db' (
  TYPE ENCRYPTED_POSTGRES,
  secret pg_creds,
  database 'production',
  encryption_key 'base64_encoded_key_here=='
);`
      }
    ]
  },
  {
    id: 'encrypted-mysql',
    name: 'ENCRYPTED_MYSQL',
    category: 'Encrypted Database Storage',
    description: 'Connect to MySQL databases with transparent encryption layer. Provides client-side encryption for all data transfers, ensuring sensitive information remains protected even when the MySQL server is compromised.',
    parameters: [
      {
        name: 'host',
        type: 'VARCHAR',
        required: true,
        description: 'MySQL server hostname or IP address'
      },
      {
        name: 'port',
        type: 'INTEGER',
        required: false,
        description: 'MySQL server port number',
        default: '3306'
      },
      {
        name: 'database',
        type: 'VARCHAR',
        required: true,
        description: 'Name of the MySQL database to attach'
      },
      {
        name: 'user',
        type: 'VARCHAR',
        required: true,
        description: 'MySQL username for authentication'
      },
      {
        name: 'password',
        type: 'VARCHAR',
        required: false,
        description: 'MySQL password (can use secrets instead)'
      },
      {
        name: 'encryption_key',
        type: 'VARCHAR',
        required: true,
        description: 'Base64-encoded AES-256 encryption key'
      }
    ],
    examples: [
      {
        description: 'Attach encrypted MySQL database',
        code: `ATTACH 'analytics_db' (
  TYPE ENCRYPTED_MYSQL,
  host 'mysql.example.com',
  database 'analytics',
  user 'analyst',
  password 'password123',
  encryption_key 'your_base64_key=='
);

-- Access encrypted tables
SELECT COUNT(*) FROM analytics_db.transactions;`
      }
    ]
  },
  {
    id: 'vault-db',
    name: 'VAULT_DB',
    category: 'Secret Management Storage',
    description: 'Attach to databases using credentials dynamically fetched from HashiCorp Vault. Eliminates hardcoded credentials and provides automatic credential rotation, audit logging, and centralized secret management.',
    parameters: [
      {
        name: 'vault_addr',
        type: 'VARCHAR',
        required: true,
        description: 'HashiCorp Vault server address (e.g., https://vault.example.com:8200)'
      },
      {
        name: 'vault_token',
        type: 'VARCHAR',
        required: true,
        description: 'Vault authentication token or AppRole credentials'
      },
      {
        name: 'secret_path',
        type: 'VARCHAR',
        required: true,
        description: 'Path to database credentials in Vault (e.g., secret/data/postgres/prod)'
      },
      {
        name: 'db_type',
        type: 'VARCHAR',
        required: true,
        description: 'Database type (postgres, mysql, sqlite, etc.)'
      },
      {
        name: 'refresh_interval',
        type: 'INTEGER',
        required: false,
        description: 'Credential refresh interval in seconds for automatic rotation',
        default: '3600'
      }
    ],
    examples: [
      {
        description: 'Attach database using Vault-managed credentials',
        code: `-- Attach using Vault for credential management
ATTACH 'prod_db' (
  TYPE VAULT_DB,
  vault_addr 'https://vault.company.com:8200',
  vault_token 'hvs.CAESIJ...',
  secret_path 'secret/data/databases/production',
  db_type 'postgres'
);

-- Credentials automatically rotated based on Vault policies
SELECT * FROM prod_db.customers;`
      },
      {
        description: 'Use Vault AppRole authentication',
        code: `-- Attach with AppRole for service authentication
ATTACH 'analytics' (
  TYPE VAULT_DB,
  vault_addr 'https://vault.company.com:8200',
  vault_token 'role_id=xxx&secret_id=yyy',
  secret_path 'database/creds/analytics-role',
  db_type 'postgres',
  refresh_interval 1800
);`
      }
    ]
  }
];

const logTypes: LogType[] = [
  {
    id: 'crypto-operation-log',
    name: 'CryptoOperationLog',
    category: 'Security Logging',
    description: 'Logs all cryptographic operations performed by the extension including hashing, encryption, and key generation. Captures operation type, input size, algorithm used, and execution time for security auditing and performance monitoring.',
    examples: [
      {
        description: 'Enable crypto operation logging',
        code: `-- Enable logging for crypto operations
SET log_crypto_operations = true;

-- Perform some crypto operations
SELECT crypto_sha256('test data');
SELECT crypto_bcrypt_hash('password123');
SELECT crypto_hmac('message', 'secret', 'sha256');

-- View the log entries
SELECT * FROM duckdb_logs() WHERE log_type = 'CryptoOperationLog';`,
        outputTable: {
          columns: [
            { name: 'timestamp', align: 'left' },
            { name: 'operation', align: 'left' },
            { name: 'algorithm', align: 'left' },
            { name: 'input_size', align: 'right' },
            { name: 'duration_ms', align: 'right' }
          ],
          rows: [
            ['2024-12-04 10:15:23', 'hash', 'SHA256', '9', '0.12'],
            ['2024-12-04 10:15:24', 'hash', 'bcrypt', '13', '45.67'],
            ['2024-12-04 10:15:25', 'hmac', 'SHA256', '7', '0.08']
          ]
        }
      }
    ]
  },
  {
    id: 'key-access-log',
    name: 'KeyAccessLog',
    category: 'Security Logging',
    description: 'Tracks all access to encryption keys and secrets managed by the crypto extension. Records key identifiers, access timestamps, and the context of key usage for compliance and security monitoring.',
    examples: [
      {
        description: 'Track key access events',
        code: `-- Enable key access logging
SET log_key_access = true;

-- Use keys for encryption
SELECT crypto_encrypt(data, 'key_id_123') FROM sensitive_table;

-- View key access logs
SELECT * FROM duckdb_logs() WHERE log_type = 'KeyAccessLog';`,
        outputTable: {
          columns: [
            { name: 'timestamp', align: 'left' },
            { name: 'key_id', align: 'left' },
            { name: 'operation', align: 'left' },
            { name: 'user', align: 'left' }
          ],
          rows: [
            ['2024-12-04 10:20:15', 'key_id_123', 'encrypt', 'analytics_user'],
            ['2024-12-04 10:20:16', 'key_id_123', 'encrypt', 'analytics_user']
          ]
        }
      }
    ]
  },
  {
    id: 'hash-collision-log',
    name: 'HashCollisionLog',
    category: 'Data Quality Logging',
    description: 'Detects and logs potential hash collisions when using fingerprinting or deduplication features. Helps identify data quality issues and potential security concerns in hash-based operations.',
    examples: [
      {
        description: 'Monitor for hash collisions',
        code: `-- Enable collision detection logging
SET log_hash_collisions = true;

-- Perform batch hashing with collision detection
SELECT
  id,
  crypto_sha256(data) as hash,
  COUNT(*) OVER (PARTITION BY crypto_sha256(data)) as collision_count
FROM large_dataset;

-- Check collision log
SELECT * FROM duckdb_logs() WHERE log_type = 'HashCollisionLog';`
      }
    ]
  }
];

const logStorageTypes: LogStorageType[] = [
  {
    id: 'siem-log-storage',
    name: 'SIEM',
    category: 'External Log Storage',
    description: 'Send log events to Security Information and Event Management (SIEM) systems like Splunk, Elastic, or Datadog. Supports HTTP/HTTPS endpoints with authentication and batching for efficient log transmission.',
    parameters: [
      {
        name: 'endpoint',
        type: 'VARCHAR',
        required: true,
        description: 'SIEM HTTP endpoint URL for log ingestion'
      },
      {
        name: 'api_key',
        type: 'VARCHAR',
        required: true,
        description: 'API key or authentication token for SIEM access'
      },
      {
        name: 'batch_size',
        type: 'INTEGER',
        required: false,
        description: 'Number of log events to batch before sending',
        default: '100'
      },
      {
        name: 'batch_timeout_ms',
        type: 'INTEGER',
        required: false,
        description: 'Maximum time to wait before sending partial batch',
        default: '5000'
      },
      {
        name: 'compression',
        type: 'BOOLEAN',
        required: false,
        description: 'Enable gzip compression for log transmission',
        default: 'true'
      }
    ],
    examples: [
      {
        description: 'Configure SIEM log storage for Datadog',
        code: `-- Configure log storage to send to Datadog
SET log_storage = 'SIEM';
SET log_storage_config = '{
  "endpoint": "https://http-intake.logs.datadoghq.com/v1/input",
  "api_key": "your_datadog_api_key",
  "batch_size": 50,
  "batch_timeout_ms": 3000,
  "compression": true
}';

-- Enable crypto operation logging
SET log_crypto_operations = true;

-- All crypto operations will now be sent to Datadog
SELECT crypto_sha256('test');`,
        output: 'Log storage configured. Crypto operations will be sent to Datadog SIEM.'
      }
    ]
  },
  {
    id: 's3-log-storage',
    name: 'S3',
    category: 'Cloud Log Storage',
    description: 'Store log events in Amazon S3 buckets with automatic partitioning by date and log type. Supports encryption at rest and configurable retention policies.',
    parameters: [
      {
        name: 'bucket',
        type: 'VARCHAR',
        required: true,
        description: 'S3 bucket name for log storage'
      },
      {
        name: 'prefix',
        type: 'VARCHAR',
        required: false,
        description: 'S3 key prefix for organizing logs',
        default: 'duckdb-logs/'
      },
      {
        name: 'region',
        type: 'VARCHAR',
        required: true,
        description: 'AWS region where the bucket is located'
      },
      {
        name: 'format',
        type: 'VARCHAR',
        required: false,
        description: 'Log file format (json, parquet, csv)',
        default: 'parquet'
      },
      {
        name: 'partition_by',
        type: 'VARCHAR',
        required: false,
        description: 'Partitioning strategy (date, hour, logtype)',
        default: 'date'
      },
      {
        name: 'encryption',
        type: 'VARCHAR',
        required: false,
        description: 'S3 server-side encryption (SSE-S3, SSE-KMS)',
        default: 'SSE-S3'
      }
    ],
    examples: [
      {
        description: 'Configure S3 log storage with Parquet format',
        code: `-- Set up S3 log storage
SET log_storage = 'S3';
SET log_storage_config = '{
  "bucket": "my-company-duckdb-logs",
  "prefix": "production/crypto-logs/",
  "region": "us-east-1",
  "format": "parquet",
  "partition_by": "date",
  "encryption": "SSE-KMS"
}';

-- Logs will be written to:
-- s3://my-company-duckdb-logs/production/crypto-logs/date=2024-12-04/CryptoOperationLog.parquet
SELECT crypto_sha256('test');`
      }
    ]
  },
  {
    id: 'postgres-log-storage',
    name: 'PostgreSQL',
    category: 'Database Log Storage',
    description: 'Store log events in a PostgreSQL database table with full SQL query capabilities. Ideal for centralized logging across multiple DuckDB instances with long-term retention.',
    parameters: [
      {
        name: 'connection_string',
        type: 'VARCHAR',
        required: true,
        description: 'PostgreSQL connection string'
      },
      {
        name: 'table_name',
        type: 'VARCHAR',
        required: false,
        description: 'Table name for storing logs',
        default: 'duckdb_logs'
      },
      {
        name: 'auto_create_table',
        type: 'BOOLEAN',
        required: false,
        description: 'Automatically create table if it does not exist',
        default: 'true'
      },
      {
        name: 'async_write',
        type: 'BOOLEAN',
        required: false,
        description: 'Write logs asynchronously to avoid blocking queries',
        default: 'true'
      }
    ],
    examples: [
      {
        description: 'Store logs in PostgreSQL for centralized monitoring',
        code: `-- Configure PostgreSQL log storage
SET log_storage = 'PostgreSQL';
SET log_storage_config = '{
  "connection_string": "postgresql://user:pass@localhost:5432/logs",
  "table_name": "duckdb_crypto_logs",
  "auto_create_table": true,
  "async_write": true
}';

-- All logs now written to PostgreSQL
SET log_crypto_operations = true;
SELECT crypto_bcrypt_hash('password');

-- Query logs from PostgreSQL
ATTACH 'logs_db' (TYPE POSTGRES, connection_string 'postgresql://user:pass@localhost:5432/logs');
SELECT * FROM logs_db.duckdb_crypto_logs ORDER BY timestamp DESC LIMIT 10;`
      }
    ]
  }
];

const technicalOverview: TechnicalOverview = {
  eyebrow: "Technical Overview",
  title: "Why Use Crypto Functions?",
  description: "Understanding when and how to leverage cryptographic capabilities in your data workflows.",
  sections: [
    {
      icon: '🔒',
      title: 'Data Security & Compliance',
      description: 'Modern data systems must handle sensitive information securely. This extension provides enterprise-grade cryptographic primitives directly within DuckDB, eliminating the need to export sensitive data to external systems for encryption or hashing.',
      bulletPoints: [
        {
          label: 'Password Storage',
          description: 'Use bcrypt hashing for secure password storage with automatic salt generation and configurable work factors.'
        },
        {
          label: 'PII Protection',
          description: 'Hash or encrypt personally identifiable information (PII) to meet GDPR, CCPA, and HIPAA requirements.'
        },
        {
          label: 'Data Masking',
          description: 'Create consistent, irreversible hashes for data anonymization in analytics and testing environments.'
        }
      ]
    },
    {
      icon: '✓',
      title: 'Data Integrity & Verification',
      description: 'Ensure data hasn\'t been tampered with by generating cryptographic fingerprints and audit trails. Detect unauthorized modifications and maintain chain-of-custody for critical data.',
      bulletPoints: [
        {
          label: 'Blockchain-Style Auditing',
          description: 'Build immutable audit trails using hash chaining to detect any tampering with historical records.'
        },
        {
          label: 'Aggregate Verification',
          description: 'Generate Merkle roots and aggregate hashes to verify entire datasets with a single value.'
        },
        {
          label: 'Checksum Validation',
          description: 'Quickly validate data integrity during ETL pipelines and data transfers.'
        }
      ]
    },
    {
      icon: '⚡',
      title: 'Performance & Scalability',
      description: 'Native DuckDB extensions leverage columnar processing and vectorized execution for high-performance cryptographic operations on large datasets without moving data out of the database.',
      bulletPoints: [
        {
          label: 'In-Database Processing',
          description: 'Process millions of rows without data serialization or network overhead.'
        },
        {
          label: 'Vectorized Operations',
          description: 'Benefit from DuckDB\'s SIMD optimizations for batch hashing and encryption.'
        },
        {
          label: 'Zero-Copy Architecture',
          description: 'Avoid expensive data transfers between database and application layers.'
        }
      ]
    },
    {
      icon: '🎯',
      title: 'Common Use Cases',
      description: '',
      useCases: [
        {
          title: 'Financial Services',
          description: 'Transaction verification, audit trails for compliance, and secure customer data handling.'
        },
        {
          title: 'Healthcare Systems',
          description: 'HIPAA-compliant patient data encryption, secure medical record hashing, and audit logging.'
        },
        {
          title: 'Data Engineering',
          description: 'ETL pipeline checksums, data deduplication via hashing, and secure data lake operations.'
        },
        {
          title: 'SaaS Applications',
          description: 'Multi-tenant data isolation, API key management, and secure password authentication.'
        }
      ]
    }
  ]
};

const pricing: PricingInfo = {
  eyebrow: "Commercial Extension",
  title: "Pricing",
  description: "Unlike many DuckDB extensions, the Crypto extension is a commercially licensed product. This allows us to provide enterprise-grade security features, dedicated support, and continuous development. Start with a 15-day free trial to evaluate.",
  trialDays: 15,
  registrationRequired: true,
  registrationUrl: "https://query.farm/register",
  tiers: [
    {
      name: "Base License",
      price: "$1,000",
      period: "monthly",
      description: "Up to 5 concurrent instances",
      highlighted: true,
      features: [
        "5 concurrent instances included",
        "All cryptographic functions",
        "Unlimited queries per instance",
        "Email & chat support",
        "SLA guarantee"
      ]
    },
    {
      name: "Additional Capacity",
      price: "$2,500",
      period: "monthly",
      description: "Per 10 additional instances",
      features: [
        "Add 10 more concurrent instances",
        "Stack multiple add-ons as needed",
        "Same feature set as base license",
        "Volume discounts available",
        "Contact us for 50+ instances"
      ]
    }
  ],
  termsMarkdown: `
<h4>License Terms</h4>
<p>The Crypto extension is licensed based on concurrent instances. An instance is defined as a single DuckDB process with the extension loaded. The base license covers up to 5 concurrent instances across your infrastructure.</p>

<h4>Instance Counting</h4>
<p>Instances are counted based on unique license key activations within a rolling 24-hour window. Development and testing environments do not count against your instance limit when using the provided development key.</p>

<h4>Academic & Research Discounts</h4>
<p>We offer significant discounts for educational and research institutions:</p>
<ul>
  <li><strong>Universities & Colleges:</strong> 75% discount on all plans for accredited educational institutions.</li>
  <li><strong>Research Institutions:</strong> 50% discount for non-profit research organizations.</li>
  <li><strong>Students:</strong> Free access for individual students with a valid .edu email address (limited to 1 instance).</li>
</ul>
<p>To apply for academic pricing, <a href="/company/contact">contact us</a> with proof of institutional affiliation.</p>

<h4>Trial Period</h4>
<p>Your 15-day free trial includes full access to all features with up to 2 concurrent instances. No credit card is required to start. At the end of the trial, you can purchase a subscription or the extension will revert to evaluation mode.</p>

<h4>Refund Policy</h4>
<p>We offer a 30-day money-back guarantee for all paid subscriptions. If you're not satisfied, contact support for a full refund.</p>

<h4>Support</h4>
<p>All paid plans include email and chat support with response times within 24 hours on business days. For mission-critical deployments, ask about our premium support options.</p>
  `
};

const cryptoExtension: ExtensionData = {
  metadata,
  technicalOverview,
  functions,
  pragmas,
  secrets,
  macros,
  filesystems,
  storageExtensions,
  logTypes,
  logStorageTypes,
  pricing
};

export default cryptoExtension;
