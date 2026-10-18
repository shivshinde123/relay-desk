require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'support_desk',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: 'Z', // JS Dates are read/written as UTC
});

// Make every pooled connection use UTC so NOW() matches JS Dates.
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

module.exports = pool;
