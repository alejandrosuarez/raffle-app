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

// Get all numbers
app.get('/api/numbers', async (req, res) => {
  const { data, error } = await supabase.from('numbers').select('*').order('number', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ numbers: data });
});

// Reserve numbers
app.post('/api/reserve-numbers', async (req, res) => {
  const { numbers, name, email, phone } = req.body;
  const updates = numbers.map(num => ({
    number: num,
    status: 'reserved',
    name,
    email,
    phone,
    reservation_date: new Date(),
  }));

  const { error } = await supabase.from('numbers').upsert(updates, { onConflict: ['number'] });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: `Reserved numbers: ${numbers.join(', ')}` });
});

// Confirm payment and mark numbers as sold
app.post('/api/confirm-payment', async (req, res) => {
  const { numbers } = req.body;
  const updates = numbers.map(num => ({ number: num, status: 'sold' }));
  const { error } = await supabase.from('numbers').upsert(updates, { onConflict: ['number'] });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ message: `Payment confirmed for numbers: ${numbers.join(', ')}` });
});

// Endpoint to get all raffle numbers for admin display
app.get('/api/admin/numbers', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('numbers')
      .select('*')
      .order('number', { ascending: true }); // Sorting by number

    if (error) throw error;

    res.json({ numbers: data });
  } catch (error) {
    console.error('Error fetching numbers for admin:', error);
    res.status(500).json({ error: error.message });
  }
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


// Serve the index.html page with environment variable injection
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

setInterval(checkExpiredReservations, 60000); // Run every minute

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));