const { Pool } = require('pg');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

class DatabaseConnection {
  constructor() {
    this.pool = null;
    this.sqlite = null;
    this.isInitialized = false;
  }

  async init() {
    if (this.isInitialized) return;

    try {
      if (process.env.NODE_ENV === 'production' && process.env.DATABASE_URL) {
        // PostgreSQL for production (Neon Database)
        this.pool = new Pool({
          connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_2Dmr5qUxgXvs@ep-morning-bird-a1yzdh8f-pooler.ap-southeast-1.aws.neon.tech/Janashakthi_DB?sslmode=require&channel_binding=require',
          ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        });
        
        // Test connection
        const client = await this.pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        
        console.log('Connected to PostgreSQL');
      } else {
        // SQLite for development
        this.sqlite = await open({
          filename: './data/dashboard.db',
          driver: sqlite3.Database
        });
        
        await this.initializeSchema();
        console.log('Connected to SQLite');
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Database connection failed:', error);
      throw error;
    }
  }

  async query(text, params = []) {
    if (!this.isInitialized) {
      await this.init();
    }

    try {
      if (this.pool) {
        // PostgreSQL for production
        const result = await this.pool.query(text, params);
        return result;
      } else if (this.sqlite) {
        // SQLite for development - Fixed version
        if (text.toUpperCase().trim().startsWith('SELECT')) {
          const rows = await this.sqlite.all(text, params);
          return { rows: rows };
        } else {
          const result = await this.sqlite.run(text, params);
          return { 
            rows: [{ 
              id: result.lastID, 
              changes: result.changes 
            }] 
          };
        }
      } else {
        throw new Error('No database connection available');
      }
    } catch (error) {
      console.error('Database query failed:', error);
      console.error('Query:', text);
      console.error('Params:', params);
      throw error;
    }
  }

  async initializeSchema() {
    const schemas = [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME
      )`,
      
      `CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        short_name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS periods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month TEXT NOT NULL,
        year INTEGER NOT NULL,
        period_key TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS kpis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT,
        period_id INTEGER,
        name TEXT NOT NULL,
        actual_value REAL,
        budget_value REAL,
        unit TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entity_id) REFERENCES entities(id),
        FOREIGN KEY (period_id) REFERENCES periods(id),
        UNIQUE(entity_id, period_id, name)
      )`,
      
      `CREATE TABLE IF NOT EXISTS chart_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entity_id TEXT,
        period_id INTEGER,
        chart_type TEXT NOT NULL,
        data_key TEXT NOT NULL,
        data_value TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (entity_id) REFERENCES entities(id),
        FOREIGN KEY (period_id) REFERENCES periods(id),
        UNIQUE(entity_id, period_id, chart_type, data_key)
      )`,

      `CREATE TABLE IF NOT EXISTS upload_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        entity_id TEXT,
        period_id INTEGER,
        filename TEXT,
        status TEXT,
        error_message TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (entity_id) REFERENCES entities(id),
        FOREIGN KEY (period_id) REFERENCES periods(id)
      )`
    ];

    for (const schema of schemas) {
      await this.sqlite.exec(schema);
    }

    // Insert default entities
    const entities = [
      ['janashakthi-limited', 'Janashakthi Limited', 'JXG', 'Parent Entity'],
      ['janashakthi-insurance', 'Janashakthi Insurance PLC', 'JINS', 'Life Insurance'],
      ['first-capital', 'First Capital Holdings PLC', 'FCH', 'Investment Banking'],
      ['janashakthi-finance', 'Janashakthi Finance PLC', 'JF', 'Non-Financial Banking']
    ];

    for (const [id, name, shortName, description] of entities) {
      await this.sqlite.run(
        'INSERT OR IGNORE INTO entities (id, name, short_name, description) VALUES (?, ?, ?, ?)',
        [id, name, shortName, description]
      );
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
    if (this.sqlite) {
      await this.sqlite.close();
    }
    this.isInitialized = false;
  }
}

module.exports = new DatabaseConnection();