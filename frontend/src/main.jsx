import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const roleColors = ['#c06c49', '#486d85', '#947454', '#607f65'];
const EMPTY_ROUTES = [];

// Professional brand icon: car silhouette (uses currentColor so it inherits any text color)
function BrandIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="2" y="10" width="20" height="8" rx="2.5" fill="currentColor" />
      <path d="M6 10 L9.5 5.5 L14.5 5.5 L18 10 Z" fill="currentColor" />
      <circle cx="7.5" cy="20" r="2.6" fill="currentColor" />
      <circle cx="16.5" cy="20" r="2.6" fill="currentColor" />
    </svg>
  );
}

function initials(name = '') { return name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase(); }
function formatTime(value) { return value ? new Date(`1970-01-01T${value}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Not set'; }
async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
    return data;
  } finally { clearTimeout(timeout); }
}

function MapViewport({ location }) {
  const map = useMap();
  useEffect(() => { if (location) map.setView([location.lat, location.lng], 15); }, [location, map]);
  return null;
}

function MapTools({ activePoint, onPick }) {
  const map = useMap();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
    const search = async event => { event.preventDefault(); if (!query.trim()) return; setBusy(true); setError(''); try { const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pk&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } }); const result = (await response.json())[0]; if (!result) { setError('Location not found. Try “Faisal Mosque, Islamabad”.'); return; } const latlng = { lat: Number(result.lat), lng: Number(result.lon) }; map.setView([latlng.lat, latlng.lng], 15); onPick(activePoint, latlng, result.display_name.split(',').slice(0, 2).join(',')); } catch (error) { setError('Map search is unavailable right now.'); } finally { setBusy(false); } };
  const locate = () => navigator.geolocation?.getCurrentPosition(position => { const latlng = { lat: position.coords.latitude, lng: position.coords.longitude }; map.setView([latlng.lat, latlng.lng], 16); onPick('origin', latlng, 'Current location'); });
  return <div className="map-tools" onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}><form onSubmit={search}><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${activePoint} e.g. DHA Phase 2`} aria-label="Search map location"/><button type="submit" disabled={busy}>{busy ? '...' : 'Search'}</button></form>{activePoint === 'origin' && <button type="button" onClick={locate}>Use current location</button>}{error && <small className="map-search-error">{error}</small>}</div>;
}

function RouteMapPicker({ points, activePoint, onPick, mapCenter }) {
  function ClickHandler() {
    useMapEvents({ click: event => onPick(activePoint, event.latlng) });
    return null;
  }
  const positions = ['origin', 'destination', 'pickup'].map(key => points[key]).filter(Boolean);
  return <MapContainer className="route-map-picker" center={[31.4697, 74.2728]} zoom={12} scrollWheelZoom><TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><MapTools activePoint={activePoint} onPick={onPick}/><MapViewport location={mapCenter}/><ClickHandler/>{positions.map((point, index) => <Marker key={`${point.lat}-${point.lng}-${index}`} position={[point.lat, point.lng]}/>)}{positions.length > 1 && <Polyline positions={positions.map(point => [point.lat, point.lng])} pathOptions={{ color: '#0e8178', weight: 4, dashArray: '8 8' }}/>}</MapContainer>;
}
function routeToRide(route, index) {
  return { id: route.id, name: route.full_name, initials: initials(route.full_name), color: roleColors[index % roleColors.length], route: `${route.origin} → ${route.destination}`, pickup: route.pickup_area, time: formatTime(route.departure_time), days: (route.days_of_week || []).join(' · '), rating: route.rating || 'New', trips: route.trips || 0, seats: route.seats_available, fit: route.fit || 0, fare: route.estimated_cost || route.cost_per_rider || 0, distanceKm: route.distance_km, totalCost: route.total_cost, seatsTotal: route.seats_total, status: 'available' };
}

const navByRole = {
  rider: [['overview', '⌂', 'Overview'], ['matches', '⌘', 'Find a ride'], ['routes', '⌁', 'My route'], ['trips', '◷', 'My trips'], ['safety', '♧', 'Safety']],
  driver: [['overview', '⌂', 'Overview'], ['requests', '◌', 'Ride requests'], ['routes', '⌁', 'My route'], ['trips', '◷', 'My trips'], ['earnings', '₨', 'Cost splits']],
  admin: [['overview', '⌂', 'Overview'], ['verify', '✓', 'Verifications'], ['reports', '⚑', 'Safety reports'], ['members', '♙', 'Members']]
};

const roleProfile = {
  rider: { name: 'Rimsha Malik', initials: 'RM', color: '#ae754b', label: 'Rider account' },
  driver: { name: 'Danish Khan', initials: 'DK', color: '#c06c49', label: 'Driver account' },
  admin: { name: 'Adeel Raza', initials: 'AR', color: '#486d85', label: 'Campus admin' }
};

function Avatar({ initials, color = '#0f766e', small = false }) { return <span className={`avatar ${small ? 'small' : ''}`} style={{ background: color }}>{initials}</span>; }
function Badge({ children, tone = 'teal' }) { return <span className={`badge ${tone}`}>{children}</span>; }

function MapCard({ compact = false }) {
  return <div className={`map ${compact ? 'compact' : ''}`} aria-label="Route preview map">
    <div className="map-grid" />
    <span className="road r1" /><span className="road r2" /><span className="road r3" />
    <span className="route-line" /><span className="pin pin-start">A</span><span className="pin pin-end">B</span>
    {!compact && <><span className="map-label l1">DHA Phase 6</span><span className="map-label l2">FAST Campus</span><span className="map-label l3">Gulberg</span><span className="map-legend">Your route <b>·</b> Driver route</span></>}
  </div>;
}

function Sidebar({ page, setPage, collapsed, role, user, counts = {}, onLogout }) {
  const profile = { ...roleProfile[role], name: user?.fullName || user?.email || roleProfile[role].name, initials: initials(user?.fullName || user?.email || roleProfile[role].name) };
  const [accountMenu, setAccountMenu] = useState(false);
  return <aside className={`sidebar ${collapsed ? 'open' : ''}`}>
    <div className="brand"><span className="brand-mark"><BrandIcon/></span><span>Carpool<span>Campus</span></span></div>
    <p className="nav-label">{role === 'admin' ? 'ADMIN SPACE' : 'STUDENT SPACE'}</p>
    <nav>{navByRole[role].map(([key, icon, label]) => {
      const badgeVal = counts[key];
      return <button key={key} className={page === key ? 'active' : ''} onClick={() => setPage(key)}><i>{icon}</i>{label}{Boolean(badgeVal) && <em>{badgeVal}</em>}</button>;
    })}</nav>
    <div className="sidebar-bottom"><div className="verified"><span>✓</span><div><b>{role === 'admin' ? 'Moderator access' : 'Campus verified'}</b><small>{role === 'admin' ? 'Admin account' : 'Verified account'}</small></div></div><button className="help">? &nbsp; Help & support</button><div className="account"><Avatar initials={profile.initials} color={profile.color} small /><div><b>{profile.name}</b><small>{profile.label}</small></div><button aria-label="Account menu" onClick={() => setAccountMenu(open => !open)}>⋮</button>{accountMenu && <div className="account-menu"><button onClick={() => { if (onLogout) { onLogout(); } else { localStorage.removeItem('carpool-campus-token'); localStorage.setItem('carpool-campus-logout', 'Successfully logged out.'); window.location.reload(); } }}>Log out</button></div>}</div></div>
  </aside>;
}

function Header({ setPage, role, notifications = [], onRefresh }) {
  const [openNotif, setOpenNotif] = useState(false);
  const unreadCount = notifications.filter(n => !n.read_at).length;

  const markAllRead = async () => {
    const token = localStorage.getItem('carpool-campus-token');
    try {
      await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error(e);
    }
  };

  return <header className="topbar">
    <button className="mobile-brand" onClick={() => setPage('overview')}><BrandIcon size={16}/></button>
    <div className="search">⌕ <input aria-label="Search" placeholder={role === 'admin' ? 'Search members or reports' : 'Search routes, places or people'} /></div>
    <div className="header-actions" style={{ position: 'relative' }}>
      <button className="icon-button" aria-label="Notifications" onClick={() => setOpenNotif(prev => !prev)} style={{ position: 'relative' }}>
        ♢
        {unreadCount > 0 && <span className="notification-badge-counter">{unreadCount}</span>}
      </button>

      {openNotif && (
        <div className="notifications-popover" onClick={e => e.stopPropagation()}>
          <div className="notifications-head">
            <h3>Notifications {unreadCount > 0 ? `(${unreadCount} new)` : ''}</h3>
            {unreadCount > 0 && <button className="text-button" onClick={markAllRead}>Mark all read</button>}
          </div>
          <div className="notifications-list">
            {notifications.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#7a8d88', fontSize: '12px' }}>No notifications yet.</div>
            ) : (
              notifications.map(n => (
                <div
                  key={n.id}
                  className={`notification-row-item ${!n.read_at ? 'unread' : ''}`}
                  onClick={() => {
                    if (n.type === 'driver_on_the_way' || n.type === 'request_approved') {
                      setPage('trips');
                      setOpenNotif(false);
                    }
                  }}
                  style={{ cursor: n.type === 'driver_on_the_way' || n.type === 'request_approved' ? 'pointer' : 'default' }}
                >
                  <div className="notification-row-top">
                    <span className="notification-row-title">{n.title}</span>
                    <span className="notification-row-time">{new Date(n.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                  <div className="notification-row-body">{n.body}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {role !== 'admin' && <button className="create" onClick={() => setPage('routes')}>＋ <span>{role === 'driver' ? 'Post a drive' : 'Post a route'}</span></button>}
    </div>
  </header>;
}

function CostCalculator() { const [people, setPeople] = useState(3); const [distance, setDistance] = useState(18); const total = Math.round(distance * 30 + 100); return <section className="card calculator"><div className="section-heading"><div><p className="eyebrow">COST SPLIT</p><h3>Today’s ride estimate</h3></div><button className="text-button">How it works</button></div><div className="calc-main"><div className="cost">Rs. {Math.round(total / people)}<small>your estimated share</small></div><div className="calc-meta"><span>Rs. {total} trip total</span><span>·</span><span>{distance} km</span><span>·</span><span>{people} people</span></div></div><div className="slider-row"><label>Riders <b>{people}</b></label><input type="range" min="2" max="5" value={people} onChange={e => setPeople(+e.target.value)} /></div><div className="slider-row"><label>Distance <b>{distance} km</b></label><input type="range" min="5" max="40" value={distance} onChange={e => setDistance(+e.target.value)} /></div><p className="calc-note">Includes a sample fuel and parking estimate. Payment stays between you and the driver.</p></section>; }

function Overview({ setPage }) { return <main className="content"><div className="welcome"><div><p className="eyebrow">THURSDAY, SEPTEMBER 4</p><h1>Good morning, Rimsha <span>✦</span></h1><p>Here’s what your campus commute looks like today.</p></div><button className="outline" onClick={() => setPage('routes')}>✎ Edit my route</button></div><section className="today-banner"><div className="today-mark"><BrandIcon size={22}/></div><div><Badge tone="amber">TODAY · THU, SEP 4</Badge><h2>Your ride to campus is all set</h2><p>Pickup at <b>Kalma Chowk</b> · 8:10 AM &nbsp;•&nbsp; Danish is driving</p></div><div className="banner-actions"><button className="solid" onClick={() => alert('Danish has been notified that you are ready.')}>I’m ready</button><button className="outline light">View trip</button></div></section><div className="dashboard-grid"><section className="card upcoming"><div className="section-heading"><div><p className="eyebrow">UPCOMING TRIP</p><h3>Today’s commute</h3></div><Badge tone="green">CONFIRMED</Badge></div><div className="trip-person"><Avatar initials="DK" color="#c06c49"/><div><b>Danish Khan</b><span>Driver · Honda Civic</span><div className="stars">★★★★★ <small>4.9</small></div></div><button className="more">•••</button></div><MapCard compact/><div className="trip-stops"><div><i>A</i><span><small>PICKUP</small><b>Kalma Chowk</b></span><time>8:10 AM</time></div><div><i>B</i><span><small>DESTINATION</small><b>FAST-NU Campus</b></span><time>8:35 AM</time></div></div><button className="full-link" onClick={() => setPage('trips')}>View trip details <span>→</span></button></section><div className="right-stack"><section className="card mini-card"><div className="section-heading"><div><p className="eyebrow">YOUR WEEK</p><h3>On the move</h3></div><button className="text-button" onClick={() => setPage('trips')}>See all</button></div><div className="week"><div><b>3</b><span>rides planned</span></div><div><b>Rs. 555</b><span>estimated spend</span></div><div><b>12.4 kg</b><span>CO₂ saved</span></div></div></section><section className="card request-card"><div><span className="notification-dot">1</span><p className="eyebrow">NEW UPDATE</p><h3>Danish is on the way</h3><p>He’ll reach your pickup point in around 8 minutes.</p></div><button className="outline teal">Track status</button></section></div></div><section className="recommendation"><div className="section-heading"><div><p className="eyebrow">FOR YOUR ROUTE</p><h2>More ways to get there</h2></div><button className="text-button" onClick={() => setPage('matches')}>See all matches →</button></div><div className="match-row">{rides.slice(1).map(ride => <RideMini key={ride.id} ride={ride} onClick={() => setPage('matches')} />)}</div></section></main>; }

function RideMini({ ride, onClick }) { return <article className="ride-mini"><Avatar initials={ride.initials} color={ride.color}/><div className="ride-mini-info"><div><b>{ride.name}</b><span className="stars">★★★★★ <small>{ride.rating}</small></span></div><p>{ride.pickup} · {ride.time}</p><small>{ride.seats} seats left · {ride.fit}% route fit</small></div><button className="outline teal" onClick={onClick}>View</button></article>; }

function Matches({ rides = [], requests, setRequests }) { const [filter, setFilter] = useState('Best match'); const visible = useMemo(() => [...rides].sort((a,b) => filter === 'Cost' ? a.fare-b.fare : b.fit-a.fit), [filter, rides]); return <main className="content"><div className="page-heading"><div><p className="eyebrow">MATCHED FOR YOUR ROUTE</p><h1>Find a ride</h1><p>Drivers whose routes and schedule work with yours.</p></div><Badge tone="teal">{rides.length} MATCHES</Badge></div><div className="match-layout"><section><div className="filterbar"><button className="filter active">⇵ {filter}</button><div className="filter-pop"><button onClick={() => setFilter(filter === 'Cost' ? 'Best match' : 'Cost')}>Sort: {filter === 'Cost' ? 'Best match' : 'Cost'}</button><button>◷ Morning</button><button>◉ Within 2 km</button></div></div><div className="ride-list">{visible.map(ride => <RideCard key={ride.id} ride={ride} requested={requests.includes(ride.id)} onRequest={() => setRequests(x => [...x, ride.id])} />)}{!visible.length && <div className="empty-state">No driver routes are available yet.</div>}</div></section><aside className="route-summary"><MapCard/><h3>Your saved route</h3><p><b>Your route</b> → FAST-NU Campus</p><button className="text-button">Edit preferences →</button></aside></div></main>; }

function RideCard({ ride, requested, onRequest }) { return <article className="ride-card"><div className="match-score"><b>{ride.fit}%</b><span>route fit</span></div><div className="ride-card-main"><div className="driver-line"><Avatar initials={ride.initials} color={ride.color}/><div><b>{ride.name}</b><span>Verified driver · {ride.trips} shared rides</span></div><span className="stars">★★★★★ <small>{ride.rating}</small></span></div><div className="route-detail"><div><i>A</i><span><small>PICKUP NEAR</small><b>{ride.pickup}</b></span></div><span className="route-dash"/><div><i>B</i><span><small>ARRIVES CAMPUS</small><b>{ride.time.replace('8:', '8:3')}</b></span></div></div><div className="ride-footer"><span>{ride.days}</span><span>·</span><span>{ride.seats} seats remaining</span><span>·</span><b>Rs. {ride.fare} per seat</b>{ride.distanceKm && <><span>·</span><span>{ride.distanceKm} km</span></>}</div></div><button disabled={requested} className={requested ? 'requested' : 'solid'} onClick={onRequest}>{requested ? '✓ Request sent' : 'Request seat'}</button></article>; }

function RouteForm({ setPage }) { const [saved, setSaved] = useState(false); const [days, setDays] = useState(['Mon','Wed','Fri']); const toggle = day => setDays(d => d.includes(day) ? d.filter(x => x !== day) : [...d, day]); return <main className="content route-page"><div className="page-heading"><div><p className="eyebrow">YOUR COMMUTE PREFERENCES</p><h1>{saved ? 'Your route is live' : 'Post your recurring route'}</h1><p>{saved ? 'We’ll keep looking for students going your way.' : 'Tell us where and when you commute. You can update this anytime.'}</p></div></div>{saved ? <section className="success-state"><div className="success-icon">✓</div><h2>Route added to the matching pool</h2><p>We found 3 compatible drivers already. You can now request a seat or wait for new matches.</p><button className="solid" onClick={() => setPage('matches')}>See my matches →</button></section> : <div className="form-layout"><form className="card route-form" onSubmit={e => { e.preventDefault(); setSaved(true); }}><label>I'm looking for a <div className="role-toggle"><button type="button" className="active">Seat as a rider</button><button type="button">Rider as a driver</button></div></label><div className="field-grid"><label>Pickup area<input defaultValue="DHA Phase 6" required /></label><label>Campus destination<input defaultValue="FAST-NU Campus" required /></label></div><p className="privacy-note">♙ Your exact home address is never shown. Matches only see your chosen pickup area.</p><label>Days you commute<div className="day-picker">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => <button type="button" key={d} className={days.includes(d) ? 'selected' : ''} onClick={() => toggle(d)}>{d}</button>)}</div></label><div className="field-grid"><label>Arrival by<input type="time" defaultValue="08:30" /></label><label>Time flexibility<select defaultValue="15"><option value="15">± 15 minutes</option><option value="30">± 30 minutes</option><option value="45">± 45 minutes</option></select></label></div><label>Notes for matches <textarea placeholder="e.g. I can walk to a nearby landmark for pickup." /></label><button className="solid submit" type="submit">Find compatible rides →</button></form><aside className="route-helper"><MapCard/><h3>Better matches, safer sharing</h3><p>Use a landmark or general area as your pickup zone. Exact addresses stay private until you agree on a ride.</p><div className="helper-list"><span>✓ Campus-verified community</span><span>✓ Recurring schedules, not one-off rides</span><span>✓ Clear estimates before you request</span></div></aside></div>}</main>; }

function Trips() { return <main className="content"><div className="page-heading"><div><p className="eyebrow">RECURRING COMMUTES</p><h1>My trips</h1><p>Manage your confirmed rides and see your ride history.</p></div><button className="outline">Pause a schedule</button></div><section className="card trip-detail"><div className="trip-detail-head"><div><Badge tone="green">CONFIRMED · TODAY</Badge><h2>DHA Phase 6 → FAST-NU Campus</h2><p>Every Monday, Wednesday & Friday · 8:10 AM pickup</p></div><button className="outline teal">Message Danish</button></div><div className="trip-detail-grid"><MapCard compact/><div className="schedule-info"><p><span>DRIVER</span><b>Danish Khan · Honda Civic</b></p><p><span>PICKUP</span><b>Kalma Chowk</b></p><p><span>YOUR SHARE</span><b>Rs. 185 est. per ride</b></p></div></div><div className="trip-actions"><button className="text-button">Skip next ride</button><button className="text-button">Share with emergency contact</button><button className="text-button">View cost breakdown</button></div></section><section className="history"><p className="eyebrow">RECENT HISTORY</p><h2>Previous commutes</h2><div className="history-list">{['Sep 1, 2026','Aug 29, 2026','Aug 27, 2026'].map((date,i) => <div key={date}><span className="history-icon"><BrandIcon size={16}/></span><div><b>{date} · FAST-NU Campus</b><small>Danish Khan · Kalma Chowk</small></div><span>Rs. {i ? 175 : 185}</span><Badge tone={i === 0 ? 'amber' : 'green'}>{i === 0 ? 'RATE RIDE' : 'COMPLETED'}</Badge></div>)}</div></section></main>; }

function Safety() { const [shared, setShared] = useState(false); return <main className="content"><div className="page-heading"><div><p className="eyebrow">TRUST & SAFETY</p><h1>Ride with confidence</h1><p>Small tools that make every shared commute feel more secure.</p></div></div><div className="safety-grid"><section className="card safety-main"><div className="safety-illustration">♧</div><p className="eyebrow">TRIP SHARING</p><h2>{shared ? 'Trip details shared' : 'Share today’s trip'}</h2><p>{shared ? 'A link with your driver, route and ETA was sent to Amna Malik.' : 'Send a live view of your driver, route and ETA to someone you trust.'}</p><button className="solid" onClick={() => setShared(true)}>{shared ? '✓ Shared with Amna' : 'Share with emergency contact'}</button></section><section className="card contact-card"><p className="eyebrow">EMERGENCY CONTACT</p><Avatar initials="AM" color="#8d6b9f"/><h3>Amna Malik</h3><p>Sister · +92 300 1234567</p><button className="text-button">Edit contact →</button></section></div><section className="card safety-list"><div><span>✓</span><div><b>Campus identity verified</b><p>Your FAST-NU email is verified. Other verified students see the same signal.</p></div></div><div><span>★</span><div><b>Mutual ratings</b><p>Drivers and riders can rate each other after a completed commute.</p></div></div><div><span>⚑</span><div><b>Report a concern</b><p>Something didn’t feel right? Our campus moderation team can review it.</p></div><button className="outline">Make a report</button></div></section></main>; }

function DriverOverview({ setPage, driverStatus, setDriverStatus, approvedCount }) {
  return <main className="content"><div className="welcome"><div><p className="eyebrow">THURSDAY, SEPTEMBER 4</p><h1>Good morning, Danish <span>✦</span></h1><p>Your passengers and route are ready for today.</p></div><button className="outline" onClick={() => setPage('routes')}>✎ Edit drive route</button></div><section className={`today-banner ${driverStatus ? 'driver-live' : ''}`}><div className="today-mark">{driverStatus ? '●' : <BrandIcon size={22}/>}</div><div><Badge tone={driverStatus ? 'green' : 'amber'}>{driverStatus ? 'LIVE STATUS · SENT' : 'TODAY · THU, SEP 4'}</Badge><h2>{driverStatus ? 'Your riders know you are on the way' : 'Ready to start today’s carpool?'}</h2><p>{driverStatus ? 'Rimsha and Maham received your pickup ETA.' : `Two confirmed riders · Pickup starts at 8:10 AM · ${approvedCount} new approval${approvedCount === 1 ? '' : 's'}`}</p></div><div className="banner-actions"><button className="solid" onClick={() => setDriverStatus(!driverStatus)}>{driverStatus ? '✓ Status sent' : 'Send “I’m on my way”'}</button><button className="outline light" onClick={() => setPage('trips')}>View trip</button></div></section><div className="dashboard-grid"><section className="card upcoming"><div className="section-heading"><div><p className="eyebrow">TODAY’S DRIVE</p><h3>DHA Phase 6 → FAST Campus</h3></div><Badge tone="green">2 OF 3 SEATS</Badge></div><MapCard compact/><div className="trip-stops"><div><i>A</i><span><small>FIRST PICKUP</small><b>Y Block Market</b></span><time>8:05 AM</time></div><div><i>B</i><span><small>DESTINATION</small><b>FAST-NU Campus</b></span><time>8:35 AM</time></div></div><button className="full-link" onClick={() => setPage('trips')}>Manage today’s drive <span>→</span></button></section><div className="right-stack"><section className="card mini-card"><div className="section-heading"><div><p className="eyebrow">THIS WEEK</p><h3>Your impact</h3></div><button className="text-button" onClick={() => setPage('earnings')}>Cost splits</button></div><div className="week"><div><b>8</b><span>shared rides</span></div><div><b>Rs. 1,480</b><span>cost recovered</span></div><div><b>22.1 kg</b><span>CO₂ saved</span></div></div></section><section className="card request-card"><div><p className="eyebrow">RIDE REQUESTS</p><h3>{3 - approvedCount} waiting for your response</h3><p>Review pickup points, profiles and route fit before confirming.</p></div><button className="outline teal" onClick={() => setPage('requests')}>Review</button></section></div></div></main>;
}

function DriverRequests({ incomingRiders = [], decisions = {}, onDecide }) {
  const pendingCount = incomingRiders.filter(r => (decisions[r.id] || r.status) === 'pending').length;
  return <main className="content"><div className="page-heading"><div><p className="eyebrow">REQUEST INBOX</p><h1>Ride requests</h1><p>Approve riders who fit your route and available seats.</p></div><Badge tone={pendingCount > 0 ? 'amber' : 'green'}>{pendingCount} PENDING</Badge></div><section className="request-list">{incomingRiders.map(rider => {
    const currentStatus = decisions[rider.id] || rider.status;
    return <article className="card driver-request" key={rider.id}>
      <Avatar initials={rider.initials} color={rider.color}/>
      <div className="request-person">
        <b>{rider.name}</b>
        <span>Campus verified · ★ {rider.rating}</span>
        <p>Pickup near <b>{rider.pickup}</b></p>
        <small>Requested {rider.requested}</small>
      </div>
      <div className="request-actions">
        {currentStatus === 'approved' ? (
          <Badge tone="green">✓ APPROVED</Badge>
        ) : currentStatus === 'declined' ? (
          <Badge tone="amber">DECLINED</Badge>
        ) : (
          <>
            <button className="outline" onClick={() => onDecide(rider.id, 'declined')}>Decline</button>
            <button className="solid" onClick={() => onDecide(rider.id, 'approved')}>Approve seat</button>
          </>
        )}
      </div>
    </article>;
  })}{!incomingRiders.length && <div className="card" style={{ textAlign: 'center', padding: '36px 20px', color: '#73847f' }}><p>No ride requests received yet.</p></div>}</section></main>;
}

function DriverTrips({ driverStatus, setDriverStatus }) { const [paused, setPaused] = useState(false); return <main className="content"><div className="page-heading"><div><p className="eyebrow">RECURRING DRIVE</p><h1>My drive schedule</h1><p>Control your weekly availability and today's passenger updates.</p></div><button className="outline" onClick={() => setPaused(!paused)}>{paused ? 'Resume schedule' : 'Pause next ride'}</button></div><section className="card trip-detail"><div className="trip-detail-head"><div><Badge tone={paused ? 'amber' : 'green'}>{paused ? 'PAUSED NEXT RIDE' : 'ACTIVE · TODAY'}</Badge><h2>DHA Phase 6 → FAST-NU Campus</h2><p>Monday to Friday · Leaves Y Block at 8:05 AM</p></div><button className="outline teal" onClick={() => setDriverStatus(!driverStatus)}>{driverStatus ? '✓ Riders notified' : 'Send status update'}</button></div><div className="trip-detail-grid"><MapCard compact/><div className="schedule-info"><p><span>PASSENGERS</span><b>Rimsha Malik, Maham Siddiqui</b></p><p><span>AVAILABLE SEATS</span><b>1 remaining seat</b></p><p><span>EST. TOTAL COST</span><b>Rs. 555 · Rs. 185 per person</b></p></div></div><div className="trip-actions"><button className="text-button" onClick={() => alert('Dummy navigation: pickup order updated.')}>Edit pickup order</button><button className="text-button" onClick={() => alert('Dummy message sent to all confirmed riders.')}>Message riders</button><button className="text-button" onClick={() => alert('Dummy trip marked as completed.')}>Complete today’s trip</button></div></section></main>; }

function Earnings() { const [riders, setRiders] = useState(3); const [rate, setRate] = useState(30); const total = 18 * rate + 100; return <main className="content"><div className="page-heading"><div><p className="eyebrow">TRANSPARENT COST SPLITS</p><h1>Cost split calculator</h1><p>Estimate the weekly ride contribution before you confirm passengers.</p></div></div><section className="card calculator large-calculator"><div className="section-heading"><div><p className="eyebrow">TODAY’S DRIVE · 18 KM</p><h3>Shared commute estimate</h3></div><Badge tone="teal">NO IN-APP PAYMENTS</Badge></div><div className="calc-main"><div className="cost">Rs. {Math.round(total / riders)}<small>per person, including driver</small></div><div className="calc-meta"><span>Rs. {total} total estimated cost</span><span>·</span><span>18 km</span><span>·</span><span>{riders} people</span></div></div><div className="slider-row"><label>People in car <b>{riders}</b></label><input type="range" min="2" max="5" value={riders} onChange={e => setRiders(+e.target.value)} /></div><div className="slider-row"><label>Fuel estimate / km <b>Rs. {rate}</b></label><input type="range" min="20" max="60" value={rate} onChange={e => setRate(+e.target.value)} /></div><p className="calc-note">Dummy calculation only. Riders see this estimate before they request a seat; payments are arranged directly between students.</p></section></main>; }

function AdminPreview({ setPage, dashboard, onVerify, onSuspend }) {
  const members = dashboard.members || [];
  const driverRoutes = dashboard.routes || [];
  const verifyQueue = members.filter(m => !m.verified && m.role !== 'admin');
  const pendingVerification = verifyQueue.length;
  const openReports = (dashboard.reports || []).filter(r => r.status === 'open' || r.status === 'Open').length;
  const verifiedMembers = members.filter(m => m.verified).length;
  const verifiedPct = members.length ? Math.round(verifiedMembers / members.length * 100) : 0;
  const activeRoutes = driverRoutes.length;

  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">MODERATION CONSOLE</p>
          <h1>Campus safety overview</h1>
          <p>Review verification requests and community signals.</p>
        </div>
        <Badge tone="amber">ADMIN VIEW</Badge>
      </div>

      <div className="admin-stats">
        {[[pendingVerification, 'Awaiting verification'], [openReports, 'Open safety reports'], [`${verifiedPct}%`, 'Verified members'], [activeRoutes, 'Active driver routes']].map(([n, l]) => (
          <div className="card" key={l}><b>{n}</b><span>{l}</span></div>
        ))}
      </div>

      <section className="card table-card">
        <div className="section-heading">
          <h3>Driver routes & earnings</h3>
          <button className="text-button" onClick={() => setPage('members')}>View all →</button>
        </div>
        <div className="admin-table">
          <div className="table-head">
            <span>DRIVER</span>
            <span>ROUTE</span>
            <span>MEMBERS</span>
            <span>TOTAL COST</span>
          </div>
          {driverRoutes.length === 0 ? (
            <div className="table-row" style={{ padding: '20px', textAlign: 'center', color: '#71827d' }}>
              No driver routes yet.
            </div>
          ) : driverRoutes.slice(0, 5).map(route => (
            <div className="table-row" key={route.id}>
              <div>
                <Avatar initials={initials(route.driver_name)} small color={roleColors[route.id % roleColors.length]} />
                <b>{route.driver_name}</b>
              </div>
              <span>{route.origin} → {route.destination}</span>
              <span>{route.member_count || 0} / {route.seats_total || 0} seats</span>
              <span>Rs. {Number(route.total_collected || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card table-card" style={{ marginTop: '21px' }}>
        <div className="section-heading">
          <h3>Verification queue</h3>
          <button className="text-button" onClick={() => setPage('verify')}>View all →</button>
        </div>
        <div className="admin-table">
          <div className="table-head">
            <span>STUDENT</span>
            <span>EMAIL</span>
            <span>REQUESTED</span>
            <span />
          </div>
          {verifyQueue.slice(0, 5).length === 0 ? (
            <div className="table-row" style={{ padding: '20px', textAlign: 'center', color: '#71827d' }}>
              All members verified.
            </div>
          ) : verifyQueue.slice(0, 5).map(member => (
            <div className="table-row" key={member.id}>
              <div>
                <Avatar initials={initials(member.full_name)} small color={roleColors[member.id % roleColors.length]} />
                <b>{member.full_name}</b>
              </div>
              <span>{member.email}</span>
              <span>{new Date(member.created_at).toLocaleDateString()}</span>
              <button className="outline teal" onClick={() => onVerify(member.id)}>Verify</button>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function Verifications({ verified, setVerified }) { const people = ['Aiman Iqbal','Zain Ahmed','Hira Saleem','Usman Tariq']; return <main className="content"><div className="page-heading"><div><p className="eyebrow">ACCOUNT REVIEW</p><h1>Student verifications</h1><p>Approve campus-email verification requests for safe access.</p></div><Badge tone="amber">{people.filter(x => !verified.includes(x)).length} TO REVIEW</Badge></div><section className="card table-card"><div className="admin-table"><div className="table-head"><span>STUDENT</span><span>CAMPUS EMAIL</span><span>SUBMITTED</span><span /></div>{people.map((name,i) => <div className="table-row" key={name}><div><Avatar initials={name.split(' ').map(x=>x[0]).join('')} small color={['#c06c49','#486d85','#947454','#607f65'][i]}/><b>{name}</b></div><span>{name.toLowerCase().replace(' ', '.')}@nu.edu.pk</span><span>Sep {4-i}</span>{verified.includes(name) ? <Badge tone="green">✓ VERIFIED</Badge> : <button className="solid" onClick={() => setVerified(items => [...items, name])}>Verify student</button>}</div>)}</div></section></main>; }

function Reports() { const [reports, setReports] = useState([{id:1, subject:'Late pickup concern', name:'Anonymous rider', status:'Open'}, {id:2, subject:'Profile information review', name:'Maham Siddiqui', status:'Open'}]); const resolve = id => setReports(rows => rows.map(r => r.id === id ? {...r,status:'Resolved'} : r)); return <main className="content"><div className="page-heading"><div><p className="eyebrow">SAFETY MODERATION</p><h1>Safety reports</h1><p>Review concerns and take action on behalf of the campus community.</p></div><Badge tone="amber">{reports.filter(r => r.status === 'Open').length} OPEN</Badge></div><section className="request-list">{reports.map(report => <article className="card driver-request" key={report.id}><span className="report-icon">⚑</span><div className="request-person"><b>{report.subject}</b><span>Submitted by {report.name}</span><p>This is demo data for the moderation workflow.</p><small>Status: {report.status}</small></div><div className="request-actions">{report.status === 'Open' ? <button className="solid" onClick={() => resolve(report.id)}>Mark resolved</button> : <Badge tone="green">✓ RESOLVED</Badge>}</div></article>)}</section></main>; }

function Members() { const [suspended, setSuspended] = useState([]); const members = ['Danish Khan','Rimsha Malik','Maham Siddiqui','Hassan Ali']; return <main className="content"><div className="page-heading"><div><p className="eyebrow">COMMUNITY DIRECTORY</p><h1>Campus members</h1><p>View demo user status and moderation controls.</p></div></div><section className="card table-card"><div className="admin-table"><div className="table-head"><span>MEMBER</span><span>ROLE</span><span>STATUS</span><span /></div>{members.map((name,i) => <div className="table-row" key={name}><div><Avatar initials={name.split(' ').map(x=>x[0]).join('')} small color={['#c06c49','#ae754b','#8d6b9f','#486d85'][i]}/><b>{name}</b></div><span>{i === 0 || i === 3 ? 'Driver' : 'Rider'}</span><span>{suspended.includes(name) ? 'Suspended' : 'Verified'}</span><button className="outline" onClick={() => setSuspended(items => items.includes(name) ? items.filter(x=>x!==name) : [...items,name])}>{suspended.includes(name) ? 'Restore' : 'Suspend'}</button></div>)}</div></section></main>; }

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', role: 'rider' });
  const [status, setStatus] = useState({ loading: false, error: '' });
    useEffect(() => { 
    const logoutMessage = localStorage.getItem('carpool-campus-logout');
    if (logoutMessage) { setStatus({ loading: false, error: logoutMessage }); localStorage.removeItem('carpool-campus-logout'); }
  }, []);
  useEffect(() => {
    const roleSelect = document.querySelector('.auth-form select[name="role"]');
    if (roleSelect && !roleSelect.querySelector('option[value="admin"]')) {
      roleSelect.append(new Option('A campus administrator', 'admin'));
    }
    const emailInput = document.querySelector('.auth-form input[name="email"]');
    if (emailInput) emailInput.placeholder = 'you@gmail.com';
  }, [mode]);

  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const submit = async event => {
    event.preventDefault();
    setStatus({ loading: true, error: '', success: '' });
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Authentication failed.');
      localStorage.setItem('carpool-campus-token', data.token);
      onAuthenticated(data.user);
    } catch (error) {
      setStatus({ loading: false, error: error.message === 'Failed to fetch' ? 'The API is offline. Start it with npm run api.' : error.message });
    }
  };

  return <main className="auth-page"><section className="auth-visual"><div className="auth-brand"><span className="brand-mark"><BrandIcon/></span><b>Carpool<span>Campus</span></b></div><div className="auth-story"><p className="eyebrow">THE CAMPUS COMMUTE, RECONNECTED</p><h1>Share the ride.<br/><em>Keep your day moving.</em></h1><p>Find trusted students heading your way, split the cost fairly, and make every commute feel a little lighter.</p><div className="auth-route"><span>A</span><i></i><span>B</span><small>DHA Phase 6 <b>→</b> FAST-NU Campus</small></div></div><p className="auth-footnote">Verified students only · Built for campus communities</p></section><section className="auth-panel"><div className="auth-panel-inner"><div className="auth-mobile-heading"><p className="eyebrow">WELCOME TO CARPOOLCAMPUS</p><h2>{mode === 'login' ? 'Good to see you again.' : 'Your next commute starts here.'}</h2></div><div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setStatus({ loading: false, error: '' }); }}>Sign in</button><button className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setStatus({ loading: false, error: '' }); }}>Create account</button></div><form className="auth-form" onSubmit={submit}>{mode === 'register' && <label>Full name<input name="fullName" value={form.fullName} onChange={update} placeholder="e.g. Rimsha Malik" autoComplete="name" required /></label>}<label>Campus email<input name="email" value={form.email} onChange={update} type="email" placeholder="you@nu.edu.pk" autoComplete="email" required /></label><label>Password<input name="password" value={form.password} onChange={update} type="password" placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} required /></label>{mode === 'register' && <label>I'm joining as<select name="role" value={form.role} onChange={update}><option value="rider">A rider looking for a seat</option><option value="driver">A driver with spare seats</option></select></label>}{status.error && <p className="auth-error" role="alert">{status.error}</p>}<button className="solid auth-submit" disabled={status.loading}>{status.loading ? 'Connecting…' : mode === 'login' ? 'Sign in to your campus' : 'Create my account'}</button></form><p className="auth-terms">Use your <b>@nu.edu.pk</b> email. Your account will be verified by the campus team.</p></div></section></main>;
}

function App() { const [user, setUser] = useState(null); const [page, setPage] = useState('overview'); const [role, setRole] = useState('rider'); const [requests, setRequests] = useState([]); const [menu, setMenu] = useState(false); const [driverStatus, setDriverStatus] = useState(false); const [decisions, setDecisions] = useState({}); const [verified, setVerified] = useState([]); const approvedCount = Object.values(decisions).filter(x => x === 'approved').length; const handleAuth = authenticatedUser => { setUser(authenticatedUser); setRole(authenticatedUser.role); }; const handleLogout = () => { localStorage.removeItem('carpool-campus-token'); localStorage.setItem('carpool-campus-logout', 'Successfully logged out.'); setUser(null); }; if (!user) return <AuthScreen onAuthenticated={handleAuth}/>; const riderContent = { overview: <Overview setPage={setPage}/>, matches: <Matches requests={requests} setRequests={setRequests}/>, routes: <RouteForm setPage={setPage}/>, trips: <Trips/>, safety: <Safety/> }; const driverContent = { overview: <DriverOverview setPage={setPage} driverStatus={driverStatus} setDriverStatus={setDriverStatus} approvedCount={approvedCount}/>, requests: <DriverRequests decisions={decisions} setDecisions={setDecisions}/>, routes: <RouteForm setPage={setPage}/>, trips: <DriverTrips driverStatus={driverStatus} setDriverStatus={setDriverStatus}/>, earnings: <Earnings/> }; const adminContent = { overview: <AdminPreview setPage={setPage} verified={verified}/>, verify: <Verifications verified={verified} setVerified={setVerified}/>, reports: <Reports/>, members: <Members/> }; const content = (role === 'rider' ? riderContent : role === 'driver' ? driverContent : adminContent)[page] || (role === 'rider' ? riderContent.overview : role === 'driver' ? driverContent.overview : adminContent.overview); return <div className="app-shell"><Sidebar page={page} setPage={p=>{setPage(p);setMenu(false)}} collapsed={menu} role={role} setRole={setRole} onLogout={handleLogout}/><Header setPage={setPage} role={role}/><button className="mobile-menu" onClick={()=>setMenu(!menu)}>☰</button>{content}<footer>CarpoolCampus · Interactive frontend demo <span>Signed in as {user.fullName || user.email}.</span></footer></div>; }

function LiveOverview({ user, dashboard, setPage }) {
  const isDriver = user.role === 'driver';
  const count = isDriver ? dashboard.requests.length : dashboard.trips.length;
  const notifyRiders = async () => { const trip = dashboard.trips[0]; if (!trip) return; const response = await fetch(`/api/trips/${trip.id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('carpool-campus-token')}` }, body: JSON.stringify({ message: `${user.fullName} is on the way for ${trip.origin} → ${trip.destination}.` }) }); if (response.ok) window.alert('Confirmed riders have been notified.'); };
  return <main className="content"><div className="page-heading"><div><p className="eyebrow">{user.role.toUpperCase()} DASHBOARD</p><h1>Welcome, {user.fullName || user.email}</h1><p>Your dashboard is synced with the latest campus activity.</p></div></div><div className="admin-stats"><div className="card"><b>{dashboard.routes.length}</b><span>{isDriver ? 'Driver routes' : 'Available routes'}</span></div><div className="card"><b>{count}</b><span>{isDriver ? 'Ride requests' : 'Your trips'}</span></div><div className="card"><b>{dashboard.notifications?.length || 0}</b><span>Notifications</span></div></div><section className="card live-panel"><p className="eyebrow">LIVE DATA</p><h2>{count ? 'Your latest activity' : 'No activity yet'}</h2><p>{count ? 'This summary reflects your latest platform activity.' : isDriver ? 'Post a route to start receiving rider requests.' : 'Find a driver route or post your commute to get started.'}</p><div className="live-actions"><button className="solid" onClick={() => setPage(isDriver ? 'routes' : 'matches')}>{isDriver ? 'Post a route' : 'Find a ride'}</button>{isDriver && <button className="outline teal" onClick={notifyRiders}>I’m on my way</button>}</div>{dashboard.notifications?.slice(0, 3).map(notification => <p className="notification-row" key={notification.id}><b>{notification.title}</b> {notification.body}</p>)}</section></main>;
}

function SavedRoutes({ routes, loading, error, onEdit, onDelete, onAdd }) {
  return (
    <section className="card saved-routes">
      <div className="section-heading">
        <div>
          <p className="eyebrow">SAVED ROUTES</p>
          <h2>My saved routes</h2>
        </div>
        <button className="outline teal" onClick={onAdd}>+ Add new route</button>
      </div>
      {loading ? (
        <p>Loading saved routes...</p>
      ) : error ? (
        <div className="saved-route-empty">
          <p>{error}</p>
          <button className="outline teal" onClick={onAdd}>Try again</button>
        </div>
      ) : routes.length ? (
        <div className="saved-route-list">
          {routes.map(route => (
            <article key={route.id}>
              <div>
                <b>{route.origin} → {route.destination}</b>
                <span>Pickup: {route.pickup_area} · {route.departure_time?.slice(0, 5)} · {(route.days_of_week || []).join(' · ')}</span>
                {route.role === 'driver' && (
                  <div style={{ marginTop: '6px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Badge tone={Number(route.seats_available) === 0 ? 'teal' : 'green'}>
                      {Number(route.seats_available) === 0
                        ? `✓ ALL ${route.seats_total || 0} SEATS FULL`
                        : `${route.seats_available} OF ${route.seats_total || route.seats_available} SEATS REMAINING`}
                    </Badge>
                  </div>
                )}
              </div>
              <div className="saved-route-actions">
                <button className="outline teal" onClick={() => onEdit(route)}>Edit</button>
                <button className="outline danger" onClick={() => onDelete(route.id)}>Delete</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="saved-route-empty">
          <p>No saved routes yet.</p>
          <button className="solid" onClick={onAdd}>Add your first route</button>
        </div>
      )}
    </section>
  );
}

function LiveRouteForm({ user, onSaved }) {
  const [form, setForm] = useState({ origin: '', destination: '', pickupArea: '', originLat: null, originLng: null, destinationLat: null, destinationLng: null, pickupLat: null, pickupLng: null, distanceKm: '', totalCost: 0, seatsTotal: user.role === 'driver' ? 3 : 0, seatsAvailable: user.role === 'driver' ? 3 : 0, departureTime: '', daysOfWeek: ['Mon', 'Wed', 'Fri'], role: user.role });
  const [activePoint, setActivePoint] = useState('origin');
  const [points, setPoints] = useState({ origin: null, destination: null, pickup: null });
  const [mapCenter, setMapCenter] = useState(null);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [savedRoute, setSavedRoute] = useState(null);
  const [savedRoutes, setSavedRoutes] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [loadingRoutes, setLoadingRoutes] = useState(true);
  const [routesError, setRoutesError] = useState('');
  const token = localStorage.getItem('carpool-campus-token');
  const blankForm = () => ({ origin: '', destination: '', pickupArea: '', originLat: null, originLng: null, destinationLat: null, destinationLng: null, pickupLat: null, pickupLng: null, distanceKm: '', totalCost: 0, seatsTotal: user.role === 'driver' ? 3 : 0, seatsAvailable: user.role === 'driver' ? 3 : 0, departureTime: '', daysOfWeek: ['Mon', 'Wed', 'Fri'], role: user.role });
  const loadRoutes = () => { setLoadingRoutes(true); setRoutesError(''); fetchJson('/api/my-routes', { headers: { Authorization: `Bearer ${token}` } }).then(data => setSavedRoutes(data.routes || [])).catch(error => setRoutesError(error.name === 'AbortError' ? 'The route service took too long to respond.' : error.message)).finally(() => setLoadingRoutes(false)); };
  useEffect(() => { loadRoutes(); }, []);
  useEffect(() => {
    const handleRouteEdit = event => { const route = event.detail; setEditingId(route.id); setSavedRoute(null); setMessage('Editing route...'); setForm(current => ({ ...current, origin: route.origin, destination: route.destination, pickupArea: route.pickup_area, originLat: route.origin_lat, originLng: route.origin_lng, destinationLat: route.destination_lat, destinationLng: route.destination_lng, pickupLat: route.pickup_lat, pickupLng: route.pickup_lng, departureTime: route.departure_time?.slice(0, 5), daysOfWeek: route.days_of_week || [], seatsTotal: route.seats_total || 3, seatsAvailable: route.seats_available })); setPoints({ origin: route.origin_lat ? { lat: Number(route.origin_lat), lng: Number(route.origin_lng) } : null, destination: route.destination_lat ? { lat: Number(route.destination_lat), lng: Number(route.destination_lng) } : null, pickup: route.pickup_lat ? { lat: Number(route.pickup_lat), lng: Number(route.pickup_lng) } : null }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const handleRouteAdd = () => { setEditingId(null); setSavedRoute(null); setMessage(''); setForm(blankForm()); setPoints({ origin: null, destination: null, pickup: null }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    window.addEventListener('carpool-route-edit', handleRouteEdit); window.addEventListener('carpool-route-add', handleRouteAdd);
    return () => { window.removeEventListener('carpool-route-edit', handleRouteEdit); window.removeEventListener('carpool-route-add', handleRouteAdd); };
  }, []);
  useEffect(() => {
    const fields = [['origin', 'origin'], ['destination', 'destination'], ['pickupArea', 'pickup']];
    const cleanups = fields.map(([name, point]) => {
      const input = document.querySelector(`.route-form input[name="${name}"]`);
      if (!input) return () => {};
      const activate = () => setActivePoint(point);
      input.addEventListener('focus', activate);
      input.addEventListener('click', activate);
      return () => { input.removeEventListener('focus', activate); input.removeEventListener('click', activate); };
    });
    return () => cleanups.forEach(cleanup => cleanup());
  }, []);
  const update = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));
  const reverseGeocode = async latlng => { try { const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latlng.lat}&lon=${latlng.lng}`, { headers: { Accept: 'application/json' } }); const data = await response.json(); return data.display_name?.split(',').slice(0, 2).join(',') || `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`; } catch { return `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`; } };
  const pickPoint = async (point, latlng, label) => { const place = label || await reverseGeocode(latlng); setPoints(current => ({ ...current, [point]: latlng })); setMapCenter(latlng); setForm(current => ({ ...current, [point === 'pickup' ? 'pickupArea' : point]: place, [`${point}Lat`]: latlng.lat, [`${point}Lng`]: latlng.lng })); };
  const searchPlace = async event => { event.preventDefault(); if (!search.trim()) return; setSearching(true); try { const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(search + ', Lahore, Pakistan')}`, { headers: { Accept: 'application/json' } }); const results = await response.json(); if (!results[0]) { setMessage('Location not found. Try a nearby area or landmark.'); return; } const latlng = { lat: Number(results[0].lat), lng: Number(results[0].lon) }; await pickPoint(activePoint, latlng, results[0].display_name.split(',').slice(0, 2).join(',')); } catch { setMessage('Could not search this location right now.'); } finally { setSearching(false); } };
  const useCurrentLocation = () => navigator.geolocation?.getCurrentPosition(position => pickPoint('origin', { lat: position.coords.latitude, lng: position.coords.longitude }, 'Current location'), () => setMessage('Location permission was not available.'));
  const submit = async event => { event.preventDefault(); setMessage('Saving route...'); const response = await fetch(editingId ? `/api/routes/${editingId}` : '/api/routes', { method: editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(form) }); const data = await response.json(); if (!response.ok) return setMessage(data.message); setSavedRoute(data.route); setMessage(editingId ? 'Route updated successfully.' : 'Route saved successfully.'); setEditingId(null); loadRoutes(); window.dispatchEvent(new Event('carpool-route-saved')); };
  const editRoute = route => { setEditingId(route.id); setSavedRoute(null); setMessage('Editing route...'); setForm({ ...form, origin: route.origin, destination: route.destination, pickupArea: route.pickup_area, originLat: route.origin_lat, originLng: route.origin_lng, destinationLat: route.destination_lat, destinationLng: route.destination_lng, pickupLat: route.pickup_lat, pickupLng: route.pickup_lng, departureTime: route.departure_time?.slice(0, 5), daysOfWeek: route.days_of_week || [], seatsTotal: route.seats_total || 3, seatsAvailable: route.seats_available }); setPoints({ origin: route.origin_lat ? { lat: Number(route.origin_lat), lng: Number(route.origin_lng) } : null, destination: route.destination_lat ? { lat: Number(route.destination_lat), lng: Number(route.destination_lng) } : null, pickup: route.pickup_lat ? { lat: Number(route.pickup_lat), lng: Number(route.pickup_lng) } : null }); };
  const deleteRoute = async id => { if (!window.confirm('Delete this saved route?')) return; await fetch(`/api/routes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); setSavedRoutes(routes => routes.filter(route => route.id !== id)); if (editingId === id) { setEditingId(null); setForm(blankForm()); setMessage('Route deleted.'); } };
  const pricingFields = user.role === 'driver' && <div className="driver-pricing-fields"><label>Distance (km)<input name="distanceKm" type="number" min="1" step="0.1" value={form.distanceKm} onChange={update} placeholder="e.g. 30" required /></label><label>Total trip cost (PKR)<input name="totalCost" type="number" min="0" value={form.totalCost} onChange={update} placeholder="e.g. 1500" required /></label><label>Total vehicle seats<input name="seatsTotal" type="number" min="1" value={form.seatsTotal} onChange={event => setForm(current => ({ ...current, seatsTotal: Number(event.target.value), seatsAvailable: Math.min(current.seatsAvailable || Number(event.target.value), Number(event.target.value)) }))} required /></label><label>Remaining seats<input name="seatsAvailable" type="number" min="0" max={form.seatsTotal} value={form.seatsAvailable} onChange={update} required /></label></div>;
  const addRoute = () => { setEditingId(null); setSavedRoute(null); setMessage(''); setForm(blankForm()); setPoints({ origin: null, destination: null, pickup: null }); };
  return <main className="content route-page"><div className="page-heading"><div><p className="eyebrow">CHOOSE YOUR ROUTE ON THE MAP</p><h1>Share your commute</h1><p>Select Origin, Destination, and Pickup area on the map. Your approximate points are stored with the route.</p></div></div><div className="map-route-layout"><form className="card route-form" onSubmit={submit}><div className="map-point-tabs"><button type="button" className={activePoint === 'origin' ? 'active' : ''} onClick={() => setActivePoint('origin')}>A <span>Origin</span></button><button type="button" className={activePoint === 'destination' ? 'active' : ''} onClick={() => setActivePoint('destination')}>B <span>Destination</span></button><button type="button" className={activePoint === 'pickup' ? 'active' : ''} onClick={() => setActivePoint('pickup')}>P <span>Pickup area</span></button></div><div className="field-grid"><label>Origin<input name="origin" value={form.origin} onChange={update} placeholder="e.g. DHA Phase 6" required /></label><label>Destination<input name="destination" value={form.destination} onChange={update} placeholder="e.g. FAST Campus" required /></label></div><label>Pickup area<input name="pickupArea" value={form.pickupArea} onChange={update} placeholder="e.g. Y Block Market" required /></label><p className="privacy-note">Click the map while a point is active. Exact home addresses are never shown.</p><div className="field-grid"><label>Departure time<input name="departureTime" type="time" value={form.departureTime} onChange={update} required /></label>{user.role === 'driver' && <label>Vehicle seats for riders<input name="seatsTotal" type="number" min="1" max="8" value={form.seatsTotal || form.seatsAvailable || 3} onChange={e => { const val = Number(e.target.value); setForm(current => ({ ...current, seatsTotal: val, seatsAvailable: editingId ? Math.min(current.seatsAvailable, val) : val })); }} required /></label>}</div><button className="solid" type="submit">Save route</button>{message && <p className="auth-error">{message}</p>}</form><section className="card route-map-panel"><div className="section-heading"><div><p className="eyebrow">OPENSTREETMAP</p><h3>Select {activePoint === 'pickup' ? 'pickup area' : activePoint}</h3></div><span className="map-hint">Click to place</span></div><RouteMapPicker points={points} activePoint={activePoint} onPick={pickPoint}/></section></div></main>;
}

function SavedRoutesPanel({ user, initialRoutes = EMPTY_ROUTES, availableRoutes = EMPTY_ROUTES, onViewMatches }) {
  const [routes, setRoutes] = useState(initialRoutes);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const token = localStorage.getItem('carpool-campus-token');
  const load = () => { setLoading(true); setError(''); fetchJson('/api/my-routes', { headers: { Authorization: `Bearer ${token}` } }).then(data => setRoutes(data.routes || [])).catch(fetchError => setError(fetchError.name === 'AbortError' ? 'The route service took too long to respond.' : fetchError.message)).finally(() => setLoading(false)); };
  useEffect(() => { setRoutes(initialRoutes); setLoading(false); if (!initialRoutes.length) load(); const refresh = () => load(); window.addEventListener('carpool-route-saved', refresh); return () => window.removeEventListener('carpool-route-saved', refresh); }, [initialRoutes]);
  const remove = async id => { if (!window.confirm('Delete this saved route?')) return; await fetch(`/api/routes/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }); load(); };
  return <section className="content saved-routes-content"><SavedRoutes routes={routes} loading={loading} error={error} onEdit={route => window.dispatchEvent(new CustomEvent('carpool-route-edit', { detail: route }))} onDelete={remove} onAdd={() => { setError(''); window.dispatchEvent(new Event('carpool-route-add')); }} />{user.role === 'rider' && <section className="card saved-routes available-driver-routes"><div className="section-heading"><div><p className="eyebrow">MATCHED DRIVER ROUTES</p><h2>Available driver routes</h2></div><span className="map-hint">{availableRoutes.length} available</span></div>{availableRoutes.length ? <div className="saved-route-list">{availableRoutes.map(route => <article key={route.id}><div><b>{route.full_name}: {route.origin} → {route.destination}</b><span>Pickup: {route.pickup_area} · {route.departure_time?.slice(0, 5)} · {route.seats_available} seats available</span></div><button className="outline teal" onClick={onViewMatches}>View and request</button></article>)}</div> : <div className="saved-route-empty"><p>No driver routes match your commute yet.</p></div>}</section>}</section>;
}

function RouteWorkspace({ user, initialRoutes = EMPTY_ROUTES, availableRoutes = EMPTY_ROUTES, onViewMatches }) { return <><LiveRouteForm user={user}/><SavedRoutesPanel user={user} initialRoutes={initialRoutes} availableRoutes={availableRoutes} onViewMatches={onViewMatches}/>{user.role === 'driver' && <DriverCostSplit routes={initialRoutes}/>}</>; }

function DriverCostSplit({ routes }) {
  const [routeId, setRouteId] = useState(routes[0]?.id || '');
  const selected = routes.find(route => String(route.id) === String(routeId));
  const [form, setForm] = useState({ distanceKm: selected?.distance_km || '', totalCost: selected?.total_cost || '', seatsTotal: selected?.seats_total || selected?.seats_available || 3 });
  const [message, setMessage] = useState('');
  useEffect(() => { const next = routes.find(route => String(route.id) === String(routeId)) || routes[0]; if (next) { setRouteId(next.id); setForm({ distanceKm: next.distance_km || '', totalCost: next.total_cost || '', seatsTotal: next.seats_total || next.seats_available || 3 }); } }, [routes, routeId]);
  const save = async event => { event.preventDefault(); const response = await fetch(`/api/routes/${routeId}/pricing`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('carpool-campus-token')}` }, body: JSON.stringify(form) }); const data = await response.json(); setMessage(response.ok ? `Saved: Rs. ${data.sharePerSeat} per seat · ${data.route.seats_available} seats remaining` : data.message); };
  if (!routes.length) return null;
  return <section className="card driver-cost-split"><div className="section-heading"><div><p className="eyebrow">DRIVER COST SPLIT</p><h2>Set route price</h2></div><span className="map-hint">Riders see this automatically</span></div><form onSubmit={save}><label>Route<select value={routeId} onChange={event => setRouteId(event.target.value)}>{routes.map(route => <option key={route.id} value={route.id}>{route.origin} → {route.destination}</option>)}</select></label><div className="field-grid"><label>Distance (km)<input type="number" min="1" step="0.1" value={form.distanceKm} onChange={event => setForm({ ...form, distanceKm: event.target.value })} required /></label><label>Total cost (PKR)<input type="number" min="0" value={form.totalCost} onChange={event => setForm({ ...form, totalCost: event.target.value })} required /></label><label>Total seats<input type="number" min="1" value={form.seatsTotal} onChange={event => setForm({ ...form, seatsTotal: event.target.value })} required /></label></div><p className="cost-preview">Per seat: <b>Rs. {form.seatsTotal ? Math.round(Number(form.totalCost || 0) / Number(form.seatsTotal)) : 0}</b> · Remaining seats: <b>{selected?.seats_available ?? form.seatsTotal}</b></p><button className="solid" type="submit">Save cost split</button>{message && <p className="auth-success">{message}</p>}</form></section>;
}

function TripChatBox({ routeId, messages = [], currentUser, onRefresh }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const sendMessage = async (contentToSend) => {
    const msg = (contentToSend || text).trim();
    if (!msg) return;
    setSending(true);
    const token = localStorage.getItem('carpool-campus-token');
    try {
      const res = await fetch(`/api/routes/${routeId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ message: msg })
      });
      if (res.ok) {
        setText('');
        if (onRefresh) onRefresh();
      } else {
        const data = await res.json();
        alert(data.message || 'Could not send message.');
      }
    } catch (e) {
      alert('Network error sending message.');
    } finally {
      setSending(false);
    }
  };

  const quickReplies = [
    "I'm at the pickup point!",
    "Running 2-3 mins late",
    "Where are you waiting?",
    "All set for today's ride"
  ];

  return (
    <div className="trip-chat-box">
      <div className="trip-chat-header">
        <h4>💬 Carpool Group Chat</h4>
        <Badge tone="teal">{messages.length} message{messages.length === 1 ? '' : 's'}</Badge>
      </div>

      <div className="trip-chat-messages">
        {messages.length === 0 ? (
          <div className="trip-chat-empty">
            No messages yet. Send a note to everyone in this carpool!
          </div>
        ) : (
          messages.map(m => {
            const isMe = Number(m.sender_id) === Number(currentUser.id);
            const isDriver = m.sender_role === 'driver';
            return (
              <div key={m.id} className={`chat-message ${isMe ? 'is-me' : ''}`}>
                <div className="chat-sender-line">
                  <span className="chat-sender-name">{isMe ? 'You' : m.sender_name}</span>
                  <span className={`chat-role-badge ${isDriver ? 'driver' : 'rider'}`}>
                    {isDriver ? 'Driver' : 'Rider'}
                  </span>
                </div>
                <div className="chat-bubble">{m.message}</div>
                <span className="chat-time">
                  {new Date(m.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="chat-quick-replies">
        {quickReplies.map((qr, idx) => (
          <button
            key={idx}
            type="button"
            className="quick-reply-btn"
            disabled={sending}
            onClick={() => sendMessage(qr)}
          >
            {qr}
          </button>
        ))}
      </div>

      <form
        className="trip-chat-input-bar"
        onSubmit={e => {
          e.preventDefault();
          sendMessage();
        }}
      >
        <input
          className="trip-chat-input"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message to driver & riders..."
          disabled={sending}
        />
        <button
          type="submit"
          className="trip-chat-send-btn"
          disabled={sending || !text.trim()}
        >
          {sending ? '...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

function DriverLiveControls({ route, onUpdate }) {
  const [message, setMessage] = useState(route.driver_status_message || "I am on my way to pick you up!");
  const [sending, setSending] = useState(false);
  const [statusResult, setStatusResult] = useState('');

  const seatsTotal = Number(route.seats_total || 0);
  const seatsAvailable = Number(route.seats_available || 0);
  const isFull = seatsAvailable === 0 && seatsTotal > 0;

  const sendStatus = async (action, lat = null, lng = null) => {
    setSending(true);
    setStatusResult('');
    const token = localStorage.getItem('carpool-campus-token');
    try {
      const res = await fetch(`/api/routes/${route.id}/driver-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action,
          message: message || "I am on my way to pick you up!",
          lat,
          lng
        })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Could not send status.');
      } else {
        setStatusResult(
          action === 'location_only'
            ? `✓ Live location broadcasted to ${data.notifiedCount} rider(s)!`
            : `✓ "I am on the way" sent to all ${data.notifiedCount} approved rider(s)!`
        );
        if (onUpdate) onUpdate();
      }
    } catch (e) {
      alert('Network error sending status.');
    } finally {
      setSending(false);
    }
  };

  const shareLiveLocation = () => {
    setSending(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          sendStatus('location_only', pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          sendStatus('location_only', route.origin_lat || route.pickup_lat, route.origin_lng || route.pickup_lng);
        },
        { timeout: 8000 }
      );
    } else {
      sendStatus('location_only', route.origin_lat || route.pickup_lat, route.origin_lng || route.pickup_lng);
    }
  };

  const sendOnTheWay = () => {
    if (!isFull) {
      alert(`Cannot send "I am on the way" until all seats are filled. Waiting for ${seatsAvailable} more rider(s).`);
      return;
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          sendStatus('on_the_way', pos.coords.latitude, pos.coords.longitude);
        },
        () => {
          sendStatus('on_the_way', route.driver_lat || route.origin_lat, route.driver_lng || route.origin_lng);
        },
        { timeout: 8000 }
      );
    } else {
      sendStatus('on_the_way', route.driver_lat || route.origin_lat, route.driver_lng || route.origin_lng);
    }
  };

  return (
    <div className="driver-control-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4>⚡ Driver Commute Controls</h4>
        <span style={{ fontSize: '11px', color: isFull ? '#0e746b' : '#92540e', fontWeight: 700 }}>
          {isFull ? '● All seats full — Journey ready' : `Waiting for ${seatsAvailable} more rider(s)`}
        </span>
      </div>

      <div className="driver-control-actions">
        <input
          className="driver-msg-input"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="Type message e.g. I am on my way!"
        />
        <button
          className="solid"
          disabled={sending || !isFull}
          title={!isFull ? `Locked until all seats are filled (waiting for ${seatsAvailable} more rider(s))` : ''}
          onClick={sendOnTheWay}
          style={{ opacity: !isFull ? 0.55 : 1, cursor: !isFull ? 'not-allowed' : 'pointer' }}
        >
          {sending ? 'Sending…' : isFull ? '🚀 Send "I am on my way"' : `🔒 Locked (${seatsAvailable} seats left)`}
        </button>
        <button
          className="outline teal"
          disabled={sending}
          onClick={shareLiveLocation}
          title="Share your live location anytime with approved riders"
        >
          📍 Share Live Location
        </button>
      </div>

      {!isFull && (
        <div className="driver-locked-notice">
          <span>🔒</span>
          <span>"I am on the way" is locked until all {seatsTotal} seats are filled ({seatsAvailable} remaining). However, you can share your live location anytime using the button above.</span>
        </div>
      )}

      {statusResult && (
        <span style={{ fontSize: '12px', fontWeight: 700, color: '#0e746b' }}>
          {statusResult}
        </span>
      )}

      {route.driver_lat && route.driver_lng && (
        <div style={{ fontSize: '11px', color: '#3d6159', background: '#e9f6f1', padding: '8px 12px', borderRadius: '6px' }}>
          {route.driver_status === 'on_the_way' ? (
            <span>🚀 Status: <b>"I am on the way"</b> ({route.driver_status_message})</span>
          ) : (
            <span>📍 Live location broadcast active</span>
          )}
          <span> · Live GPS: <b>{Number(route.driver_lat).toFixed(4)}, {Number(route.driver_lng).toFixed(4)}</b></span>
          {route.driver_status_updated_at && (
            <span> · Updated: {new Date(route.driver_status_updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          )}
        </div>
      )}
    </div>
  );
}

function MyTrips({ user, dashboard, onRefresh }) {
  const isDriver = user.role === 'driver';

  if (isDriver) {
    const drives = dashboard.driverTrips && dashboard.driverTrips.length
      ? dashboard.driverTrips
      : (dashboard.myRoutes || []).filter(r => r.role === 'driver');

    return (
      <main className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">DRIVER COMMUTES</p>
            <h1>My trips</h1>
            <p>Manage your drive routes, confirmed passengers, and live updates.</p>
          </div>
          <Badge tone="teal">{drives.length} ACTIVE DRIVE{drives.length === 1 ? '' : 'S'}</Badge>
        </div>

        {drives.length === 0 ? (
          <section className="card" style={{ textAlign: 'center', padding: '40px 20px', color: '#73847f' }}>
            <h2>No drive routes posted yet</h2>
            <p style={{ margin: '8px 0 20px' }}>Post a drive route to start receiving rider requests.</p>
          </section>
        ) : (
          drives.map(drive => {
            const seatsTotal = Number(drive.seats_total || 0);
            const seatsAvailable = Number(drive.seats_available || 0);
            const seatsFilled = Math.max(0, seatsTotal - seatsAvailable);
            const isFull = seatsAvailable === 0 && seatsTotal > 0;
            const approvedRiders = Array.isArray(drive.approved_riders) ? drive.approved_riders : [];

            return (
              <section className="card trip-detail" key={drive.id} style={{ marginBottom: '24px' }}>
                <div className="trip-detail-head">
                  <div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                      <Badge tone={isFull ? 'green' : 'amber'}>
                        {isFull ? `✓ ALL ${seatsTotal} SEATS FILLED · CARPOOL FULL` : `${seatsFilled} OF ${seatsTotal} SEATS FILLED (${seatsAvailable} REMAINING)`}
                      </Badge>
                      {drive.driver_status === 'on_the_way' && (
                        <Badge tone="teal">● STATUS: ON THE WAY</Badge>
                      )}
                    </div>
                    <h2>{drive.origin} → {drive.destination}</h2>
                    <p>
                      Pickup: <b>{drive.pickup_area}</b> · Departure: <b>{formatTime(drive.departure_time)}</b> · Days: {(drive.days_of_week || []).join(', ') || 'Daily'}
                    </p>
                  </div>
                  <div>
                    <b style={{ color: '#0e746b', fontSize: '16px' }}>Rs. {drive.total_cost || 0} total</b>
                  </div>
                </div>

                {/* Seats Filled Auto-Alert Banner */}
                {isFull && (
                  <div className="driver-seats-filled-alert">
                    <div className="alert-content">
                      <span className="alert-icon">🚨</span>
                      <div>
                        <b>All {seatsTotal} seats are filled!</b>
                        <p>Your carpool is full! You can now start the journey or send "I am on the way" to all {approvedRiders.length} passengers.</p>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ margin: '16px 0' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.8px', color: '#758883' }}>
                    APPROVED PASSENGERS ({approvedRiders.length} / {seatsTotal})
                  </span>
                  {approvedRiders.length === 0 ? (
                    <p style={{ fontSize: '12px', color: '#888', margin: '6px 0' }}>No riders approved yet for this route.</p>
                  ) : (
                    <div className="passenger-pill-list" style={{ marginTop: '8px' }}>
                      {approvedRiders.map((rider, idx) => (
                        <div
                          key={rider.rider_id || idx}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: '#f4f8f6',
                            border: '1px solid #d8e5df',
                            padding: '8px 12px',
                            borderRadius: '8px',
                            fontSize: '12px'
                          }}
                        >
                          <Avatar initials={initials(rider.rider_name)} small color={roleColors[idx % roleColors.length]} />
                          <div>
                            <b>{rider.rider_name}</b>
                            <span style={{ display: 'block', fontSize: '11px', color: '#55726b' }}>
                              📍 Drop-off: <b>{rider.destination || drive.destination}</b>
                              {rider.pickup_area && <span> · Pickup: {rider.pickup_area}</span>}
                            </span>
                          </div>
                          <span style={{ marginLeft: 'auto', fontWeight: 700, color: '#0e746b' }}>
                            Rs. {rider.cost_per_rider || 0}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {seatsAvailable > 0 && (
                  <div className="waiting-banner">
                    <span>⏳ Waiting for <b>{seatsAvailable}</b> more rider{seatsAvailable > 1 ? 's' : ''} to fill the carpool</span>
                    <span className="waiting-dots"><span>.</span><span>.</span><span>.</span></span>
                  </div>
                )}

                {/* Driver Live Controls — location always enabled, 'on the way' locked until full */}
                <DriverLiveControls
                  route={drive}
                  onUpdate={onRefresh}
                />

                {drive.driver_lat && drive.driver_lng && (
                  <div className="mini-trip-map">
                    <MapContainer center={[Number(drive.driver_lat), Number(drive.driver_lng)]} zoom={13} style={{ height: '180px', width: '100%', borderRadius: '8px' }} scrollWheelZoom={false}>
                      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
                      <Marker position={[Number(drive.driver_lat), Number(drive.driver_lng)]} />
                    </MapContainer>
                  </div>
                )}

                {/* Trip Group Chat for Driver & All Passengers */}
                <TripChatBox
                  routeId={drive.id}
                  messages={drive.messages || []}
                  currentUser={user}
                  onRefresh={onRefresh}
                />
              </section>
            );
          })
        )}
      </main>
    );
  }

  // Rider View
  const riderTrips = dashboard.trips || [];
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">RECURRING COMMUTES</p>
          <h1>My trips</h1>
          <p>View your confirmed rides, driver updates, and co-passengers.</p>
        </div>
        <Badge tone="green">{riderTrips.length} CONFIRMED</Badge>
      </div>

      {riderTrips.length === 0 ? (
        <section className="card" style={{ textAlign: 'center', padding: '40px 20px', color: '#71827d' }}>
          <h2>No confirmed rides yet</h2>
          <p style={{ margin: '8px 0 20px' }}>
            Request a seat on an available driver route in "Find a ride". Once the driver approves, your ride details, co-passengers, and live updates will appear here.
          </p>
        </section>
      ) : (
        riderTrips.map(trip => {
          const seatsTotal = Number(trip.seats_total || 0);
          const seatsAvailable = Number(trip.seats_available || 0);
          const seatsFilled = Math.max(0, seatsTotal - seatsAvailable);
          const isFull = seatsAvailable === 0 && seatsTotal > 0;
          const coPassengers = Array.isArray(trip.co_passengers) ? trip.co_passengers : [];

          return (
            <section className="card trip-detail" key={trip.id} style={{ marginBottom: '24px' }}>
              <div className="trip-detail-head">
                <div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                    <Badge tone="green">CONFIRMED TRIP</Badge>
                    {isFull ? (
                      <Badge tone="teal">✓ ALL {seatsTotal} SEATS FILLED</Badge>
                    ) : (
                      <Badge tone="amber">{seatsFilled} OF {seatsTotal} SEATS FILLED ({seatsAvailable} REMAINING)</Badge>
                    )}
                  </div>
                  <h2>{trip.origin} → {trip.destination}</h2>
                  <p>
                    Pickup: <b>{trip.pickup_area}</b> · Departure: <b>{formatTime(trip.departure_time)}</b> · Days: {(trip.days_of_week || []).join(', ') || 'Daily'}
                  </p>
                </div>
                <div>
                  <b style={{ color: '#0e746b', fontSize: '18px' }}>Rs. {trip.cost_per_rider || 0}</b>
                  <small style={{ display: 'block', color: '#73847f', fontSize: '10px' }}>your share</small>
                </div>
              </div>

              {/* Driver Details Card */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '18px 0', padding: '12px 16px', background: '#f8faf9', borderRadius: '8px', border: '1px solid #e2ece7' }}>
                <Avatar initials={initials(trip.driver_name || 'Driver')} color="#c06c49" />
                <div>
                  <b style={{ fontSize: '14px', color: '#1a3a33' }}>{trip.driver_name || 'Assigned Driver'}</b>
                  <span style={{ display: 'block', fontSize: '11px', color: '#668079' }}>{trip.driver_email} · Verified Campus Driver</span>
                </div>
                <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                  <span style={{ fontSize: '11px', color: '#668079' }}>Your pickup: <b>{trip.pickup_area}</b></span>
                </div>
              </div>

              {/* Seats Status Banner */}
              {seatsAvailable > 0 ? (
                <div className="waiting-banner">
                  <span>⏳ Waiting for <b>{seatsAvailable}</b> more rider{seatsAvailable > 1 ? 's' : ''} to fill the carpool ({seatsFilled} of {seatsTotal} confirmed)</span>
                  <span className="waiting-dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
              ) : (
                <div className="full-carpool-badge">
                  <span>✓ Carpool full! All {seatsTotal} seats confirmed.</span>
                </div>
              )}

              {/* Co-Passengers List ("kn kn sa bnda hn unka name r vo kdr jy ga") */}
              <div className="co-passengers-card">
                <div className="co-passengers-head">
                  <span>👥 CARPOOL PASSENGERS ({coPassengers.length} OF {seatsTotal} SEATS)</span>
                  {isFull && <span className="carpool-full-tag">FULL</span>}
                </div>
                <div className="co-passengers-list">
                  {coPassengers.map((cp, idx) => {
                    const isMe = Number(cp.rider_id) === Number(user.id);
                    return (
                      <div className={`co-passenger-item ${isMe ? 'is-me' : ''}`} key={cp.rider_id || idx}>
                        <Avatar initials={initials(cp.rider_name)} small color={roleColors[idx % roleColors.length]} />
                        <div className="co-passenger-info">
                          <div className="co-passenger-name-row">
                            <b>{cp.rider_name}</b>
                            {isMe && <span className="self-tag">You</span>}
                          </div>
                          <span className="co-passenger-dest">
                            📍 Heading to: <b>{cp.destination || trip.destination}</b>
                            {cp.pickup_area && <span> · Pickup: {cp.pickup_area}</span>}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {seatsAvailable > 0 && (
                  <div className="co-passenger-waiting-hint">
                    ⏳ Still waiting for {seatsAvailable} more passenger{seatsAvailable > 1 ? 's' : ''} to join this carpool.
                  </div>
                )}
              </div>

              {/* Driver Live Status / Location */}
              {trip.driver_status === 'on_the_way' ? (
                <div className="driver-live-alert">
                  <div className="live-header">
                    <div className="live-title">
                      <span>🚀</span> <span>Driver is on the way!</span>
                    </div>
                    <Badge tone="green">LIVE COMMUTE</Badge>
                  </div>
                  <div className="live-message">
                    "{trip.driver_status_message || "I am on my way to pick you up!"}"
                  </div>
                  <div className="live-meta">
                    <span>Driver: <b>{trip.driver_name}</b></span>
                    {trip.driver_status_updated_at && (
                      <span>Time: <b>{new Date(trip.driver_status_updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b></span>
                    )}
                    {trip.driver_lat && trip.driver_lng && (
                      <span>GPS: <b>{Number(trip.driver_lat).toFixed(4)}, {Number(trip.driver_lng).toFixed(4)}</b></span>
                    )}
                  </div>
                  {trip.driver_lat && trip.driver_lng && (
                    <div className="mini-trip-map">
                      <MapContainer center={[Number(trip.driver_lat), Number(trip.driver_lng)]} zoom={13} style={{ height: '180px', width: '100%', borderRadius: '8px' }} scrollWheelZoom={false}>
                        <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
                        <Marker position={[Number(trip.driver_lat), Number(trip.driver_lng)]} />
                        {trip.pickup_lat && trip.pickup_lng && <Marker position={[Number(trip.pickup_lat), Number(trip.pickup_lng)]} />}
                      </MapContainer>
                    </div>
                  )}
                </div>
              ) : trip.driver_lat && trip.driver_lng ? (
                <div className="driver-live-alert">
                  <div className="live-header">
                    <div className="live-title">
                      <span>📍</span> <span>Driver Shared Live Location</span>
                    </div>
                    <Badge tone="teal">LOCATION SHARED</Badge>
                  </div>
                  <div className="live-meta">
                    <span>Driver: <b>{trip.driver_name}</b></span>
                    {trip.driver_status_updated_at && (
                      <span>Time: <b>{new Date(trip.driver_status_updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</b></span>
                    )}
                    <span>GPS: <b>{Number(trip.driver_lat).toFixed(4)}, {Number(trip.driver_lng).toFixed(4)}</b></span>
                  </div>
                  <div className="mini-trip-map">
                    <MapContainer center={[Number(trip.driver_lat), Number(trip.driver_lng)]} zoom={13} style={{ height: '180px', width: '100%', borderRadius: '8px' }} scrollWheelZoom={false}>
                      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
                      <Marker position={[Number(trip.driver_lat), Number(trip.driver_lng)]} />
                      {trip.pickup_lat && trip.pickup_lng && <Marker position={[Number(trip.pickup_lat), Number(trip.pickup_lng)]} />}
                    </MapContainer>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#6a817b', padding: '10px 0' }}>
                  ℹ️ Driver has not started this commute yet. Once the driver shares live location or starts the journey, real-time map tracking and arrival alerts will appear here.
                </div>
              )}

              {/* Trip Group Chat for Rider & Co-passengers & Driver */}
              <TripChatBox
                routeId={trip.route_id}
                messages={trip.messages || []}
                currentUser={user}
                onRefresh={onRefresh}
              />
            </section>
          );
        })
      )}
    </main>
  );
}

function LiveAdmin({ page, dashboard, setPage, onVerify, onSuspend }) {
  if (page === 'overview') {
    return <AdminPreview setPage={setPage} dashboard={dashboard} onVerify={onVerify} onSuspend={onSuspend} />;
  }

  if (page === 'members' || page === 'verify') {
    const members = dashboard.members || [];
    const filtered = page === 'verify' ? members.filter(m => !m.verified && m.role !== 'admin') : members;
    return (
      <main className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">COMMUNITY DIRECTORY</p>
            <h1>{page === 'verify' ? 'Student verifications' : 'Campus members'}</h1>
            <p>Up-to-date records for every campus account.</p>
          </div>
          <Badge tone={page === 'verify' ? 'amber' : 'teal'}>{filtered.length} {page === 'verify' ? 'TO REVIEW' : 'TOTAL'}</Badge>
        </div>
        <section className="card table-card">
          <div className="admin-table">
            <div className="table-head">
              <span>MEMBER</span>
              <span>EMAIL</span>
              <span>ROLE</span>
              <span>STATUS</span>
              <span />
            </div>
            {filtered.map(member => (
              <div className="table-row" key={member.id}>
                <div>
                  <Avatar initials={initials(member.full_name)} small color={roleColors[member.id % roleColors.length]} />
                  <b>{member.full_name}</b>
                </div>
                <span>{member.email}</span>
                <span>{member.role}</span>
                <Badge tone={member.verified ? 'green' : 'amber'}>{member.verified ? 'VERIFIED' : 'PENDING'}</Badge>
                {member.verified ? (
                  <button className="outline danger" onClick={() => onSuspend(member.id)}>Suspend</button>
                ) : (
                  <button className="solid" onClick={() => onVerify(member.id)}>Verify</button>
                )}
              </div>
            ))}
            {!filtered.length && (
              <div className="table-row" style={{ padding: '20px', textAlign: 'center', color: '#71827d' }}>
                {page === 'verify' ? 'All members verified.' : 'No members yet.'}
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (page === 'reports') {
    const reports = dashboard.reports || [];
    return (
      <main className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">SAFETY MODERATION</p>
            <h1>Safety reports</h1>
            <p>Up-to-date reports from the campus community.</p>
          </div>
          <Badge tone="amber">{reports.filter(r => r.status === 'open' || r.status === 'Open').length} OPEN</Badge>
        </div>
        <section className="request-list">
          {reports.map(report => (
            <article className="card driver-request" key={report.id}>
              <span className="report-icon">⚑</span>
              <div className="request-person">
                <b>{report.subject}</b>
                <span>{report.reporter_name || 'Anonymous'}</span>
                <p>{report.description}</p>
                <small>Status: {report.status}</small>
              </div>
              <div className="request-actions">
                <Badge tone={report.status === 'open' || report.status === 'Open' ? 'amber' : 'green'}>
                  {report.status === 'open' || report.status === 'Open' ? 'OPEN' : 'RESOLVED'}
                </Badge>
              </div>
            </article>
          ))}
          {!reports.length && (
            <section className="card live-panel"><h2>No safety reports</h2></section>
          )}
        </section>
      </main>
    );
  }

  return <LiveOverview user={{ role: 'admin', fullName: 'Administrator' }} dashboard={dashboard} setPage={() => {}}/>;
}

function LoadingScreen({ label = 'Loading your campus experience' }) {
  return <main className="loading-screen"><div className="loading-mark"><BrandIcon size={30}/></div><p className="eyebrow">CARPOOLCAMPUS</p><h1>{label}</h1><span className="loader" aria-label="Loading" /></main>;
}

function SplashScreen({ onComplete }) {
  const messages = ['Find your people.', 'Share the ride.', 'Make every commute lighter.'];
  const [message, setMessage] = useState(0);
  useEffect(() => {
    const messageTimer = setInterval(() => setMessage(current => (current + 1) % messages.length), 850);
    const splashTimer = setTimeout(onComplete, 2600);
    return () => { clearInterval(messageTimer); clearTimeout(splashTimer); };
  }, []);
  return <main className="splash-screen"><div className="splash-orbit" /><div className="loading-mark"><BrandIcon size={30}/></div><p className="eyebrow">CARPOOLCAMPUS</p><h1>{messages[message]}</h1><p>Connected commutes for campus communities.</p><span className="loader" aria-label="Loading" /></main>;
}

function LiveApp() {
  const [splash, setSplash] = useState(true);
  const [user, setUser] = useState(null);
  const [page, setPage] = useState('overview');
  const [menu, setMenu] = useState(false);
  const [decisions, setDecisions] = useState({});
  const [dashboard, setDashboard] = useState({ routes: [], myRoutes: [], requests: [], trips: [], driverTrips: [], reports: [], members: [], notifications: [] });
  const [dashboardLoading, setDashboardLoading] = useState(false);

  const loadDashboard = () => {
    const token = localStorage.getItem('carpool-campus-token');
    if (!token) return;
    fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Dashboard data unavailable.')))
      .then(data => {
        setDashboard(data);
      })
      .catch(error => console.error(error));
  };

  useEffect(() => {
    if (!user) return;
    setDashboardLoading(true);
    const token = localStorage.getItem('carpool-campus-token');
    fetch('/api/dashboard', { headers: { Authorization: `Bearer ${token}` } })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Dashboard data unavailable.')))
      .then(setDashboard)
      .finally(() => setDashboardLoading(false))
      .catch(error => console.error(error));

    // Live refresh every 4 seconds to sync messages, locations, and notifications
    const interval = setInterval(loadDashboard, 4000);
    return () => clearInterval(interval);
  }, [user]);

  if (splash) return <SplashScreen onComplete={() => setSplash(false)}/>;
  if (!user) return <AuthScreen onAuthenticated={setUser}/>;
  if (dashboardLoading && !dashboard.members.length && !dashboard.routes.length) return <LoadingScreen label="Loading your dashboard"/>;

  const role = user.role;
  const liveRides = dashboard.routes.map(routeToRide);
  const liveRequests = dashboard.requests.map(request => ({
    id: request.id,
    route_id: request.route_id,
    name: request.full_name,
    initials: initials(request.full_name),
    color: roleColors[request.id % roleColors.length],
    pickup: request.pickup_area,
    fit: 0,
    rating: 'New',
    status: request.status,
    requested: new Date(request.created_at).toLocaleString()
  }));

  const handleDecide = async (id, choice) => {
    setDecisions(prev => ({ ...prev, [id]: choice }));
    try {
      const res = await fetch(`/api/ride-requests/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('carpool-campus-token')}`
        },
        body: JSON.stringify({ status: choice })
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Could not update request.');
      }
      loadDashboard();
    } catch (e) {
      console.error(e);
    }
  };

  const requestedRouteIds = dashboard.requests.filter(request => request.status !== 'declined').map(request => request.route_id);
  const setRequests = updater => {
    const next = typeof updater === 'function' ? updater(requestedRouteIds) : updater;
    const routeId = next.find(id => !requestedRouteIds.includes(id));
    if (routeId) {
      fetch('/api/ride-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('carpool-campus-token')}` },
        body: JSON.stringify({ routeId })
      })
      .then(() => loadDashboard())
      .catch(error => console.error(error));
    }
  };

  const savedRoutes = Array.isArray(dashboard.myRoutes) ? dashboard.myRoutes : EMPTY_ROUTES;

  const pendingRequestsCount = dashboard.requests.filter(r => (decisions[r.id] || r.status) === 'pending').length;
  const counts = {
    matches: dashboard.routes.length,
    requests: pendingRequestsCount,
    trips: role === 'driver' ? (dashboard.driverTrips || []).length : (dashboard.trips || []).length,
    reports: (dashboard.reports || []).filter(r => r.status === 'open' || r.status === 'Open').length,
    verify: (dashboard.members || []).filter(m => !m.verified && m.role !== 'admin').length,
    members: (dashboard.members || []).length
  };

  // Logout without page reload → straight to login/register (no splash screen)
  const handleLogout = () => {
    localStorage.removeItem('carpool-campus-token');
    localStorage.setItem('carpool-campus-logout', 'Successfully logged out.');
    setUser(null);
    setPage('overview');
    setMenu(false);
  };

  const riderContent = {
    overview: <LiveOverview user={user} dashboard={dashboard} setPage={setPage}/>,
    matches: <Matches rides={liveRides} requests={requestedRouteIds} setRequests={setRequests}/>,
    routes: <RouteWorkspace user={user} initialRoutes={savedRoutes} availableRoutes={dashboard.routes} onViewMatches={() => setPage('matches')}/>,
    trips: <MyTrips user={user} dashboard={dashboard} onRefresh={loadDashboard}/>,
    safety: <Safety/>
  };

  const driverContent = {
    overview: <LiveOverview user={user} dashboard={dashboard} setPage={setPage}/>,
    requests: <DriverRequests incomingRiders={liveRequests} decisions={decisions} onDecide={handleDecide}/>,
    routes: <RouteWorkspace user={user} initialRoutes={savedRoutes}/>,
    trips: <MyTrips user={user} dashboard={dashboard} onRefresh={loadDashboard}/>,
    earnings: <Earnings/>
  };

  const handleVerify = async (userId) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/verify`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('carpool-campus-token')}` }
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.message || 'Could not verify user.');
      }
      loadDashboard();
    } catch (e) {
      console.error(e);
    }
  };

  const handleSuspend = async (userId) => {
    if (!window.confirm('Suspend this user account?')) return;
    try {
      const res = await fetch(`/api/admin/users/${userId}/suspend`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${localStorage.getItem('carpool-campus-token')}` }
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.message || 'Could not suspend user.');
      }
      loadDashboard();
    } catch (e) {
      console.error(e);
    }
  };

  const adminContent = {
    overview: <LiveAdmin page="overview" dashboard={dashboard} setPage={setPage} onVerify={handleVerify} onSuspend={handleSuspend}/>,
    verify: <LiveAdmin page="verify" dashboard={dashboard} setPage={setPage} onVerify={handleVerify} onSuspend={handleSuspend}/>,
    reports: <LiveAdmin page="reports" dashboard={dashboard} setPage={setPage} onVerify={handleVerify} onSuspend={handleSuspend}/>,
    members: <LiveAdmin page="members" dashboard={dashboard} setPage={setPage} onVerify={handleVerify} onSuspend={handleSuspend}/>
  };

  const content = (role === 'rider' ? riderContent : role === 'driver' ? driverContent : adminContent)[page] || (role === 'rider' ? riderContent.overview : role === 'driver' ? driverContent.overview : adminContent.overview);

  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={p => { setPage(p); setMenu(false); }} collapsed={menu} role={role} user={user} counts={counts} onLogout={handleLogout}/>
      <Header setPage={setPage} role={role} notifications={dashboard.notifications || []} onRefresh={loadDashboard}/>
      <button className="mobile-menu" onClick={() => setMenu(!menu)}>☰</button>
      {content}
      <footer>CarpoolCampus · Secure campus carpooling platform <span>Signed in as {user.fullName || user.email}.</span></footer>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<LiveApp />);
