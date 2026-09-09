# Vehicle Rental Management System — Architecture Baseline

## 1. System shape

```text
React Frontend
     |
     | REST / JSON + JWT
     v
Express Routes
     |
     +--> Authentication / Role / Branch & Ownership Middleware
     |
     v
Controllers
     |
     v
Services / Business Rules
     |
     v
Mongoose Models
     |
     v
MongoDB
```

Controllers coordinate HTTP requests. Services contain business rules. Models define persistence. Middleware handles authentication, authorization, validation, and centralized errors.

## 2. Required collections

### users

- `_id`
- `name`
- `email` — unique
- `passwordHash`
- `role` — CUSTOMER | BRANCH_STAFF | ADMIN
- `branchId` — reference to branches; applicable to branch staff
- timestamps

### branches

- `_id`
- `name`
- `city`
- timestamps

### vehicles

- `_id`
- `branchId` — reference to branches
- `type`
- `model`
- `perDayRate`
- `status`
- timestamps

Additional vehicle identity fields may be introduced only where needed to distinguish individual fleet assets.

### bookings

- `_id`
- `customerId` — reference to users
- `vehicleId` — reference to vehicles
- `startDate`
- `endDate`
- `status`
- `totalAmount`
- timestamps

### inspections

- `_id`
- `bookingId` — reference to bookings
- `stage` — PICKUP | RETURN
- `odometer`
- `fuelLevel`
- `damageNotes`
- timestamps

Pricing/add-on persistence will be finalized before implementation if a separate collection is required by the chosen pricing design.

## 3. Required indexes

```text
users      { email: 1 } unique
branches   { name: 1 }
vehicles   { branchId: 1 }
bookings   { customerId: 1 }
inspections{ bookingId: 1 }
```

Additional booking-search indexes must be based on the final availability query and documented before adding them.

## 4. Booking state machine

```text
RESERVED -----> PICKED_UP -----> RETURNED
    |
    +---------> CANCELLED
```

Arbitrary status mutation is not allowed. Pickup and return operations perform the state transitions.

## 5. Vehicle operational state

Vehicle status is separate from booking status. The exact enum and transition rules require one explicit project decision because the brief only provides a generic `status` field and examples of out-of-stock behavior.

## 6. Authorization model

```text
CUSTOMER
- Search available vehicles
- Create bookings for self
- View own bookings/history
- Cancel own eligible booking

BRANCH_STAFF
- Operate on assigned branch
- Perform pickup inspections
- Perform return inspections
- Handle permitted local fleet operations

ADMIN
- Manage branches
- Manage vehicle master/fleet
- Manage pricing/add-ons
- View reports across branches
```

Backend must enforce both role permissions and resource scope.

## 7. API grouping

```text
/api/auth/*
/api/branches/*
/api/vehicles/*
/api/bookings/*
/api/inspections/*
/api/customers/*
/api/pricing/*
/api/reports/*
```

Required examples include register/login, vehicle search, booking creation, pickup, return, customer booking history, and utilization reporting.

## 8. Frontend information architecture

Customer:
- Login / Register
- Vehicle Search
- Vehicle Results
- Vehicle Details
- Booking
- Confirmation
- My Bookings / History

Branch Staff:
- Dashboard
- Local Fleet
- Booking Operations
- Pickup Inspection
- Return Inspection

Admin:
- Dashboard
- Branches
- Vehicles
- Pricing / Add-ons
- Bookings
- Reports

## 9. Visual direction

Professional automotive/business product. Clean sans-serif typography, neutral business-oriented palette, restrained glass surfaces, subtle borders and shadows, smooth micro-interactions, clear tables/forms/statuses. No neon, no purple-dominant palette, no futuristic/HUD treatment, no decorative AI-dashboard visuals, and no excessive animation.

## 10. Decisions requiring explicit confirmation

The supplied brief does not define numerical business-policy values for:

- date interval boundary semantics at exact pickup/return boundaries
- vehicle status enum and maintenance behavior
- add-on prices and whether each is per-day or one-time
- cancellation time bands and charges
- damage charge calculation
- fuel shortfall charge calculation

These are intentionally not invented in this baseline. They must be resolved before implementing dependent business logic.
