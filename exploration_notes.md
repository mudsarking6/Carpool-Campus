# CarpoolCampus Project - Exploration Notes

## Project Overview
CarpoolCampus is a ride-sharing coordination web app for commuting students. It matches students on overlapping routes and schedules, supports recurring trip scheduling, and includes a cost-split calculator.

## Tech Stack
- **Frontend**: React 18 + Vite, react-leaflet (OpenStreetMap), plain CSS
- **Backend**: Node.js/Express, PostgreSQL (pg), bcryptjs, jsonwebtoken, cors, dotenv
- **Database**: PostgreSQL (database: `Carpool_Campus`)
- **Real-time**: Polling every 4 seconds (no Socket.IO yet despite PRD mention)

## Architecture
- Single-page app with role-based dashboards (rider, driver, admin)
- Express API serves both API and static frontend (from `dist/`)
- Vite dev server proxies `/api` to `localhost:4000`

## Database Schema (8 tables)
1. **users** - id, full_name, email (unique), password_hash, role (rider/driver/admin), verified, created_at
2. **routes** - id, user_id, origin, destination, pickup_area, lat/lng coordinates, days_of_week[], departure_time, role, distance_km, total_cost, seats_total, seats_available, driver_status fields
3. **ride_requests** - id, route_id, rider_id, status (pending/approved/declined), pickup_area, destination
4. **trips** - id, route_id, rider_id, trip_date, status, cost_per_rider, pickup_area, destination
5. **safety_reports** - id, reporter_id, subject, description, status (open/resolved)
6. **notifications** - id, user_id, type, title, body, read_at
7. **trip_messages** - id, route_id, sender_id, message, created_at

## API Endpoints
- `GET /api/dashboard` - Role-based dashboard data (routes, requests, trips, reports, notifications, members)
- `POST /api/routes` - Create route
- `GET /api/my-routes` - Get user's routes
- `PATCH /api/routes/:id` - Update route
- `PATCH /api/routes/:id/pricing` - Update driver cost split
- `DELETE /api/routes/:id` - Delete route
- `POST /api/ride-requests` - Request a seat
- `PATCH /api/ride-requests/:id` - Approve/decline request (creates trip, notifications)
- `POST /api/routes/:id/driver-status` - Driver sends status (on_the_way/location_only)
- `POST /api/routes/:id/messages` - Send trip chat message
- `POST /api/trips/:id/status` - Driver trip status update
- `POST /api/notifications/mark-all-read` - Mark notifications read
- `POST /api/auth/register` - Register (Gmail only, bcrypt hashed)
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `PATCH /api/admin/users/:id/verify` - Admin verify user (NEW)
- `PATCH /api/admin/users/:id/suspend` - Admin suspend user (NEW)

## Key Features Implemented
1. **Auth**: Gmail-only registration, JWT tokens, bcrypt password hashing
2. **Route Posting**: Map-based picker (OpenStreetMap/Leaflet), origin/destination/pickup points, days of week, departure time
3. **Matching Engine**: Distance-based fit score (0-100), filters matches within 30km
4. **Ride Requests**: Request/approve/decline workflow with seat management
5. **Cost Split**: Distance-based calculator, per-rider share
6. **Driver Status**: "I'm on the way" (locked until all seats filled), live location sharing
7. **Trip Chat**: Group chat for driver + confirmed riders
8. **Notifications**: Request approved/declined, seats filled, driver status, messages
9. **Admin**: User verification, safety reports moderation, member management
10. **Safety**: Emergency contact sharing, safety reports

## Admin Dashboard Enhancements (NEW)
- **Driver Routes & Earnings Table**: Admin overview now shows live data from PostgreSQL:
  - Driver name, route (origin → destination)
  - Member count (confirmed/completed trips per route)
  - Total cost collected per route
- **Verify/Suspend Users**: Admin can now:
  - Verify pending user accounts (sends notification to user)
  - Suspend/restore user accounts
- **Live Member Management**: Admin members page shows real user data with role, status, and action buttons

## Key Business Rules
- "I'm on the way" is locked until all seats are filled
- Location-only sharing is allowed anytime
- Seats auto-decrement on approval
- All-seats-filled triggers notifications to driver and all riders
- Gmail-only registration (@gmail.com)
- Exact home addresses never shown - only pickup areas/landmarks

## Frontend Structure (src/main.jsx - 1123 lines)
- Single file containing all components
- Role-based navigation: rider (overview, matches, routes, trips, safety), driver (overview, requests, routes, trips, earnings), admin (overview, verify, reports, members)
- Live dashboard refresh every 4 seconds
- Splash screen, auth screen, loading screen

## Current State
- Fully functional MVP with all core features
- Uses polling instead of WebSockets for real-time updates
- Demo data appears to be hardcoded in some components (Earnings, Safety)
- No test suite present
- No Socket.IO implementation yet