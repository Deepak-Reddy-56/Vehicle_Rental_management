# VROOM - Vehicle Rental Management System

P15 - Automotive / Mobility - Christ University CIA-3

A backend-first vehicle rental management system with three role-specific interfaces: Customer Rental Portal, Branch Staff Operations Portal, and Admin Management Portal.

## What is implemented

- JWT authentication + bcrypt password hashing
- Customer registration/login
- Admin/Staff login for provisioned accounts
- Branch management
- Vehicle/fleet management with photos, make/model, per-day rate, included KM, excess-KM rate, fuel type and tank capacity
- One-hour pickup/return time slots
- Real backend availability checking and SOLD OUT response
- Booking creation with overlap conflict protection
- Booking lifecycle: RESERVED → PICKED_UP → RETURNED, or RESERVED → CANCELLED
- Pickup inspection with odometer/fuel/photos
- Return inspection with odometer/fuel/photos, damage charge and backend settlement
- Excess-kilometer calculation from pickup and return odometers
- Fuel shortage charge / excess fuel credit using Admin-configured fuel rates
- Staff/Admin configurable GPS, Insurance and Driver add-ons
- Time-based cancellation policy: >48h 0%, 24–48h 25%, <24h 50%, after pickup not allowed
- Customer rental history
- Branch-level utilization and revenue reporting
- Postman collection covering the main end-to-end workflow

## Architecture

```text
React Frontend
      |
      | REST / JSON + JWT
      v
Express API
      |
      +-- Auth / RBAC / Branch Scope / Validation
      |
      v
Controllers & Business Services
      |
      v
Mongoose Models
      |
      v
MongoDB
```

The backend is the source of truth for availability, booking conflicts, workflow transitions, pricing, cancellation, inspection settlement, authorization and reporting.

## Repository structure

```text
backend/
  server.js
  seed.js
  package.json
frontend/
  src/main.jsx
  src/styles.css
  index.html
postman/
  Vehicle_Rental_Management.postman_collection.json
docs/
  architecture.md
.env.example
.gitignore
README.md
```

## Local setup

### 1. Clone

```bash
git clone https://github.com/Deepak-Reddy-56/Vehicle_Rental_management.git
cd Vehicle_Rental_management
```

### 2. Backend

```bash
cd backend
npm install
```

Copy the root `.env.example` to `backend/.env` and configure:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/vehicle_rental_management
JWT_SECRET=your_long_random_secret
JWT_EXPIRES_IN=1d
SEED_PASSWORD=your_local_demo_password
```

Start the API:

```bash
npm run dev
```

API: `http://localhost:5000`

Health check:

```text
GET /api/health
```

### 3. Seed demo data

With MongoDB running and `.env` configured:

```bash
cd backend
npm run seed
```

The seeded users include:

```text
admin@vroom.local
staff1@vroom.local
staff2@vroom.local
customer@vroom.local
```

All seeded accounts use the `SEED_PASSWORD` value from your local `.env`.

### 4. Frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Optional environment variable:

```env
VITE_API_URL=http://localhost:5000/api
```

Then open the Vite URL shown in the terminal.

## Three interfaces

### Customer Rental Portal

Customers can search by branch/date/time, select available vehicles, review configured add-ons, book, cancel eligible reservations and view rental history.

### Branch Staff Operations Portal

Staff operate only on their assigned branch. They can manage local vehicle records, add operational photos/data, process pickup and return inspections, and apply return settlement information.

### Admin Management Portal

Admins manage branches, fleet, add-ons, fuel rates, and system-wide reporting.

## Booking availability

Pickup and return timestamps use one-hour intervals. A requested vehicle is unavailable when its individual rental interval overlaps another active booking (`RESERVED` or `PICKED_UP`). The search response reports the number of remaining vehicles and returns `SOLD_OUT` when none remain.

## Return settlement

```text
travelledKm = returnOdometer - pickupOdometer
excessKm = max(travelledKm - vehicle.permittedKilometers, 0)
excessCharge = excessKm × vehicle.extraKilometerCharge
```

Fuel is compared against the pickup baseline. The current configured fuel rate for the branch city/fuel type is used to calculate a charge when fuel falls and a credit when fuel rises.

Damage is entered by staff at return and is not charged at pickup.

## Cancellation policy

| Time before pickup | Charge |
|---|---:|
| More than 48 hours | 0% |
| 24–48 hours | 25% |
| Less than 24 hours | 50% |
| After pickup | Not allowed |

## Security

- Passwords are hashed with bcrypt.
- Protected endpoints require JWT authentication.
- RBAC is enforced server-side.
- Customer ownership is enforced for private booking history/cancellation.
- Branch staff are scoped to their assigned branch.
- Secrets belong in `.env`; `.env` is ignored by Git.

## Postman

Import `postman/Vehicle_Rental_Management.postman_collection.json` into Postman. The collection includes health, authentication, availability, booking, staff inspection and report requests. Set the collection variables after login (`token`, `customerId`, `branchId`, `vehicleId`, `bookingId`) for the integrated flow.

## Project documentation

See `docs/architecture.md` for the approved data model and business rules aligned to the P15 requirements.
