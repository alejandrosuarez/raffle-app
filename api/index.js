const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const http = require('http');
const fs = require('fs');
require('dotenv').config();

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

app.use(express.json());
app.use(express.static('../public'));

// Subscribe for real-time updates for the admin
app.get('/api/admin/subscribe', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Ping every 15 seconds to keep the connection alive
  const interval = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  const updateEvent = async () => {
    // Emit an update event for the admin client to refresh data
    res.write(`data: ${JSON.stringify({ update: 'refresh' })}\n\n`);
  };

  // Watch for changes in the numbers table in Supabase (replace with a function if using Supabase triggers)
  supabase
    .channel('realtime:numbers')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'numbers' }, updateEvent)
    .subscribe();

  // Close the connection when the client disconnects
  req.on('close', () => {
    clearInterval(interval);
    console.log('Admin subscribe client disconnected');
  });
});

// Fetch all numbers for display
app.get('/api/numbers', async (req, res) => {
  const { data, error } = await supabase.from('numbers').select('*').order('number', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ numbers: data });
});

// Reserve numbers (only if available)
app.post('/api/reserve-numbers', async (req, res) => {
  const { numbers, name, email, phone } = req.body;
  const reservationExpiry = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes from now
  
  try {
    const { data: availableNumbers, error: fetchError } = await supabase
      .from('numbers')
      .select('number')
      .eq('status', 'available')
      .in('number', numbers);

    if (fetchError) throw fetchError;
    if (availableNumbers.length !== numbers.length) {
      return res.status(400).json({ error: 'One or more numbers are unavailable.' });
    }

    // Reserve the selected numbers
    const updates = numbers.map(num => ({
      number: num,
      status: 'reserved',
      name,
      email,
      phone,
      reservation_date: new Date().toISOString(),
      reservation_expiry: reservationExpiry,
    }));

    const { error } = await supabase.from('numbers').upsert(updates, { onConflict: ['number'] });
    if (error) throw error;

    res.json({ message: `Reserved numbers: ${numbers.join(', ')}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Confirm payment and mark numbers as sold
app.post('/api/confirm-payment', async (req, res) => {
  const { numbers } = req.body;

  const updates = numbers.map(num => ({ number: num, status: 'sold' }));
  const { error } = await supabase.from('numbers').upsert(updates, { onConflict: ['number'] });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ message: `Payment confirmed for numbers: ${numbers.join(', ')}` });
});

// Admin: Get all numbers for real-time admin view
app.get('/api/admin/numbers', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('numbers')
      .select('*')
      .order('number', { ascending: true });

    if (error) throw error;

    res.json({ numbers: data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear selected numbers and set them back to 'available'
app.post('/api/clear-selection', async (req, res) => {
  const { numbers } = req.body;

  const updates = numbers.map(num => ({
    number: num,
    status: 'available',
    name: null,
    email: null,
    phone: null,
    reservation_date: null,
    reservation_expiry: null,
  }));

  const { error } = await supabase.from('numbers').upsert(updates, { onConflict: ['number'] });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ message: `Cleared numbers: ${numbers.join(', ')}` });
});

// Automated cleanup of expired reservations
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

// Serve the index.html page
app.get('/', (req, res) => {
  const htmlFilePath = path.join(__dirname, '../public/index.html');
  fs.readFile(htmlFilePath, 'utf-8', (err, data) => {
    if (err) {
      console.error('Error reading index.html:', err);
      return res.status(500).send('Error loading index.html');
    }
    res.send(data);
  });
});

// Serve the admin.html page
app.get('/admin', (req, res) => {
  const filePath = path.join(__dirname, '../public/admin.html');
  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      console.error('Error reading admin.html:', err);
      return res.status(500).send('Error loading admin.html');
    }
    res.send(data);
  });
});

// Set a timer to periodically clean up expired reservations
setInterval(checkExpiredReservations, 60000); // Run every minute

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));