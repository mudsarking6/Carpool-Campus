CREATE DATABASE "Carpool_Campus";

\connect "Carpool_Campus"

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'rider' CHECK (role IN ('rider', 'driver', 'admin')),
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS routes (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  origin VARCHAR(160) NOT NULL,
  destination VARCHAR(160) NOT NULL,
  pickup_area VARCHAR(160) NOT NULL,
  origin_lat NUMERIC(9, 6), origin_lng NUMERIC(9, 6),
  destination_lat NUMERIC(9, 6), destination_lng NUMERIC(9, 6),
  pickup_lat NUMERIC(9, 6), pickup_lng NUMERIC(9, 6),
  days_of_week TEXT[] NOT NULL DEFAULT '{}',
  departure_time TIME NOT NULL,
  role VARCHAR(10) NOT NULL CHECK (role IN ('rider', 'driver')),
  distance_km NUMERIC(10, 2),
  total_cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_cost >= 0),
  seats_total INTEGER NOT NULL DEFAULT 0 CHECK (seats_total >= 0),
  seats_available INTEGER NOT NULL DEFAULT 0 CHECK (seats_available >= 0),
  driver_status VARCHAR(50) DEFAULT 'scheduled',
  driver_status_message TEXT,
  driver_lat NUMERIC(9, 6),
  driver_lng NUMERIC(9, 6),
  driver_status_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ride_requests (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  rider_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_area VARCHAR(160),
  destination VARCHAR(160),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, rider_id)
);

CREATE TABLE IF NOT EXISTS trips (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  rider_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pickup_area VARCHAR(160),
  destination VARCHAR(160),
  trip_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled')),
  cost_per_rider NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (route_id, rider_id)
);

CREATE TABLE IF NOT EXISTS trip_messages (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  sender_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS safety_reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  subject VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

