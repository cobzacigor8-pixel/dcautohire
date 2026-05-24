const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const { put, del } = require('@vercel/blob');
const { sql, initDB } = require('../db');

const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'dcautohire-jwt-secret-2024';

// ── INIT DB (runs on cold start) ──────────────────────
let dbReady = false;
async function ensureDB() {
  if (!dbReady) {
    await initDB();
    dbReady = true;
  }
}

// ── MIDDLEWARE ────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from public/ and admin/
app.use(express.static(path.join(__dirname, '../public')));

// ── MULTER (memory storage, no disk) ─────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Doar imagini sunt acceptate'));
  }
});

// ── JWT AUTH MIDDLEWARE ───────────────────────────────
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Neautorizat' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    req.adminId = payload.id;
    req.adminUsername = payload.username;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalid' });
  }
}

// ── HELPER: get car with images & prices ─────────────
async function getCarFull(id) {
  const { rows: cars } = await sql`SELECT * FROM cars WHERE id = ${id}`;
  if (!cars.length) return null;
  const car = cars[0];
  const { rows: images } = await sql`SELECT * FROM car_images WHERE car_id = ${id} ORDER BY is_main DESC, sort_order ASC`;
  const { rows: prices } = await sql`SELECT * FROM car_prices WHERE car_id = ${id} ORDER BY id ASC`;
  car.images = images;
  car.prices = prices;
  return car;
}

// ── DB INIT MIDDLEWARE ────────────────────────────────
app.use(async (req, res, next) => {
  try {
    await ensureDB();
    next();
  } catch (err) {
    console.error('DB init error:', err);
    res.status(500).json({ error: 'Database initialization failed' });
  }
});

// ════════════════════════════════════════════════════════
// PUBLIC API
// ════════════════════════════════════════════════════════

app.get('/api/cars', async (req, res) => {
  try {
    const { rows: cars } = await sql`SELECT * FROM cars WHERE active = 1 ORDER BY sort_order ASC, id ASC`;
    for (const car of cars) {
      const { rows: images } = await sql`SELECT * FROM car_images WHERE car_id = ${car.id} ORDER BY is_main DESC, sort_order ASC`;
      const { rows: prices } = await sql`SELECT * FROM car_prices WHERE car_id = ${car.id} ORDER BY id ASC`;
      car.images = images;
      car.prices = prices;
    }
    res.json(cars);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/cars/:id', async (req, res) => {
  try {
    const car = await getCarFull(req.params.id);
    if (!car || !car.active) return res.status(404).json({ error: 'Mașina nu există' });
    res.json(car);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════
// ADMIN AUTH (JWT instead of sessions)
// ════════════════════════════════════════════════════════

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const { rows } = await sql`SELECT * FROM admins WHERE username = ${username}`;
    const admin = rows[0];
    if (!admin || !bcrypt.compareSync(password, admin.password)) {
      return res.status(401).json({ error: 'Date incorecte' });
    }
    const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '8h' });
    res.json({ ok: true, username: admin.username, token });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/logout', (req, res) => {
  // With JWT, logout is handled client-side by deleting the token
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  res.json({ id: req.adminId, username: req.adminUsername });
});

app.post('/api/admin/change-password', requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Parola trebuie să aibă minim 6 caractere' });
    }
    const { rows } = await sql`SELECT * FROM admins WHERE id = ${req.adminId}`;
    const admin = rows[0];
    if (!bcrypt.compareSync(currentPassword, admin.password)) {
      return res.status(401).json({ error: 'Parola curentă incorectă' });
    }
    const hash = bcrypt.hashSync(newPassword, 10);
    await sql`UPDATE admins SET password = ${hash} WHERE id = ${req.adminId}`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════
// ADMIN — MAȘINI
// ════════════════════════════════════════════════════════

app.get('/api/admin/cars', requireAdmin, async (req, res) => {
  try {
    const { rows: cars } = await sql`SELECT * FROM cars ORDER BY sort_order ASC, id ASC`;
    for (const car of cars) {
      const { rows: images } = await sql`SELECT * FROM car_images WHERE car_id = ${car.id} ORDER BY is_main DESC, sort_order ASC`;
      const { rows: prices } = await sql`SELECT * FROM car_prices WHERE car_id = ${car.id} ORDER BY id ASC`;
      car.images = images;
      car.prices = prices;
    }
    res.json(cars);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/cars/:id', requireAdmin, async (req, res) => {
  try {
    const car = await getCarFull(req.params.id);
    if (!car) return res.status(404).json({ error: 'Nu există' });
    res.json(car);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/admin/cars', requireAdmin, async (req, res) => {
  try {
    const { name, year, power, fuel, gearbox, seats, body_type, engine, drive, consumption, description, active, prices } = req.body;
    if (!name || !year || !power || !fuel || !gearbox || !body_type) {
      return res.status(400).json({ error: 'Câmpuri obligatorii lipsesc' });
    }
    const { rows: maxRows } = await sql`SELECT MAX(sort_order) as m FROM cars`;
    const maxOrder = maxRows[0].m || 0;
    const { rows } = await sql`
      INSERT INTO cars (name, year, power, fuel, gearbox, seats, body_type, engine, drive, consumption, description, active, sort_order)
      VALUES (${name}, ${year}, ${power}, ${fuel}, ${gearbox}, ${seats || 5}, ${body_type}, ${engine || ''}, ${drive || 'FWD'}, ${consumption || ''}, ${description || ''}, ${active ? 1 : 0}, ${maxOrder + 1})
      RETURNING id
    `;
    const carId = rows[0].id;
    if (Array.isArray(prices) && prices.length > 0) {
      for (const p of prices) {
        if (p.period && p.price) {
          await sql`INSERT INTO car_prices (car_id, period, price) VALUES (${carId}, ${p.period}, ${parseInt(p.price)})`;
        }
      }
    }
    res.json(await getCarFull(carId));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/admin/cars/:id', requireAdmin, async (req, res) => {
  try {
    const { name, year, power, fuel, gearbox, seats, body_type, engine, drive, consumption, description, active, prices } = req.body;
    const id = req.params.id;
    const { rows } = await sql`SELECT id FROM cars WHERE id = ${id}`;
    if (!rows.length) return res.status(404).json({ error: 'Nu există' });

    await sql`
      UPDATE cars SET name=${name}, year=${year}, power=${power}, fuel=${fuel}, gearbox=${gearbox},
        seats=${seats || 5}, body_type=${body_type}, engine=${engine || ''}, drive=${drive || 'FWD'},
        consumption=${consumption || ''}, description=${description || ''}, active=${active ? 1 : 0}
      WHERE id = ${id}
    `;
    if (Array.isArray(prices)) {
      await sql`DELETE FROM car_prices WHERE car_id = ${id}`;
      for (const p of prices) {
        if (p.period && p.price) {
          await sql`INSERT INTO car_prices (car_id, period, price) VALUES (${id}, ${p.period}, ${parseInt(p.price)})`;
        }
      }
    }
    res.json(await getCarFull(id));
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/cars/:id', requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { rows: images } = await sql`SELECT url FROM car_images WHERE car_id = ${id}`;
    // Delete images from Vercel Blob
    for (const img of images) {
      if (img.url) {
        try { await del(img.url); } catch {}
      }
    }
    await sql`DELETE FROM cars WHERE id = ${id}`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/admin/cars/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const { rows } = await sql`SELECT id, active FROM cars WHERE id = ${req.params.id}`;
    if (!rows.length) return res.status(404).json({ error: 'Nu există' });
    const car = rows[0];
    const newActive = car.active ? 0 : 1;
    await sql`UPDATE cars SET active = ${newActive} WHERE id = ${car.id}`;
    res.json({ ok: true, active: !!newActive });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/admin/cars/reorder', requireAdmin, async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid' });
    for (let idx = 0; idx < order.length; idx++) {
      await sql`UPDATE cars SET sort_order = ${idx + 1} WHERE id = ${order[idx]}`;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ════════════════════════════════════════════════════════
// ADMIN — IMAGINI (Vercel Blob)
// ════════════════════════════════════════════════════════

app.post('/api/admin/cars/:id/images', requireAdmin, upload.array('images', 20), async (req, res) => {
  try {
    const carId = req.params.id;
    const { rows: carRows } = await sql`SELECT id FROM cars WHERE id = ${carId}`;
    if (!carRows.length) return res.status(404).json({ error: 'Mașina nu există' });
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Nicio imagine selectată' });

    const { rows: countRows } = await sql`SELECT COUNT(*) as n FROM car_images WHERE car_id = ${carId}`;
    const existingCount = parseInt(countRows[0].n);
    const inserted = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const filename = `car_${carId}_${Date.now()}_${i}.jpg`;
      const thumbFilename = `thumb_${filename}`;

      // Process main image
      const mainBuffer = await sharp(file.buffer)
        .resize(1200, 800, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 })
        .toBuffer();

      // Process thumbnail
      const thumbBuffer = await sharp(file.buffer)
        .resize(400, 267, { fit: 'cover' })
        .jpeg({ quality: 75 })
        .toBuffer();

      // Upload both to Vercel Blob
      const mainBlob = await put(filename, mainBuffer, { access: 'public', contentType: 'image/jpeg' });
      const thumbBlob = await put(thumbFilename, thumbBuffer, { access: 'public', contentType: 'image/jpeg' });

      const isMain = existingCount === 0 && i === 0 ? 1 : 0;
      const { rows } = await sql`
        INSERT INTO car_images (car_id, filename, url, is_main, sort_order)
        VALUES (${carId}, ${filename}, ${mainBlob.url}, ${isMain}, ${existingCount + i})
        RETURNING id
      `;
      // Store thumb URL in filename field with a convention, or add a thumb_url column
      await sql`UPDATE car_images SET filename = ${JSON.stringify({ filename, url: mainBlob.url, thumb_url: thumbBlob.url })} WHERE id = ${rows[0].id}`;

      inserted.push({
        id: rows[0].id,
        filename,
        url: mainBlob.url,
        thumb_url: thumbBlob.url,
        is_main: isMain
      });
    }
    res.json(inserted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

app.delete('/api/admin/images/:imageId', requireAdmin, async (req, res) => {
  try {
    const { rows } = await sql`SELECT * FROM car_images WHERE id = ${req.params.imageId}`;
    if (!rows.length) return res.status(404).json({ error: 'Nu există' });
    const img = rows[0];

    // Delete from Vercel Blob
    try {
      const data = JSON.parse(img.filename);
      if (data.url) await del(data.url);
      if (data.thumb_url) await del(data.thumb_url);
    } catch {}

    await sql`DELETE FROM car_images WHERE id = ${img.id}`;

    if (img.is_main) {
      const { rows: next } = await sql`SELECT id FROM car_images WHERE car_id = ${img.car_id} ORDER BY sort_order ASC LIMIT 1`;
      if (next.length) await sql`UPDATE car_images SET is_main = 1 WHERE id = ${next[0].id}`;
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/admin/images/:imageId/main', requireAdmin, async (req, res) => {
  try {
    const { rows } = await sql`SELECT * FROM car_images WHERE id = ${req.params.imageId}`;
    if (!rows.length) return res.status(404).json({ error: 'Nu există' });
    const img = rows[0];
    await sql`UPDATE car_images SET is_main = 0 WHERE car_id = ${img.car_id}`;
    await sql`UPDATE car_images SET is_main = 1 WHERE id = ${img.id}`;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ── SERVE ADMIN PANEL ─────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../admin/index.html'));
});

// ── FALLBACK: serve public index ──────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

module.exports = app;
