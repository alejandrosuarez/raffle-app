const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware for parsing JSON - Ensure this is present
app.use(express.json());

// Serve static files from the /public directory
app.use(express.static(path.join(__dirname, '../public')));

// SQLite Database Connection
const db = new sqlite3.Database('./raffle.db');

// Fetch all raffle numbers
app.get('/api/numbers', (req, res) => {
  db.all("SELECT * FROM Numbers", [], (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ numbers: rows });
  });
});

// Reserve multiple numbers and store user info
app.post('/api/reserve-numbers', (req, res) => {
  // Log the body to debug
  console.log('Received POST body:', req.body);

  const { numbers, name, email, phone } = req.body;
  const reservationExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

  if (!numbers || !name || !email || !phone) {
    return res.status(400).json({ message: 'Missing required information.' });
  }

  const placeholders = numbers.map(() => '?').join(',');
  const query = `UPDATE Numbers SET status = 'reserved', name = ?, email = ?, phone = ?, reservation_date = datetime('now'), reservation_expiry = ? WHERE number IN (${placeholders}) AND status = 'available'`;

  db.run(query, [name, email, phone, reservationExpiry, ...numbers], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    io.emit('numberReserved');
    res.json({ message: `Numbers ${numbers.join(', ')} reserved successfully!` });
  });
});

// Socket.io connection for real-time updates
io.on('connection', (socket) => {
  console.log('New client connected');
  
  db.all("SELECT * FROM Numbers", [], (err, rows) => {
    if (!err) {
      socket.emit('numbersList', rows);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Confirm payment for selected reserved numbers
app.post('/api/confirm-payment', (req, res) => {
  const { numbers } = req.body;

  if (!numbers || numbers.length === 0) {
    return res.status(400).json({ message: 'No numbers selected for payment confirmation.' });
  }

  const placeholders = numbers.map(() => '?').join(',');
  const query = `UPDATE Numbers SET status = 'sold' WHERE number IN (${placeholders}) AND status = 'reserved'`;

  db.run(query, [...numbers], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    io.emit('refreshNumbers'); // Emit an event to refresh all numbers
    res.json({ message: `Payment confirmed for numbers: ${numbers.join(', ')}!` });
  });
});

// Function to update expired reservations automatically
function checkExpiredReservations() {
  const now = new Date().toISOString();
  const query = `UPDATE Numbers SET status = 'available', name = NULL, email = NULL, phone = NULL, reservation_date = NULL, reservation_expiry = NULL
                 WHERE status = 'reserved' AND reservation_expiry <= ?`;

  db.run(query, [now], function(err) {
    if (err) {
      console.error('Error updating expired reservations:', err);
    } else if (this.changes > 0) {
      console.log(`Expired reservations updated: ${this.changes} rows.`);
      io.emit('refreshNumbers'); // Emit an event to refresh all numbers on the frontend
    }
  });
}

// Run the expiration check every minute
setInterval(checkExpiredReservations, 60000); // Check every 60 seconds

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Export the server object to be handled by Vercel
module.exports = (req, res) => {
  server.emit('request', req, res);
};
