# Vehicle Rental Management System

P15 — Automotive / Mobility — Christ University CIA-3

This repository contains the Vehicle Rental Management System specified for the P15 CIA-3 project.

## Scope

The system provides customer vehicle search and booking, branch/staff fleet operations, inspections, pricing and cancellation rules, customer rental history, and branch-level utilization/revenue reporting.

## Architecture

- Frontend: React + Vite
- Backend: Node.js + Express.js
- Database: MongoDB + Mongoose
- Authentication: JWT + bcrypt
- Validation: server-side request validation
- API testing: Postman

The backend is the source of truth for authentication, authorization, availability, booking conflicts, state transitions, pricing, cancellation, inspections, and reporting.

## Required Roles

- Customer
- Branch Staff
- Admin

## Mandatory Modules

1. User Registration & Authentication
2. Branch Management
3. Vehicle Master & Fleet Management
4. Availability Search Engine
5. Booking Workflow
6. Pickup Inspection
7. Return Inspection & Damage Charges
8. Booking Status Management
9. Pricing & Add-On Management
10. Cancellation Policy Engine
11. Customer Rental History
12. Branch Fleet Utilization Reports
13. Role-Based Access Control

## Repository Structure

```text
backend/
frontend/
docs/
postman/
.env.example
.gitignore
README.md
```

## Architecture decisions

The complete data model and business-rule decisions are documented in `docs/architecture.md`. Business rules that are not numerically specified by the supplied project brief are explicitly marked as pending decision rather than silently invented.

## Status

Architecture baseline created. Implementation follows only after unresolved business-rule decisions are confirmed.
