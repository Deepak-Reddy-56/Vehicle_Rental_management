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

Each vehicle is an individual fleet asset. Multiple vehicles can share the same make/model, allowing availability to be represented as a quantity/count at a branch.

Required/core fields:

- `_id`
- `branchId` — reference to branches
- `type` — car or bike category
- `name`
- `make`
- `model`
- `photos` — staff-supplied vehicle photo references/URLs
- `perDayRate`
- `permittedKilometers`
- `extraKilometerCharge`
- `status`
- timestamps

Staff must be able to populate the vehicle information from the operational form provided by the company, including photos, name, make/model, permitted kilometers, and excess-kilometer charge.

### bookings

- `_id`
- `customerId` — reference to users
- `vehicleId` — reference to vehicles
- `startDate` — pickup date/time
- `endDate` — return date/time
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
- `damageCharge`
- `fuelCharge`
- `extraKilometers`
- `extraKilometerCharge`
- `photos` — return/pickup inspection photo references where applicable
- timestamps

### Pricing / Add-ons

The company will provide staff with the add-on values rather than the software author inventing fixed prices.

The design must therefore support staff-managed add-ons such as:

- GPS
- Insurance
- Driver

The exact persistence model for these configurable add-ons may be a dedicated collection or another deliberate schema choice, but the values must come from staff/admin input and be used by backend pricing logic.

## 3. Required indexes

```text
users       { email: 1 } unique
branches    { name: 1 }
vehicles    { branchId: 1 }
bookings    { customerId: 1 }
inspections { bookingId: 1 }
```

Additional booking-search indexes must be based on the final availability query and documented before adding them.

## 4. Booking time model and availability

`startDate` is the exact pickup date/time and `endDate` is the exact return/drop-off date/time.

The booking UI must use **one-hour intervals** for selectable pickup/return time slots.

Availability is based on the number of individual vehicles at the requested branch that are free for the requested time interval.

Conceptually:

```text
Requested slot
     |
     v
Find vehicles at branch
     |
     v
Exclude vehicles with overlapping active bookings
     |
     v
Count remaining vehicles
     |
     +--> count > 0  → available quantity / bookable
     |
     +--> count = 0  → SOLD OUT
```

For an individual vehicle, an existing booking conflicts when its rental interval overlaps the requested interval. A vehicle can therefore be booked again after its previous rental has ended.

The backend is the source of truth for availability; the frontend must never decide availability independently.

## 5. Booking state machine

```text
RESERVED -----> PICKED_UP -----> RETURNED
    |
    +---------> CANCELLED
```

Arbitrary status mutation is not allowed. Pickup and return operations perform the state transitions.

## 6. Vehicle operational state

Vehicle status is separate from booking status.

Proposed operational states:

```text
AVAILABLE
RESERVED
RENTED
MAINTENANCE
```

The status must prevent a maintenance/out-of-service vehicle from being offered for booking. Availability must still be calculated from both vehicle operational status and overlapping bookings.

## 7. Inspection and settlement rules

### Pickup

Branch staff records:

- pickup odometer
- initial fuel percentage
- condition/damage notes
- photos where required

Damage is **not charged at pickup**. Pickup establishes the baseline condition/fuel/odometer used for later return settlement.

### Return

Branch staff records:

- return odometer
- return fuel percentage
- damage notes
- damage charge
- return photos where applicable

Return inspection is the settlement point for excess kilometers, fuel adjustment, and damage charges.

### Excess kilometers

Each vehicle contains its permitted kilometer allowance and its own excess-kilometer rate.

Example:

```text
Permitted: 100 km
Return odometer - pickup odometer: 124 km
Exceeded: 24 km
Vehicle rate: ₹4/km
Excess charge: ₹96
```

The backend computes:

```text
travelledKm = returnOdometer - pickupOdometer
excessKm = max(travelledKm - permittedKilometers, 0)
excessCharge = excessKm * extraKilometerCharge
```

The calculation must be performed on the backend using the vehicle's configured kilometer policy and inspection readings.

### Fuel

The pickup inspection stores the initial fuel percentage. The return inspection stores the final fuel percentage.

```text
Return fuel < pickup fuel
    → charge customer for the shortage

Return fuel > pickup fuel
    → credit/discount customer for the excess

Return fuel = pickup fuel
    → no fuel adjustment
```

The system must retain the actual pickup and return readings and the resulting adjustment. The monetary fuel adjustment rate/formula must be a configurable company value and must not be silently hard-coded.

### Damage

Damage is assessed at return inspection, not pickup. Branch Staff enters the applicable damage charge and notes when the vehicle is returned. Pickup damage notes/photos are for baseline/reference only.

## 8. Add-on pricing

The company supplies add-on pricing to staff. The application must allow authorized staff/admin users to configure the values for:

- GPS
- Insurance
- Driver

These values must be persisted and used by backend pricing logic. The project must not hard-code fictional permanent commercial prices.

## 9. Cancellation policy

The agreed policy is:

| Time before pickup | Cancellation charge |
|---|---:|
| More than 48 hours | 0% |
| 24–48 hours | 25% |
| Less than 24 hours | 50% |
| After pickup | Not allowed |

Cancellation must be a business-rule operation, not an arbitrary status update.

## 10. Authorization model

```text
CUSTOMER
- Search available vehicles
- Create bookings for self
- View own bookings/history
- Cancel own eligible booking

BRANCH_STAFF
- Operate on assigned branch
- Create/manage operational fleet records as permitted
- Perform pickup inspections
- Perform return inspections
- Enter/configure company-provided pricing/add-on values as permitted

ADMIN
- Manage branches
- Manage vehicle master/fleet
- Manage pricing/add-ons
- View reports across branches
```

Backend must enforce both role permissions and resource scope. Staff must not operate on another branch's fleet/bookings.

## 11. API grouping

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

## 12. Frontend information architecture

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
- Operational Forms for vehicle and add-on data

Admin:
- Dashboard
- Branches
- Vehicles
- Pricing / Add-ons
- Bookings
- Reports

## 13. Visual direction

Professional automotive/business product. Clean sans-serif typography, neutral business-oriented palette, restrained glass surfaces, subtle borders and shadows, smooth micro-interactions, clear tables/forms/statuses. No neon, no purple-dominant palette, no futuristic/HUD treatment, no decorative AI-dashboard visuals, and no excessive animation.

## 14. Requirement resolution status

The following decisions are now resolved from the project owner's clarification:

- `startDate` = exact customer pickup date/time
- `endDate` = exact customer return/drop-off date/time
- selectable time slots use one-hour intervals
- availability is quantity-based across individual fleet vehicles at a branch
- no free vehicle in the requested interval = SOLD OUT
- each vehicle stores permitted kilometers and its own excess-kilometer charge
- excess kilometers are computed at return using pickup/return odometer readings
- staff records vehicle photos, name, make/model and kilometer policy from company forms
- staff supplies/configures GPS, insurance and driver add-on values
- damage is assessed and charged during return inspection, not pickup
- pickup records initial fuel percentage and baseline odometer
- return records final fuel percentage and settlement values
- fuel shortage creates a charge; extra fuel creates a credit/discount
- cancellation policy is >48h = 0%, 24–48h = 25%, <24h = 50%, after pickup = not allowed

The monetary fuel adjustment rate/formula remains configuration supplied by the company/staff and must not be invented as a fixed commercial price.
