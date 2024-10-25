const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const app = express();
const server = http.createServer(app);

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

app.get('/admin', (req, res) => {
  const htmlFilePath = path.join(__dirname, '../public/admin.html');
  fs.readFile(htmlFilePath, 'utf-8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading admin.html');
    }
    // Ensure the environment variables are replaced properly
    const updatedHtml = data
      .replace(/\{\{SUPABASE_URL\}\}/g, supabaseUrl)
      .replace(/\{\{SUPABASE_ANON_KEY\}\}/g, supabaseAnonKey);
    
    res.send(updatedHtml);
  });
});

app.get('/', (req, res) => {
  const htmlFilePath = path.join(__dirname, '../public/index.html');
  
  fs.readFile(htmlFilePath, 'utf-8', (err, data) => {
    if (err) {
      return res.status(500).send('Error reading index.html');
    }

    // Replace the placeholders with actual environment variable values
    const updatedHtml = data
      .replace(/\{\{SUPABASE_URL\}\}/g, supabaseUrl)
      .replace(/\{\{SUPABASE_ANON_KEY\}\}/g, supabaseAnonKey);

    res.send(updatedHtml);
  });
});

// Endpoint to populate the numbers table
app.get('/api/populate', async (req, res) => {
  const numbers = Array.from({ length: 100 }, (_, i) => ({
    number: i + 1,
    status: 'available'
  }));

  const { data, error } = await supabase
    .from('numbers')
    .insert(numbers);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json({ message: 'Database populated successfully!', data });
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

// Debug logging: Output server information and environment variables
// Remove or comment out this block before deploying to production
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log('Supabase URL:', supabaseUrl);
  console.log('Supabase Anon Key:', supabaseAnonKey);
});
