const sqlite3 = require('sqlite3').verbose();

// Open SQLite database connection
const db = new sqlite3.Database('./raffle.db');

// Create Numbers table if it doesn't exist
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS Numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number INTEGER NOT NULL,
      status TEXT CHECK(status IN ('available', 'reserved', 'sold')) DEFAULT 'available',
      name TEXT,
      email TEXT,
      phone TEXT,
      reservation_date DATETIME
    );
  `);

  // Insert numbers 1 to 100 into the Numbers table
  const stmt = db.prepare("INSERT INTO Numbers (number) VALUES (?)");
  for (let i = 1; i <= 100; i++) {
    stmt.run(i);
  }
  stmt.finalize();

  console.log('Inserted numbers 1 to 100 into the Numbers table.');
});

// Close the database connection
db.close();
