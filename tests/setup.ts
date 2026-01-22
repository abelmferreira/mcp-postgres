// Set environment variables BEFORE any imports that use them
process.env.READONLY = 'true';
process.env.SQL_SERVER = 'localhost';
process.env.SQL_DATABASE = 'testdb';
process.env.SQL_USER = 'testuser';
process.env.SQL_PASSWORD = 'testpassword';
process.env.SQL_PORT = '5432';
process.env.SQL_SSL = 'false';
process.env.LOG_LEVEL = 'error';
process.env.QUERY_TIMEOUT = '30000';
process.env.MAX_ROWS = '1000';
process.env.POOL_MIN = '2';
process.env.POOL_MAX = '10';
