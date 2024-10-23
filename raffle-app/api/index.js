const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware for parsing JSON - Ensure this is present
app.use(express.json());

// Serve static files from the /public directory
app.use(express.static(path.join(__dirname, '../public')));

// Fetch all raffle numbers from Supabase
app.get('/api/numbers', async (req, res) => {
  const { data, error } = await supabase
    .from('numbers')
    .select('*');

  if (error) {
    return res.status(500).json({ error: error.message });
  }
  res.json({ numbers: data });
});

// Reserve multiple numbers and store user info in Supabase
app.post('/api/reserve-numbers', async (req, res) => {
  const { numbers, name, email, phone } = req.body;
  const reservationExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

  if (!numbers || !name || !email || !phone) {
    return res.status(400).json({ message: 'Missing required information.' });
  }

  const updates = numbers.map((number) => ({
    number,
    status: 'reserved',
    name,
    email,
    phone,
    reservation_date: new Date(),
    reservation_expiry: reservationExpiry,
  }));

  const { data, error } = await supabase
    .from('numbers')
    .upsert(updates, { onConflict: ['number'] });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  io.emit('numberReserved');
  res.json({ message: `Numbers ${numbers.join(', ')} reserved successfully!` });
});

// Confirm payment and update status to 'sold' in Supabase
app.post('/api/confirm-payment', async (req, res) => {
  const { numbers } = req.body;

  if (!numbers || numbers.length === 0) {
    return res.status(400).json({ message: 'No numbers selected for payment confirmation.' });
  }

  const updates = numbers.map((number) => ({
    number,
    status: 'sold',
  }));

  const { data, error } = await supabase
    .from('numbers')
    .upsert(updates, { onConflict: ['number'] });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  io.emit('refreshNumbers');
  res.json({ message: `Payment confirmed for numbers: ${numbers.join(', ')}!` });
});

// Function to update expired reservations automatically in Supabase
async function checkExpiredReservations() {
  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('numbers')
    .update({
      status: 'available',
      name: null,
      email: null,
      phone: null,
      reservation_date: null,
      reservation_expiry: null,
    })
    .eq('status', 'reserved')
    .lt('reservation_expiry', now);

  if (error) {
    console.error('Error updating expired reservations:', error);
  } else if (data.length > 0) {
    console.log(`Expired reservations updated: ${data.length} rows.`);
    io.emit('refreshNumbers');
  }
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
