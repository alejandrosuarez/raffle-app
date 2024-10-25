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
  console.log('Fetching raffle numbers from database...');
  
  const { data, error } = await supabase
    .from('numbers')
    .select('*');

  if (error) {
    console.error('Error fetching numbers:', error);
    return res.status(500).json({ error: error.message });
  }

  console.log('Raffle numbers fetched successfully.');
  res.json({ numbers: data });
});

// Serve the admin HTML page with environment variable injection
app.get('/admin', (req, res) => {
  const htmlFilePath = path.join(__dirname, '../public/admin.html');
  fs.readFile(htmlFilePath, 'utf-8', (err, data) => {
    if (err) {
      console.error('Error reading admin.html:', err);
      return res.status(500).send('Error reading admin.html');
    }

    // Inject environment variables into the HTML file
    const updatedHtml = data
      .replace(/\{\{SUPABASE_URL\}\}/g, supabaseUrl)
      .replace(/\{\{SUPABASE_ANON_KEY\}\}/g, supabaseAnonKey);
    
    res.send(updatedHtml);
  });
});

// Serve the index.html page with environment variable injection
app.get('/', (req, res) => {
  const htmlFilePath = path.join(__dirname, '../public/index.html');
  
  fs.readFile(htmlFilePath, 'utf-8', (err, data) => {
    if (err) {
      console.error('Error reading index.html:', err);
      return res.status(500).send('Error reading index.html');
    }

    // Inject environment variables into the HTML file
    const updatedHtml = data
      .replace(/\{\{SUPABASE_URL\}\}/g, supabaseUrl)
      .replace(/\{\{SUPABASE_ANON_KEY\}\}/g, supabaseAnonKey);

    res.send(updatedHtml);
  });
});

// Endpoint to populate the numbers table
app.get('/api/populate', async (req, res) => {
  console.log('Populating numbers table with 100 entries...');

  const numbers = Array.from({ length: 100 }, (_, i) => ({
    number: i + 1,
    status: 'available'
  }));

  const { data, error } = await supabase
    .from('numbers')
    .insert(numbers);

  if (error) {
    console.error('Error populating numbers table:', error);
    return res.status(500).json({ error: error.message });
  }

  console.log('Numbers table populated successfully.');
  res.json({ message: 'Database populated successfully!', data });
});

// Reserve multiple numbers and store user info in Supabase
app.post('/api/reserve-numbers', async (req, res) => {
  console.log('Reserving numbers...');
  
  const { numbers, name, email, phone } = req.body;
  const reservationExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

  if (!numbers || !name || !email || !phone) {
    console.error('Missing required information.');
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
    console.error('Error reserving numbers:', error);
    return res.status(500).json({ error: error.message });
  }

  console.log(`Numbers reserved: ${numbers.join(', ')}`);
  res.json({ message: `Numbers ${numbers.join(', ')} reserved successfully!` });
});

// Confirm payment and update status to 'sold' in Supabase
app.post('/api/confirm-payment', async (req, res) => {
  console.log('Confirming payment for numbers...');
  
  const { numbers } = req.body;

  if (!numbers || numbers.length === 0) {
    console.error('No numbers selected for payment confirmation.');
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
    console.error('Error confirming payment:', error);
    return res.status(500).json({ error: error.message });
  }

  console.log(`Payment confirmed for numbers: ${numbers.join(', ')}`);
  res.json({ message: `Payment confirmed for numbers: ${numbers.join(', ')}!` });
});

// Function to update expired reservations automatically in Supabase
async function checkExpiredReservations() {
  console.log('Checking for expired reservations...');
  
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
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log('Supabase URL:', supabaseUrl);
  console.log('Supabase Anon Key:', supabaseAnonKey);
});