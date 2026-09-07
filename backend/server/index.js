import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Load .env from the backend directory
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 4000);
const jwtSecret = process.env.JWT_SECRET || 'replace-this-development-secret';
const emailPattern = /^[^\s@]+@gmail\.com$/i;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DATABASE_HOST || 'localhost',
  port: Number(process.env.DATABASE_PORT || 5432),
  database: process.env.DATABASE_NAME || 'Carpool_Campus',
  user: process.env.DATABASE_USER || 'postgres',
  password: process.env.DATABASE_PASSWORD,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false
});

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      full_name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'rider' CHECK (role IN ('rider', 'driver', 'admin')),
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS routes (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      origin VARCHAR(160) NOT NULL, destination VARCHAR(160) NOT NULL, pickup_area VARCHAR(160) NOT NULL,
      origin_lat NUMERIC(9, 6), origin_lng NUMERIC(9, 6), destination_lat NUMERIC(9, 6), destination_lng NUMERIC(9, 6), pickup_lat NUMERIC(9, 6), pickup_lng NUMERIC(9, 6),
      days_of_week TEXT[] NOT NULL DEFAULT '{}', departure_time TIME NOT NULL,
      role VARCHAR(10) NOT NULL CHECK (role IN ('rider', 'driver')),
      distance_km NUMERIC(10, 2), total_cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0), seats_total INTEGER NOT NULL DEFAULT 0 CHECK (seats_total >= 0),
      seats_available INTEGER NOT NULL DEFAULT 0 CHECK (seats_available >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ride_requests (
      id BIGSERIAL PRIMARY KEY, route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
      rider_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (route_id, rider_id)
    );
    CREATE TABLE IF NOT EXISTS trips (
      id BIGSERIAL PRIMARY KEY, route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
      rider_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, trip_date DATE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled')),
      cost_per_rider NUMERIC(10, 2), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS safety_reports (
      id BIGSERIAL PRIMARY KEY, reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      subject VARCHAR(180) NOT NULL, description TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(30) NOT NULL, title VARCHAR(160) NOT NULL, body TEXT NOT NULL,
      read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS trip_messages (
      id BIGSERIAL PRIMARY KEY,
      route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
      sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`ALTER TABLE routes ADD COLUMN IF NOT EXISTS distance_km NUMERIC(10, 2), ADD COLUMN IF NOT EXISTS total_cost NUMERIC(10, 2) NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS seats_total INTEGER NOT NULL DEFAULT 0`);
  await pool.query(`UPDATE routes SET seats_total = seats_available WHERE seats_total = 0 AND seats_available > 0`);
  await pool.query(`ALTER TABLE routes ADD COLUMN IF NOT EXISTS origin_lat NUMERIC(9, 6), ADD COLUMN IF NOT EXISTS origin_lng NUMERIC(9, 6), ADD COLUMN IF NOT EXISTS destination_lat NUMERIC(9, 6), ADD COLUMN IF NOT EXISTS destination_lng NUMERIC(9, 6), ADD COLUMN IF NOT EXISTS pickup_lat NUMERIC(9, 6), ADD COLUMN IF NOT EXISTS pickup_lng NUMERIC(9, 6)`);
  await pool.query(`ALTER TABLE routes
    ADD COLUMN IF NOT EXISTS driver_status VARCHAR(50) DEFAULT 'scheduled',
    ADD COLUMN IF NOT EXISTS driver_status_message TEXT,
    ADD COLUMN IF NOT EXISTS driver_lat NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS driver_lng NUMERIC(9, 6),
    ADD COLUMN IF NOT EXISTS driver_status_updated_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS pickup_area VARCHAR(160), ADD COLUMN IF NOT EXISTS destination VARCHAR(160)`);
  await pool.query(`ALTER TABLE trips ADD COLUMN IF NOT EXISTS pickup_area VARCHAR(160), ADD COLUMN IF NOT EXISTS destination VARCHAR(160)`);
  await pool.query(`
    UPDATE trips t
    SET pickup_area = COALESCE(t.pickup_area, r.pickup_area),
        destination = COALESCE(t.destination, r.destination)
    FROM routes r
    WHERE r.id = t.route_id AND (t.pickup_area IS NULL OR t.destination IS NULL)
  `);
}

function publicUser(user) {
  return { id: user.id, fullName: user.full_name, email: user.email, role: user.role, verified: user.verified };
}

function createToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, jwtSecret, { expiresIn: '7d' });
}

function authUser(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ message: 'Authentication required.' }); return null; }
  try { return jwt.verify(token, jwtSecret); } catch { res.status(401).json({ message: 'Session expired.' }); return null; }
}

function distanceKm(lat1, lng1, lat2, lng2) {
  if ([lat1, lng1, lat2, lng2].some(value => value === null || value === undefined)) return null;
  const radians = value => Number(value) * Math.PI / 180;
  const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findMatches(userId) {
  const riderResult = await pool.query(`SELECT * FROM routes WHERE user_id = $1 AND role = 'rider' ORDER BY created_at DESC LIMIT 1`, [userId]);
  const riderRoute = riderResult.rows[0];
  if (!riderRoute) return [];
  const drivers = await pool.query(`SELECT r.*, u.full_name, u.email, u.verified FROM routes r JOIN users u ON u.id = r.user_id WHERE r.role = 'driver' AND r.user_id <> $1 AND r.seats_available > 0`, [userId]);
  return drivers.rows.map(route => {
    const originDistance = distanceKm(riderRoute.origin_lat, riderRoute.origin_lng, route.origin_lat, route.origin_lng);
    const destinationDistance = distanceKm(riderRoute.destination_lat, riderRoute.destination_lng, route.destination_lat, route.destination_lng);
    const pickupDistance = distanceKm(riderRoute.pickup_lat, riderRoute.pickup_lng, route.pickup_lat, route.pickup_lng);
    const distances = [originDistance, destinationDistance, pickupDistance].filter(Number.isFinite);
    const averageDistance = distances.length ? distances.reduce((sum, value) => sum + value, 0) / distances.length : 0;
    const fit = Math.max(0, Math.min(100, Math.round(100 - averageDistance * 4)));
    return { ...route, fit, match_distance_km: averageDistance ? Number(averageDistance.toFixed(1)) : null, estimated_cost: route.total_cost && route.seats_total ? Math.round(Number(route.total_cost) / route.seats_total) : 0, remaining_seats: route.seats_available };
  }).filter(route => !route.match_distance_km || route.match_distance_km <= 30).sort((a, b) => b.fit - a.fit);
}

app.get('/api/dashboard', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  try {
    const isRider = tokenUser.role === 'rider';
    const isDriver = tokenUser.role === 'driver';

    const [routes, requests, trips, driverTrips, reports, notifications, members, myRoutes] = await Promise.all([
      isRider
        ? findMatches(tokenUser.sub)
        : pool.query(`SELECT r.*, u.full_name, u.email, u.verified FROM routes r JOIN users u ON u.id = r.user_id WHERE r.role = 'driver' ORDER BY r.created_at DESC`).then(result => result.rows),

      isRider
        ? pool.query(`
            SELECT rr.*, r.origin, r.destination, r.pickup_area, r.days_of_week, r.departure_time, r.user_id AS driver_id, r.seats_available, r.seats_total, u.full_name AS driver_name, u.email AS driver_email, u.verified AS driver_verified
            FROM ride_requests rr
            JOIN routes r ON r.id = rr.route_id
            JOIN users u ON u.id = r.user_id
            WHERE rr.rider_id = $1
            ORDER BY rr.created_at DESC
          `, [tokenUser.sub])
        : pool.query(`
            SELECT rr.*, r.origin, r.destination, r.pickup_area, r.days_of_week, r.departure_time, r.seats_available, r.seats_total, u.full_name, u.email, u.verified
            FROM ride_requests rr
            JOIN routes r ON r.id = rr.route_id
            JOIN users u ON u.id = rr.rider_id
            WHERE r.user_id = $1
            ORDER BY rr.created_at DESC
          `, [tokenUser.sub]),

      isRider
        ? pool.query(`
            SELECT t.*,
                   r.origin, r.destination, r.pickup_area AS route_pickup_area,
                   COALESCE(t.pickup_area, r.pickup_area) AS pickup_area,
                   COALESCE(t.destination, r.destination) AS rider_destination,
                   r.days_of_week, r.departure_time,
                   r.seats_available, r.seats_total, r.total_cost, r.distance_km,
                   r.driver_status, r.driver_status_message, r.driver_lat, r.driver_lng, r.driver_status_updated_at,
                   r.pickup_lat, r.pickup_lng, r.origin_lat, r.origin_lng,
                   u.full_name AS driver_name, u.email AS driver_email, u.verified AS driver_verified,
                   COALESCE(
                     (
                       SELECT json_agg(
                         json_build_object(
                           'rider_id', cu.id,
                           'rider_name', cu.full_name,
                           'pickup_area', COALESCE(ct.pickup_area, cu_route.pickup_area, r.pickup_area),
                           'destination', COALESCE(ct.destination, cu_route.destination, r.destination)
                         )
                       )
                       FROM trips ct
                       JOIN users cu ON cu.id = ct.rider_id
                       LEFT JOIN LATERAL (
                         SELECT pickup_area, destination FROM routes WHERE user_id = cu.id AND role = 'rider' ORDER BY created_at DESC LIMIT 1
                       ) cu_route ON true
                       WHERE ct.route_id = t.route_id AND ct.status <> 'cancelled'
                     ),
                     '[]'
                   ) AS co_passengers,
                   COALESCE(
                     (
                       SELECT json_agg(
                         json_build_object(
                           'id', tm.id,
                           'sender_id', tm.sender_id,
                           'sender_name', su.full_name,
                           'sender_role', su.role,
                           'message', tm.message,
                           'created_at', tm.created_at
                         ) ORDER BY tm.created_at ASC
                       )
                       FROM trip_messages tm
                       JOIN users su ON su.id = tm.sender_id
                       WHERE tm.route_id = t.route_id
                     ),
                     '[]'
                   ) AS messages
            FROM trips t
            JOIN routes r ON r.id = t.route_id
            JOIN users u ON u.id = r.user_id
            WHERE t.rider_id = $1 AND t.status <> 'cancelled'
            ORDER BY t.created_at DESC
          `, [tokenUser.sub])
        : pool.query(`
            SELECT t.*, r.origin, r.destination, r.pickup_area, r.days_of_week, r.departure_time,
                   r.seats_available, r.seats_total, r.total_cost, r.distance_km,
                   r.driver_status, r.driver_status_message, r.driver_lat, r.driver_lng, r.driver_status_updated_at,
                   u.full_name AS rider_name, u.email AS rider_email
            FROM trips t
            JOIN routes r ON r.id = t.route_id
            JOIN users u ON u.id = t.rider_id
            WHERE r.user_id = $1 AND t.status <> 'cancelled'
            ORDER BY t.created_at DESC
          `, [tokenUser.sub]),

      isDriver
        ? pool.query(`
            SELECT r.*,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'trip_id', t.id,
                      'rider_id', u.id,
                      'rider_name', u.full_name,
                      'rider_email', u.email,
                      'pickup_area', COALESCE(t.pickup_area, u_route.pickup_area, r.pickup_area),
                      'destination', COALESCE(t.destination, u_route.destination, r.destination),
                      'cost_per_rider', t.cost_per_rider,
                      'status', t.status,
                      'created_at', t.created_at
                    )
                  )
                  FROM trips t
                  JOIN users u ON u.id = t.rider_id
                  LEFT JOIN LATERAL (
                    SELECT pickup_area, destination FROM routes WHERE user_id = u.id AND role = 'rider' ORDER BY created_at DESC LIMIT 1
                  ) u_route ON true
                  WHERE t.route_id = r.id AND t.status <> 'cancelled'
                ),
                '[]'
              ) AS approved_riders,
              COALESCE(
                (
                  SELECT json_agg(
                    json_build_object(
                      'id', tm.id,
                      'sender_id', tm.sender_id,
                      'sender_name', su.full_name,
                      'sender_role', su.role,
                      'message', tm.message,
                      'created_at', tm.created_at
                    ) ORDER BY tm.created_at ASC
                  )
                  FROM trip_messages tm
                  JOIN users su ON su.id = tm.sender_id
                  WHERE tm.route_id = r.id
                ),
                '[]'
              ) AS messages
            FROM routes r
            WHERE r.user_id = $1 AND r.role = 'driver'
            ORDER BY r.created_at DESC
          `, [tokenUser.sub])
        : tokenUser.role === 'admin'
          ? pool.query(`
              SELECT 
                r.id, r.origin, r.destination, r.pickup_area, r.departure_time, r.days_of_week,
                r.total_cost, r.distance_km, r.seats_total, r.seats_available,
                u.full_name AS driver_name, u.email AS driver_email,
                COUNT(t.id) FILTER (WHERE t.status IN ('confirmed', 'completed')) AS member_count,
                COALESCE(SUM(t.cost_per_rider) FILTER (WHERE t.status IN ('confirmed', 'completed')), 0) AS total_collected
              FROM routes r
              JOIN users u ON u.id = r.user_id
              LEFT JOIN trips t ON t.route_id = r.id
              WHERE r.role = 'driver'
              GROUP BY r.id, u.full_name, u.email
              ORDER BY r.created_at DESC
            `)
          : Promise.resolve({ rows: [] }),

      pool.query(`SELECT sr.*, u.full_name AS reporter_name FROM safety_reports sr LEFT JOIN users u ON u.id = sr.reporter_id ORDER BY sr.created_at DESC`),
      pool.query(`SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [tokenUser.sub]),
      pool.query(`SELECT id, full_name, email, role, verified, created_at FROM users ORDER BY created_at DESC`),
      pool.query(`SELECT * FROM routes WHERE user_id = $1 ORDER BY created_at DESC`, [tokenUser.sub])
    ]);

    return res.json({
      routes: Array.isArray(routes) ? routes : routes.rows,
      myRoutes: myRoutes.rows,
      requests: requests.rows,
      trips: trips.rows,
      driverTrips: driverTrips.rows,
      reports: reports.rows,
      notifications: notifications.rows,
      members: members.rows
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ message: 'Could not load dashboard data.' });
  }
});

app.post('/api/routes', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  const { origin, destination, pickupArea, originLat, originLng, destinationLat, destinationLng, pickupLat, pickupLng, daysOfWeek = [], departureTime, role, distanceKm = null, totalCost = 0, seatsTotal = 0, seatsAvailable = seatsTotal } = req.body;
  if (!origin || !destination || !pickupArea || !departureTime || !['rider', 'driver'].includes(role)) return res.status(400).json({ message: 'Complete all route fields.' });
  // Convert empty strings to null for numeric fields
  const cleanDistance = distanceKm === '' || distanceKm === undefined ? null : Number(distanceKm);
  const cleanTotalCost = totalCost === '' || totalCost === undefined ? 0 : Number(totalCost);
  const cleanSeatsTotal = seatsTotal === '' || seatsTotal === undefined ? 0 : Number(seatsTotal);
  const cleanSeatsAvailable = seatsAvailable === '' || seatsAvailable === undefined ? cleanSeatsTotal : Number(seatsAvailable);
  const cleanOriginLat = originLat === '' ? null : originLat;
  const cleanOriginLng = originLng === '' ? null : originLng;
  const cleanDestLat = destinationLat === '' ? null : destinationLat;
  const cleanDestLng = destinationLng === '' ? null : destinationLng;
  const cleanPickupLat = pickupLat === '' ? null : pickupLat;
  const cleanPickupLng = pickupLng === '' ? null : pickupLng;
  try {
    const result = await pool.query(`INSERT INTO routes (user_id, origin, destination, pickup_area, origin_lat, origin_lng, destination_lat, destination_lng, pickup_lat, pickup_lng, days_of_week, departure_time, role, distance_km, total_cost, seats_total, seats_available) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`, [tokenUser.sub, origin, destination, pickupArea, cleanOriginLat, cleanOriginLng, cleanDestLat, cleanDestLng, cleanPickupLat, cleanPickupLng, daysOfWeek, departureTime, role, cleanDistance, cleanTotalCost, cleanSeatsTotal, cleanSeatsAvailable]);
    return res.status(201).json({ route: result.rows[0] });
  } catch (error) { console.error(error); return res.status(500).json({ message: 'Could not save route.' }); }
});

app.get('/api/my-routes', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  try { const result = await pool.query('SELECT * FROM routes WHERE user_id = $1 ORDER BY created_at DESC', [tokenUser.sub]); return res.json({ routes: result.rows }); }
  catch { return res.status(500).json({ message: 'Could not load your routes.' }); }
});

app.patch('/api/routes/:id', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  const { origin, destination, pickupArea, originLat, originLng, destinationLat, destinationLng, pickupLat, pickupLng, daysOfWeek = [], departureTime, distanceKm = null, totalCost = 0, seatsTotal = 0, seatsAvailable = seatsTotal } = req.body;
  if (!origin || !destination || !pickupArea || !departureTime) return res.status(400).json({ message: 'Complete all route fields.' });
  // Convert empty strings to null for numeric fields
  const cleanDistance = distanceKm === '' || distanceKm === undefined ? null : Number(distanceKm);
  const cleanTotalCost = totalCost === '' || totalCost === undefined ? 0 : Number(totalCost);
  const cleanSeatsTotal = seatsTotal === '' || seatsTotal === undefined ? 0 : Number(seatsTotal);
  const cleanSeatsAvailable = seatsAvailable === '' || seatsAvailable === undefined ? cleanSeatsTotal : Number(seatsAvailable);
  const cleanOriginLat = originLat === '' ? null : originLat;
  const cleanOriginLng = originLng === '' ? null : originLng;
  const cleanDestLat = destinationLat === '' ? null : destinationLat;
  const cleanDestLng = destinationLng === '' ? null : destinationLng;
  const cleanPickupLat = pickupLat === '' ? null : pickupLat;
  const cleanPickupLng = pickupLng === '' ? null : pickupLng;
  try {
    const result = await pool.query(`UPDATE routes SET origin=$1, destination=$2, pickup_area=$3, origin_lat=$4, origin_lng=$5, destination_lat=$6, destination_lng=$7, pickup_lat=$8, pickup_lng=$9, days_of_week=$10, departure_time=$11, distance_km=$12, total_cost=$13, seats_total=$14, seats_available=LEAST(seats_available, $15) WHERE id=$16 AND user_id=$17 RETURNING *`, [origin, destination, pickupArea, cleanOriginLat, cleanOriginLng, cleanDestLat, cleanDestLng, cleanPickupLat, cleanPickupLng, daysOfWeek, departureTime, cleanDistance, cleanTotalCost, cleanSeatsTotal, cleanSeatsAvailable, req.params.id, tokenUser.sub]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Route not found.' });
    return res.json({ route: result.rows[0] });
  } catch { return res.status(500).json({ message: 'Could not update route.' }); }
});

app.patch('/api/routes/:id/pricing', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  const distanceKm = Number(req.body.distanceKm);
  const totalCost = Number(req.body.totalCost);
  const seatsTotal = Number(req.body.seatsTotal);
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(totalCost) || totalCost < 0 || !Number.isInteger(seatsTotal) || seatsTotal < 1) return res.status(400).json({ message: 'Enter valid distance, total cost, and seat count.' });
  try {
    const result = await pool.query(`UPDATE routes SET distance_km=$1, total_cost=$2, seats_total=$3, seats_available=LEAST(seats_available, $3) WHERE id=$4 AND user_id=$5 AND role='driver' RETURNING *`, [distanceKm, totalCost, seatsTotal, req.params.id, tokenUser.sub]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Driver route not found.' });
    return res.json({ route: result.rows[0], sharePerSeat: Math.round(totalCost / seatsTotal) });
  } catch { return res.status(500).json({ message: 'Could not save cost split.' }); }
});

app.delete('/api/routes/:id', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  try { const result = await pool.query('DELETE FROM routes WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, tokenUser.sub]); if (!result.rows[0]) return res.status(404).json({ message: 'Route not found.' }); return res.json({ deleted: result.rows[0].id }); }
  catch { return res.status(500).json({ message: 'Could not delete route.' }); }
});

app.post('/api/ride-requests', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  try {
    let pickupArea = req.body.pickupArea;
    let destination = req.body.destination;
    if (!pickupArea || !destination) {
      const riderRouteRes = await pool.query(
        `SELECT pickup_area, destination FROM routes WHERE user_id = $1 AND role = 'rider' ORDER BY created_at DESC LIMIT 1`,
        [tokenUser.sub]
      );
      if (riderRouteRes.rows[0]) {
        pickupArea = pickupArea || riderRouteRes.rows[0].pickup_area;
        destination = destination || riderRouteRes.rows[0].destination;
      }
    }
    const result = await pool.query(
      `INSERT INTO ride_requests (route_id, rider_id, pickup_area, destination)
       SELECT id, $2, COALESCE($3, pickup_area), COALESCE($4, destination)
       FROM routes
       WHERE id = $1 AND role = 'driver' AND user_id <> $2 AND seats_available > 0
       RETURNING *`,
      [req.body.routeId, tokenUser.sub, pickupArea || null, destination || null]
    );
    if (!result.rows[0]) return res.status(400).json({ message: 'This driver route is unavailable.' });
    return res.status(201).json({ request: result.rows[0] });
  } catch (error) { if (error.code === '23505') return res.status(409).json({ message: 'You already requested this route.' }); return res.status(500).json({ message: 'Could not send request.' }); }
});

app.patch('/api/ride-requests/:id', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser || !['approved', 'declined'].includes(req.body.status)) return res.status(400).json({ message: 'Invalid request update.' });
  try {
    const client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE ride_requests rr
       SET status = $1
       FROM routes r
       WHERE rr.id = $2 AND rr.route_id = r.id AND r.user_id = $3 AND rr.status = 'pending' AND ($1 <> 'approved' OR r.seats_available > 0)
       RETURNING rr.*, r.seats_available, r.seats_total, r.user_id AS driver_id, r.origin, r.destination, r.pickup_area AS route_pickup_area`,
      [req.body.status, req.params.id, tokenUser.sub]
    );
    if (!result.rows[0]) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({ message: 'This request was already decided or no seats remain.' });
    }
    const request = result.rows[0];
    if (req.body.status === 'approved') {
      const routeCost = await client.query(`SELECT total_cost, seats_total FROM routes WHERE id = $1`, [request.route_id]);
      const routePricing = routeCost.rows[0] || { total_cost: 0, seats_total: 1 };
      const cost = Math.round(Number(routePricing.total_cost || 0) / Math.max(1, Number(routePricing.seats_total || 1)));

      const seatUpdate = await client.query(
        `UPDATE routes SET seats_available = GREATEST(seats_available - 1, 0) WHERE id = $1 RETURNING seats_available, seats_total`,
        [request.route_id]
      );
      const remainingSeats = Number(seatUpdate.rows[0]?.seats_available ?? 0);
      const totalSeats = Number(seatUpdate.rows[0]?.seats_total ?? 0);

      const riderPickup = request.pickup_area || request.route_pickup_area || 'Standard pickup';
      const riderDest = request.destination || 'Campus';

      await client.query(
        `INSERT INTO trips (route_id, rider_id, trip_date, cost_per_rider, pickup_area, destination)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5)
         ON CONFLICT (route_id, rider_id) DO UPDATE SET status = 'confirmed', pickup_area = EXCLUDED.pickup_area, destination = EXCLUDED.destination`,
        [request.route_id, request.rider_id, cost, riderPickup, riderDest]
      );

      await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'request_approved', 'Ride request approved! 🎉', $2)`,
        [request.rider_id, `Your driver approved your seat request for ${request.origin} → ${request.destination}. Check My Trips to track your commute.`]
      );

      // Trigger automated alerts if all seats filled
      if (remainingSeats === 0) {
        await client.query(
          `INSERT INTO notifications (user_id, type, title, body)
           VALUES ($1, 'seats_filled_driver', '🚨 All seats filled! Carpool is ready', $2)`,
          [
            request.driver_id,
            `All ${totalSeats} seats on your route (${request.origin} → ${request.destination}) are filled! You can now start the journey or send "I am on the way" to your riders.`
          ]
        );

        const allRiders = await client.query(
          `SELECT DISTINCT rider_id FROM trips WHERE route_id = $1 AND status = 'confirmed'`,
          [request.route_id]
        );
        for (const r of allRiders.rows) {
          await client.query(
            `INSERT INTO notifications (user_id, type, title, body)
             VALUES ($1, 'seats_filled_rider', '🎉 All seats filled! Commute ready', $2)`,
            [
              r.rider_id,
              `All seats for your carpool (${request.origin} → ${request.destination}) are filled! Your driver will start the journey soon.`
            ]
          );
        }

        await client.query(
          `INSERT INTO trip_messages (route_id, sender_id, message)
           VALUES ($1, $2, $3)`,
          [
            request.route_id,
            request.driver_id,
            `🎉 All seats have been filled! The carpool is now full and ready to start.`
          ]
        );
      }
    } else {
      await client.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'request_declined', 'Ride request declined', 'The driver was unable to accept this seat request.')`,
        [request.rider_id]
      );
    }
    await client.query('COMMIT');
    client.release();
    return res.json({ request: result.rows[0] });
  } catch (error) {
    console.error('Update request error:', error);
    return res.status(500).json({ message: 'Could not update request.' });
  }
});

app.post('/api/routes/:id/driver-status', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  const { action = 'on_the_way', message = "I am on my way!", lat = null, lng = null } = req.body;
  const routeId = req.params.id;

  try {
    const routeCheck = await pool.query(
      `SELECT r.*, u.full_name AS driver_name FROM routes r JOIN users u ON u.id = r.user_id WHERE r.id = $1 AND r.user_id = $2 AND r.role = 'driver'`,
      [routeId, tokenUser.sub]
    );
    if (!routeCheck.rows[0]) return res.status(404).json({ message: 'Driver route not found.' });
    const route = routeCheck.rows[0];

    const ridersResult = await pool.query(
      `SELECT DISTINCT rider_id FROM (
         SELECT rider_id FROM trips WHERE route_id = $1 AND status = 'confirmed'
         UNION
         SELECT rider_id FROM ride_requests WHERE route_id = $1 AND status = 'approved'
       ) approved`,
      [routeId]
    );
    const riders = ridersResult.rows;

    // Location-only sharing is allowed anytime (even before all seats are filled)
    if (action === 'location_only') {
      const updatedRoute = await pool.query(
        `UPDATE routes
         SET driver_lat = COALESCE($1, driver_lat),
             driver_lng = COALESCE($2, driver_lng),
             driver_status_updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [lat, lng, routeId]
      );

      for (const rider of riders) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body)
           VALUES ($1, 'driver_location', 'Driver shared live location 📍', $2)`,
          [
            rider.rider_id,
            `${route.driver_name || 'Your driver'} shared updated live location for ${route.origin} → ${route.destination}.`
          ]
        );
      }

      return res.json({
        success: true,
        action: 'location_only',
        message: `Live location updated and shared with ${riders.length} approved rider(s).`,
        route: updatedRoute.rows[0],
        notifiedCount: riders.length
      });
    }

    // "On the way" is strictly locked until all seats are filled
    if (Number(route.seats_available) > 0) {
      return res.status(400).json({
        message: `Cannot send "I am on the way" until all seats are filled. Waiting for ${route.seats_available} more rider(s).`
      });
    }

    const updatedRoute = await pool.query(
      `UPDATE routes
       SET driver_status = 'on_the_way',
           driver_status_message = $1,
           driver_lat = COALESCE($2, driver_lat),
           driver_lng = COALESCE($3, driver_lng),
           driver_status_updated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [message.trim() || "I am on my way!", lat, lng, routeId]
    );

    for (const rider of riders) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'driver_on_the_way', 'Driver is on the way! 🚗', $2)`,
        [
          rider.rider_id,
          `${route.driver_name || 'Your driver'} is on the way for ${route.origin} → ${route.destination}. Message: "${message.trim() || "I am on my way!"}"`
        ]
      );
    }

    await pool.query(
      `INSERT INTO trip_messages (route_id, sender_id, message)
       VALUES ($1, $2, $3)`,
      [routeId, tokenUser.sub, `🚗 ${message.trim() || "I am on my way!"}`]
    );

    return res.json({
      success: true,
      action: 'on_the_way',
      message: `Status and location sent to ${riders.length} approved rider(s).`,
      route: updatedRoute.rows[0],
      notifiedCount: riders.length
    });
  } catch (error) {
    console.error('driver-status error:', error);
    return res.status(500).json({ message: 'Could not send driver status.' });
  }
});

app.post('/api/routes/:id/messages', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  const routeId = req.params.id;
  const text = (req.body.message || '').trim();
  if (!text) return res.status(400).json({ message: 'Message text cannot be empty.' });

  try {
    const [driverCheck, riderCheck, senderUser] = await Promise.all([
      pool.query(`SELECT id, user_id, origin, destination FROM routes WHERE id = $1 AND user_id = $2`, [routeId, tokenUser.sub]),
      pool.query(`SELECT id FROM trips WHERE route_id = $1 AND rider_id = $2 AND status <> 'cancelled'`, [routeId, tokenUser.sub]),
      pool.query(`SELECT id, full_name, role FROM users WHERE id = $1`, [tokenUser.sub])
    ]);

    const isDriver = Boolean(driverCheck.rows[0]);
    const isRider = Boolean(riderCheck.rows[0]);
    if (!isDriver && !isRider) {
      return res.status(403).json({ message: 'You are not a confirmed member of this carpool.' });
    }

    const sender = senderUser.rows[0];

    const insertRes = await pool.query(
      `INSERT INTO trip_messages (route_id, sender_id, message)
       VALUES ($1, $2, $3)
       RETURNING id, route_id, sender_id, message, created_at`,
      [routeId, tokenUser.sub, text]
    );

    const savedMsg = {
      ...insertRes.rows[0],
      sender_name: sender?.full_name || 'Member',
      sender_role: sender?.role || 'rider'
    };

    const [driverRow, ridersRows] = await Promise.all([
      pool.query(`SELECT user_id FROM routes WHERE id = $1`, [routeId]),
      pool.query(`SELECT rider_id FROM trips WHERE route_id = $1 AND status <> 'cancelled'`, [routeId])
    ]);

    const recipients = new Set();
    if (driverRow.rows[0] && String(driverRow.rows[0].user_id) !== String(tokenUser.sub)) {
      recipients.add(driverRow.rows[0].user_id);
    }
    for (const r of ridersRows.rows) {
      if (String(r.rider_id) !== String(tokenUser.sub)) {
        recipients.add(r.rider_id);
      }
    }

    for (const recipientId of recipients) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body)
         VALUES ($1, 'trip_message', $2, $3)`,
        [
          recipientId,
          `New message from ${sender?.full_name || 'Carpool member'}`,
          text.length > 100 ? `${text.slice(0, 97)}...` : text
        ]
      );
    }

    return res.status(201).json({ message: savedMsg });
  } catch (error) {
    console.error('Error posting trip message:', error);
    return res.status(500).json({ message: 'Could not send trip message.' });
  }
});

app.post('/api/trips/:id/status', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  const message = String(req.body.message || 'Your driver is on the way.').slice(0, 240);
  const lat = req.body.lat || null;
  const lng = req.body.lng || null;
  try {
    const result = await pool.query(`SELECT t.route_id, r.origin, r.destination, r.seats_available, u.full_name AS driver_name FROM trips t JOIN routes r ON r.id = t.route_id JOIN users u ON u.id = r.user_id WHERE t.id = $1 AND r.user_id = $2`, [req.params.id, tokenUser.sub]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Trip not found.' });
    const routeInfo = result.rows[0];
    if (Number(routeInfo.seats_available) > 0) return res.status(409).json({ message: `Waiting for ${routeInfo.seats_available} more rider(s) before starting.` });
    
    await pool.query(
      `UPDATE routes
       SET driver_status = 'on_the_way',
           driver_status_message = $1,
           driver_lat = $2,
           driver_lng = $3,
           driver_status_updated_at = NOW()
       WHERE id = $4`,
      [message, lat, lng, routeInfo.route_id]
    );

    await pool.query(`INSERT INTO notifications (user_id, type, title, body) SELECT rider_id, 'driver_status', 'Driver is on the way! 🚗', $1 FROM trips WHERE route_id = $2 AND status = 'confirmed'`, [message, routeInfo.route_id]);
    return res.json({ message: 'Confirmed riders have been notified.' });
  } catch (error) { console.error(error); return res.status(500).json({ message: 'Could not send status update.' }); }
});

app.post('/api/notifications/mark-all-read', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  try {
    await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL', [tokenUser.sub]);
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ message: 'Could not mark notifications as read.' });
  }
});

function validateCredentials({ fullName, email, password, role }) {
  if (!fullName || fullName.trim().length < 2) return 'Enter your full name.';
  if (!emailPattern.test(email || '')) return 'Please use your Gmail address (@gmail.com).';
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  if (!['rider', 'driver', 'admin'].includes(role)) return 'Choose a valid account type.';
  return null;
}

app.post('/api/auth/register', async (req, res) => {
  const { fullName, email, password, role = 'rider' } = req.body;
  const validationError = validateCredentials({ fullName, email, password, role });
  if (validationError) return res.status(400).json({ message: validationError });

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    // Admin accounts are auto-verified; only riders/drivers require admin verification
    const verified = role === 'admin';
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password_hash, role, verified) VALUES ($1, $2, $3, $4, $5) RETURNING id, full_name, email, role, verified`,
      [fullName.trim(), email.toLowerCase().trim(), passwordHash, role, verified]
    );
    const user = result.rows[0];
    return res.status(201).json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ message: 'An account with this email already exists.' });
    console.error(error);
    return res.status(500).json({ message: 'Could not create your account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!emailPattern.test(email || '') || !password) return res.status(400).json({ message: 'Enter a valid Gmail address and password.' });

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ message: 'Email or password is incorrect.' });
    return res.json({ token: createToken(user), user: publicUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Could not sign you in.' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Authentication required.' });
  try {
    const payload = jwt.verify(token, jwtSecret);
    const result = await pool.query('SELECT id, full_name, email, role, verified FROM users WHERE id = $1', [payload.sub]);
    if (!result.rows[0]) return res.status(401).json({ message: 'Account not found.' });
    return res.json({ user: publicUser(result.rows[0]) });
  } catch {
    return res.status(401).json({ message: 'Session expired.' });
  }
});

// Admin: verify a user account (only riders/drivers; admins are auto-verified and cannot be re-verified)
app.patch('/api/admin/users/:id/verify', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  if (tokenUser.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
  try {
    const target = await pool.query(`SELECT id, role FROM users WHERE id = $1`, [req.params.id]);
    if (!target.rows[0]) return res.status(404).json({ message: 'User not found.' });
    if (target.rows[0].role === 'admin') return res.status(400).json({ message: 'Admin accounts are auto-verified and cannot be re-verified.' });
    const result = await pool.query(
      `UPDATE users SET verified = TRUE WHERE id = $1 RETURNING id, full_name, email, role, verified`,
      [req.params.id]
    );
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body)
       VALUES ($1, 'account_verified', 'Account verified ✅', 'Your campus account has been verified by the admin. You can now fully use CarpoolCampus.')`,
      [req.params.id]
    );
    return res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    console.error('Verify user error:', error);
    return res.status(500).json({ message: 'Could not verify user.' });
  }
});

// Admin: suspend a user account (only riders/drivers; admin accounts cannot be suspended)
app.patch('/api/admin/users/:id/suspend', async (req, res) => {
  const tokenUser = authUser(req, res);
  if (!tokenUser) return;
  if (tokenUser.role !== 'admin') return res.status(403).json({ message: 'Admin access required.' });
  try {
    const target = await pool.query(`SELECT id, role FROM users WHERE id = $1`, [req.params.id]);
    if (!target.rows[0]) return res.status(404).json({ message: 'User not found.' });
    if (target.rows[0].role === 'admin') return res.status(400).json({ message: 'Admin accounts cannot be suspended.' });
    const result = await pool.query(
      `UPDATE users SET verified = FALSE WHERE id = $1 RETURNING id, full_name, email, role, verified`,
      [req.params.id]
    );
    return res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    console.error('Suspend user error:', error);
    return res.status(500).json({ message: 'Could not suspend user.' });
  }
});

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const distDir = path.resolve(currentDir, '../../frontend/dist');
app.use(express.static(distDir));
app.use((req, res, next) => req.path.startsWith('/api/') ? next() : res.sendFile(path.join(distDir, 'index.html')));

ensureSchema()
  .then(() => app.listen(port, () => console.log(`CarpoolCampus API running at http://localhost:${port}`)))
  .catch(error => {
    console.error('Database connection failed:', error.message);
    process.exit(1);
  });
