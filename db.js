const { sql } = require('@vercel/postgres');
const bcrypt = require('bcryptjs');

// Initialize schema and seed data
async function initDB() {
  // Create tables
  await sql`
    CREATE TABLE IF NOT EXISTS cars (
      id        SERIAL PRIMARY KEY,
      name      TEXT NOT NULL,
      year      INTEGER NOT NULL,
      power     TEXT NOT NULL,
      fuel      TEXT NOT NULL,
      gearbox   TEXT NOT NULL,
      seats     INTEGER DEFAULT 5,
      body_type TEXT NOT NULL,
      engine    TEXT,
      drive     TEXT DEFAULT 'FWD',
      consumption TEXT,
      description TEXT,
      active    INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS car_prices (
      id      SERIAL PRIMARY KEY,
      car_id  INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
      period  TEXT NOT NULL,
      price   INTEGER NOT NULL
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS car_images (
      id        SERIAL PRIMARY KEY,
      car_id    INTEGER NOT NULL REFERENCES cars(id) ON DELETE CASCADE,
      filename  TEXT NOT NULL,
      url       TEXT NOT NULL DEFAULT '',
      is_main   INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS admins (
      id       SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )
  `;

  // Seed admin if not exists
  const { rows: admins } = await sql`SELECT id FROM admins WHERE username = 'admin'`;
  if (admins.length === 0) {
    const hash = bcrypt.hashSync('admin1234', 10);
    await sql`INSERT INTO admins (username, password) VALUES ('admin', ${hash})`;
    console.log('✓ Admin creat: user=admin, parola=admin1234');
  }

  // Seed demo cars if empty
  const { rows: cars } = await sql`SELECT COUNT(*) as n FROM cars`;
  if (parseInt(cars[0].n) === 0) {
    const seedCars = [
      { name: 'VW Golf 7 GTE', year: 2015, power: '204 CP', fuel: 'Plug-in Hybrid', gearbox: 'Automata DSG', seats: 5, body_type: 'Hatchback', engine: '1.4 TSI + Electric', drive: 'FWD', consumption: '5–6 L/100km', description: 'Combinatia perfecta intre sport si economie — 204 CP, consum 5–6 L/100km. Ideal pentru oras si drumuri lungi, fara grija costurilor.', sort_order: 1 },
      { name: 'VW Jetta', year: 2019, power: '150 CP', fuel: 'Benzina', gearbox: 'Automata', seats: 5, body_type: 'Sedan', engine: '1.4 TSI', drive: 'FWD', consumption: '6–7 L/100km', description: 'O limuzina eleganta si confortabila, perfecta pentru calatorii de afaceri sau in familie. Automata, spatiosa, fiabila.', sort_order: 2 },
      { name: 'Ford Fusion', year: 2017, power: '188 CP', fuel: 'Hybrid', gearbox: 'Automata', seats: 5, body_type: 'Sedan', engine: '2.0 Hybrid', drive: 'FWD', consumption: '4.5–5.5 L/100km', description: 'Spatiu, confort si eficienta. O optiune excelenta pentru familii sau drumuri lungi, cu un consum surprinzator de mic.', sort_order: 3 },
      { name: 'Toyota RAV4', year: 2015, power: '150 CP', fuel: 'Diesel', gearbox: 'Automata', seats: 5, body_type: 'SUV', engine: '2.2 D-4D', drive: 'AWD 4x4', consumption: '7–8 L/100km', description: 'SUV robust, spatios si fiabil. Ideal pentru toate tipurile de drumuri, inclusiv teren usor.', sort_order: 4 },
      { name: 'Lexus CT', year: 2018, power: '136 CP', fuel: 'Hybrid', gearbox: 'CVT', seats: 5, body_type: 'Hatchback', engine: '1.8 Hybrid', drive: 'FWD', consumption: '4.5–5 L/100km', description: 'Lux japonez la un pret accesibil. Elegant, silentios si extrem de economic.', sort_order: 5 },
      { name: 'Skoda Rapid', year: 2016, power: '90 CP', fuel: 'Diesel', gearbox: 'Manuala 5+1', seats: 5, body_type: 'Hatchback', engine: '1.4 TDI', drive: 'FWD', consumption: '4–5 L/100km', description: 'Cel mai economic automobil din flota. Pret mic, consum redus, fiabilitate germana.', sort_order: 6 },
    ];

    const defaultPrices = [
      { period: '1–2 zile', price: 50 },
      { period: '3–5 zile', price: 45 },
      { period: '6–10 zile', price: 40 },
      { period: '11–20 zile', price: 35 },
      { period: '21+ zile', price: 30 },
    ];

    for (const car of seedCars) {
      const { rows } = await sql`
        INSERT INTO cars (name, year, power, fuel, gearbox, seats, body_type, engine, drive, consumption, description, sort_order)
        VALUES (${car.name}, ${car.year}, ${car.power}, ${car.fuel}, ${car.gearbox}, ${car.seats}, ${car.body_type}, ${car.engine}, ${car.drive}, ${car.consumption}, ${car.description}, ${car.sort_order})
        RETURNING id
      `;
      const carId = rows[0].id;
      const prices = car.name === 'Ford Fusion'
        ? [{ period: '1–2 zile', price: 45 }, { period: '3–5 zile', price: 40 }, { period: '6–10 zile', price: 35 }, { period: '11–20 zile', price: 30 }, { period: '21+ zile', price: 25 }]
        : car.name === 'Skoda Rapid'
        ? [{ period: '1–2 zile', price: 40 }, { period: '3–5 zile', price: 35 }, { period: '6–10 zile', price: 30 }, { period: '11–20 zile', price: 25 }, { period: '21+ zile', price: 20 }]
        : defaultPrices;
      for (const p of prices) {
        await sql`INSERT INTO car_prices (car_id, period, price) VALUES (${carId}, ${p.period}, ${p.price})`;
      }
    }
    console.log('✓ Mașini demo adăugate');
  }
}

module.exports = { sql, initDB };
