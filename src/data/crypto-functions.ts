// Extension metadata
export const extensionMetadata = {
  name: 'crypto',
  displayName: 'Crypto Functions',
  icon: '🔐',
  description: 'Comprehensive cryptographic functions for secure data handling including hashing, encryption, and digital signatures.',
  githubUrl: 'https://github.com/queryfarm/duckdb-crypto',
  cta: {
    title: 'Ready to Secure Your Data?',
    description: 'Install the Crypto extension today and start using enterprise-grade cryptography in DuckDB.'
  }
};

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

export interface FunctionExample {
  description: string;
  code: string;
  output?: string;
  outputTable?: {
    columns: { name: string; align?: 'left' | 'right' | 'center' }[];
    rows: (string | number | boolean)[][];
  };
}

export interface FunctionDocData {
  id: string;
  name: string;
  type: 'scalar' | 'table' | 'aggregate';
  category: string; // e.g., "Hashing", "Password", "Key Generation"
  returnType?: string; // e.g., "VARCHAR", "BOOLEAN", "INTEGER" - for scalar/aggregate functions
  parameters: FunctionParameter[];
  returns?: string; // Human-readable description of return value
  returnsTable?: ReturnColumn[]; // For table functions
  description: string;
  examples: FunctionExample[];
  parametersTitle?: string;
  relatedFunctions?: string[]; // Array of function IDs to look up
  tags?: string[]; // Descriptive tags for search and categorization
}

// Example function data
export const cryptoFunctions: FunctionDocData[] = [
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
  }
];
