const sql = require('mssql');

let poolPromise = null;

function getPool() {
  if (!poolPromise) {
    const cfg = {
      server: process.env.DB_SERVER,
      database: process.env.DB_DATABASE,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      options: { encrypt: true, trustServerCertificate: false },
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
      requestTimeout: 60000,
    };
    poolPromise = new sql.ConnectionPool(cfg).connect().catch((err) => {
      poolPromise = null;
      throw err;
    });
  }
  return poolPromise;
}

async function query(text, params = {}) {
  const pool = await getPool();
  const req = pool.request();
  for (const [k, v] of Object.entries(params)) req.input(k, v);
  const r = await req.query(text);
  return r.recordset;
}

module.exports = { sql, getPool, query };
