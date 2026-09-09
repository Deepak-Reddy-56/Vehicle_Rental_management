import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.resolve('uploads')));

const PORT = Number(process.env.PORT || 5000);
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
if (!MONGODB_URI || !JWT_SECRET) throw new Error('MONGODB_URI and JWT_SECRET are required');
fs.mkdirSync(path.resolve('uploads'), { recursive: true });

const { Schema } = mongoose;
const roles = ['CUSTOMER', 'BRANCH_STAFF', 'ADMIN'];
const vehicleStatuses = ['AVAILABLE', 'RESERVED', 'RENTED', 'MAINTENANCE'];
const bookingStatuses = ['RESERVED', 'PICKED_UP', 'RETURNED', 'CANCELLED'];
const addOnTypes = ['GPS', 'INSURANCE', 'DRIVER'];

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, minlength: 2 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: roles, default: 'CUSTOMER' },
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', default: null }
}, { timestamps: true });
userSchema.index({ email: 1 }, { unique: true });

const branchSchema = new Schema({
  name: { type: String, required: true, trim: true },
  city: { type: String, required: true, trim: true }
}, { timestamps: true });
branchSchema.index({ name: 1 });

const vehicleSchema = new Schema({
  branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
  type: { type: String, enum: ['CAR', 'BIKE'], required: true },
  name: { type: String, required: true, trim: true },
  make: { type: String, required: true, trim: true },
  model: { type: String, required: true, trim: true },
  photos: [{ type: String }],
  perDayRate: { type: Number, required: true, min: 0 },
  permittedKilometers: { type: Number, required: true, min: 0 },
  extraKilometerCharge: { type: Number, required: true, min: 0 },
  fuelType: { type: String, enum: ['PETROL', 'DIESEL', 'ELECTRIC'], default: 'PETROL' },
  fuelTankCapacity: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: vehicleStatuses, default: 'AVAILABLE' }
}, { timestamps: true });
vehicleSchema.index({ branchId: 1 });

const bookingSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  vehicleId: { type: Schema.Types.ObjectId, ref: 'Vehicle', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: bookingStatuses, default: 'RESERVED' },
  baseAmount: { type: Number, default: 0 },
  addOnAmount: { type: Number, default: 0 },
  adjustmentAmount: { type: Number, default: 0 },
  totalAmount: { type: Number, default: 0 },
  selectedAddOns: [{ type: Schema.Types.ObjectId, ref: 'AddOn' }],
  cancellationCharge: { type: Number, default: 0 }
}, { timestamps: true });
bookingSchema.index({ customerId: 1 });
bookingSchema.index({ vehicleId: 1, startDate: 1, endDate: 1 });

const inspectionSchema = new Schema({
  bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
  stage: { type: String, enum: ['PICKUP', 'RETURN'], required: true },
  odometer: { type: Number, required: true, min: 0 },
  fuelLevel: { type: Number, required: true, min: 0, max: 100 },
  damageNotes: { type: String, default: '', trim: true },
  damageCharge: { type: Number, default: 0, min: 0 },
  fuelCharge: { type: Number, default: 0 },
  extraKilometers: { type: Number, default: 0, min: 0 },
  extraKilometerCharge: { type: Number, default: 0, min: 0 },
  fuelAdjustmentType: { type: String, enum: ['CHARGE', 'CREDIT', 'NONE'], default: 'NONE' },
  photos: [{ type: String }]
}, { timestamps: true });
inspectionSchema.index({ bookingId: 1 });

const addOnSchema = new Schema({
  type: { type: String, enum: addOnTypes, required: true, unique: true },
  label: { type: String, required: true },
  pricePerDay: { type: Number, required: true, min: 0 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

const fuelRateSchema = new Schema({
  city: { type: String, required: true, trim: true },
  fuelType: { type: String, enum: ['PETROL', 'DIESEL'], required: true },
  pricePerLitre: { type: Number, required: true, min: 0 },
  effectiveFrom: { type: Date, required: true }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);
const Branch = mongoose.model('Branch', branchSchema);
const Vehicle = mongoose.model('Vehicle', vehicleSchema);
const Booking = mongoose.model('Booking', bookingSchema);
const Inspection = mongoose.model('Inspection', inspectionSchema);
const AddOn = mongoose.model('AddOn', addOnSchema);
const FuelRate = mongoose.model('FuelRate', fuelRateSchema);

class AppError extends Error {
  constructor(status, message, errorCode) { super(message); this.status = status; this.errorCode = errorCode; }
}
const fail = (status, message, code) => { throw new AppError(status, message, code); };

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role, branchId: user.branchId?.toString() || null }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
async function auth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return next(new AppError(401, 'Authentication token is required', 'AUTH_REQUIRED'));
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = await User.findById(payload.sub).select('-passwordHash');
    if (!user) return next(new AppError(401, 'User account no longer exists', 'AUTH_INVALID'));
    req.user = user;
    next();
  } catch (err) { next(new AppError(401, 'Invalid or expired authentication token', 'AUTH_INVALID')); }
}
function permit(...allowed) { return (req, _res, next) => allowed.includes(req.user.role) ? next() : next(new AppError(403, 'Your role is not allowed to perform this action', 'FORBIDDEN')); }
function branchScope(docBranchId, user) {
  return user.role === 'ADMIN' || String(docBranchId) === String(user.branchId);
}
function validateId(id, label = 'ID') { if (!mongoose.isValidObjectId(id)) fail(400, `${label} is invalid`, 'VALIDATION_ERROR'); }
function parseWindow(start, end) {
  const s = new Date(start), e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) fail(400, 'Dates must be valid ISO date-times', 'VALIDATION_ERROR');
  if (s >= e) fail(400, 'Return time must be after pickup time', 'VALIDATION_ERROR');
  if (s.getMinutes() !== 0 || e.getMinutes() !== 0 || s.getSeconds() !== 0 || e.getSeconds() !== 0) fail(400, 'Pickup and return times must use one-hour intervals', 'VALIDATION_ERROR');
  return [s, e];
}
function hoursBetween(s, e) { return Math.max(1, Math.ceil((e - s) / 3600000)); }
function daysBetween(s, e) { return Math.max(1, Math.ceil((e - s) / 86400000)); }
function overlaps(query) { return { startDate: { $lt: query.end }, endDate: { $gt: query.start }, status: { $in: ['RESERVED', 'PICKED_UP'] } }; }
async function availableVehicles(branchId, start, end) {
  const vehicles = await Vehicle.find({ branchId, status: { $ne: 'MAINTENANCE' } }).lean();
  const active = await Booking.find({ vehicleId: { $in: vehicles.map(v => v._id) }, ...overlaps({ start, end }) }).select('vehicleId').lean();
  const blocked = new Set(active.map(b => String(b.vehicleId)));
  return vehicles.filter(v => !blocked.has(String(v._id)));
}
async function calculatePricing(vehicle, start, end, addOnIds = []) {
  const durationDays = daysBetween(start, end);
  const baseAmount = vehicle.perDayRate * durationDays;
  const addOns = addOnIds?.length ? await AddOn.find({ _id: { $in: addOnIds }, active: true }).lean() : [];
  const addOnAmount = addOns.reduce((sum, a) => sum + (a.pricePerDay * durationDays), 0);
  return { baseAmount, addOnAmount, totalAmount: baseAmount + addOnAmount, addOns };
}
async function cancellationCharge(booking) {
  const hours = (new Date(booking.startDate) - new Date()) / 3600000;
  if (hours < 0) fail(409, 'This booking is already at or past pickup time', 'BUSINESS_RULE_CONFLICT');
  if (hours > 48) return 0;
  if (hours >= 24) return booking.totalAmount * 0.25;
  return booking.totalAmount * 0.5;
}

const upload = multer({ dest: path.resolve('uploads') });

app.get('/api/health', (_req, res) => res.json({ success: true, message: 'Vehicle Rental API is running' }));

app.post('/api/auth/register', async (req, res, next) => {
  try {
    const { name, email, password, role = 'CUSTOMER', branchId } = req.body;
    if (!name || !email || !password) fail(400, 'Name, email and password are required', 'VALIDATION_ERROR');
    if (role !== 'CUSTOMER') fail(403, 'Public registration is only available for customers', 'FORBIDDEN');
    if (password.length < 6) fail(400, 'Password must be at least 6 characters', 'VALIDATION_ERROR');
    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) fail(409, 'An account with this email already exists', 'DUPLICATE_RECORD');
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12), role: 'CUSTOMER', branchId: null });
    res.status(201).json({ success: true, message: 'Account created successfully', data: { user: { id: user._id, name: user.name, email: user.email, role: user.role }, token: signToken(user) } });
  } catch (e) { next(e); }
});
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) fail(400, 'Email and password are required', 'VALIDATION_ERROR');
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) fail(401, 'Invalid email or password', 'AUTH_INVALID');
    res.json({ success: true, message: 'Login successful', data: { user: { id: user._id, name: user.name, email: user.email, role: user.role, branchId: user.branchId }, token: signToken(user) } });
  } catch (e) { next(e); }
});

app.get('/api/branches', auth, async (_req, res, next) => { try { res.json({ success: true, data: await Branch.find().sort({ name: 1 }) }); } catch (e) { next(e); } });
app.post('/api/branches', auth, permit('ADMIN'), async (req, res, next) => {
  try { const { name, city } = req.body; if (!name || !city) fail(400, 'Branch name and city are required', 'VALIDATION_ERROR'); const branch = await Branch.create({ name, city }); res.status(201).json({ success: true, message: 'Branch created successfully', data: branch }); } catch (e) { next(e); }
});
app.put('/api/branches/:id', auth, permit('ADMIN'), async (req, res, next) => {
  try { validateId(req.params.id, 'Branch ID'); const branch = await Branch.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!branch) fail(404, 'Branch not found', 'NOT_FOUND'); res.json({ success: true, data: branch }); } catch (e) { next(e); }
});
app.delete('/api/branches/:id', auth, permit('ADMIN'), async (req, res, next) => {
  try { validateId(req.params.id, 'Branch ID'); const inUse = await Vehicle.exists({ branchId: req.params.id }); if (inUse) fail(409, 'Branch cannot be deleted while vehicles are assigned to it', 'BUSINESS_RULE_CONFLICT'); const branch = await Branch.findByIdAndDelete(req.params.id); if (!branch) fail(404, 'Branch not found', 'NOT_FOUND'); res.json({ success: true, message: 'Branch deleted successfully' }); } catch (e) { next(e); }
});

app.get('/api/vehicles', auth, async (req, res, next) => {
  try { const filter = {}; if (req.user.role === 'BRANCH_STAFF') filter.branchId = req.user.branchId; if (req.query.branchId) filter.branchId = req.query.branchId; const data = await Vehicle.find(filter).populate('branchId', 'name city').sort({ createdAt: -1 }); res.json({ success: true, data }); } catch (e) { next(e); }
});
app.post('/api/vehicles', auth, permit('ADMIN', 'BRANCH_STAFF'), upload.array('photos', 8), async (req, res, next) => {
  try {
    const body = req.body;
    const branchId = req.user.role === 'BRANCH_STAFF' ? req.user.branchId : body.branchId;
    if (!branchId || !body.type || !body.name || !body.make || !body.model || body.perDayRate === undefined || body.permittedKilometers === undefined || body.extraKilometerCharge === undefined) fail(400, 'Branch, type, name, make, model, per-day rate, permitted kilometers and excess-km charge are required', 'VALIDATION_ERROR');
    if (!branchScope(branchId, req.user)) fail(403, 'You cannot manage another branch', 'FORBIDDEN');
    const photos = (req.files || []).map(file => `/uploads/${file.filename}`);
    const vehicle = await Vehicle.create({ ...body, branchId, perDayRate: Number(body.perDayRate), permittedKilometers: Number(body.permittedKilometers), extraKilometerCharge: Number(body.extraKilometerCharge), fuelTankCapacity: Number(body.fuelTankCapacity || 0), photos });
    res.status(201).json({ success: true, message: 'Vehicle created successfully', data: vehicle });
  } catch (e) { next(e); }
});
app.put('/api/vehicles/:id', auth, permit('ADMIN', 'BRANCH_STAFF'), async (req, res, next) => {
  try { validateId(req.params.id, 'Vehicle ID'); const existing = await Vehicle.findById(req.params.id); if (!existing) fail(404, 'Vehicle not found', 'NOT_FOUND'); if (!branchScope(existing.branchId, req.user)) fail(403, 'You cannot modify a vehicle outside your branch', 'FORBIDDEN'); const updates = { ...req.body }; const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }); res.json({ success: true, data: vehicle }); } catch (e) { next(e); }
});
app.delete('/api/vehicles/:id', auth, permit('ADMIN'), async (req, res, next) => {
  try { validateId(req.params.id, 'Vehicle ID'); const active = await Booking.exists({ vehicleId: req.params.id, status: { $in: ['RESERVED', 'PICKED_UP'] } }); if (active) fail(409, 'Vehicle cannot be deleted while it has an active booking', 'BUSINESS_RULE_CONFLICT'); const v = await Vehicle.findByIdAndDelete(req.params.id); if (!v) fail(404, 'Vehicle not found', 'NOT_FOUND'); res.json({ success: true, message: 'Vehicle deleted successfully' }); } catch (e) { next(e); }
});
app.get('/api/vehicles/search', async (req, res, next) => {
  try { const { branchId, startDate, endDate, type } = req.query; if (!branchId || !startDate || !endDate) fail(400, 'Branch, pickup time and return time are required', 'VALIDATION_ERROR'); validateId(branchId, 'Branch ID'); const [start, end] = parseWindow(startDate, endDate); const available = await availableVehicles(branchId, start, end); const filtered = type ? available.filter(v => v.type === type.toUpperCase()) : available; res.json({ success: true, data: { requestedWindow: { start, end }, availableQuantity: filtered.length, status: filtered.length ? 'AVAILABLE' : 'SOLD_OUT', vehicles: filtered } }); } catch (e) { next(e); }
});

app.get('/api/pricing/add-ons', auth, async (_req, res, next) => { try { res.json({ success: true, data: await AddOn.find({ active: true }).sort({ type: 1 }) }); } catch (e) { next(e); } });
app.post('/api/pricing/add-ons', auth, permit('ADMIN', 'BRANCH_STAFF'), async (req, res, next) => { try { const { type, label, pricePerDay } = req.body; if (!addOnTypes.includes(type) || !label || pricePerDay === undefined) fail(400, 'Type, label and price per day are required', 'VALIDATION_ERROR'); const item = await AddOn.findOneAndUpdate({ type }, { type, label, pricePerDay: Number(pricePerDay), active: true }, { upsert: true, new: true, runValidators: true }); res.status(201).json({ success: true, message: 'Add-on saved successfully', data: item }); } catch (e) { next(e); } });
app.post('/api/pricing/fuel-rates', auth, permit('ADMIN'), async (req, res, next) => { try { const { city, fuelType, pricePerLitre, effectiveFrom } = req.body; if (!city || !fuelType || pricePerLitre === undefined || !effectiveFrom) fail(400, 'City, fuel type, price per litre and effective date are required', 'VALIDATION_ERROR'); const rate = await FuelRate.create({ city, fuelType, pricePerLitre: Number(pricePerLitre), effectiveFrom: new Date(effectiveFrom) }); res.status(201).json({ success: true, message: 'Fuel rate saved', data: rate }); } catch (e) { next(e); } });
app.get('/api/pricing/fuel-rates', auth, async (req, res, next) => { try { const city = req.query.city; const q = city ? { city } : {}; res.json({ success: true, data: await FuelRate.find(q).sort({ effectiveFrom: -1 }) }); } catch (e) { next(e); } });

app.post('/api/bookings', auth, permit('CUSTOMER'), async (req, res, next) => {
  try {
    const { vehicleId, startDate, endDate, addOns = [] } = req.body;
    validateId(vehicleId, 'Vehicle ID');
    const [start, end] = parseWindow(startDate, endDate);
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) fail(404, 'Vehicle not found', 'NOT_FOUND');
    if (vehicle.status === 'MAINTENANCE') fail(409, 'Vehicle is currently unavailable', 'BUSINESS_RULE_CONFLICT');
    const free = await availableVehicles(vehicle.branchId, start, end);
    if (!free.some(v => String(v._id) === String(vehicle._id))) fail(409, 'Vehicle is sold out for the selected time slot', 'SOLD_OUT');
    const pricing = await calculatePricing(vehicle, start, end, addOns);
    const booking = await Booking.create({ customerId: req.user._id, vehicleId, startDate: start, endDate: end, baseAmount: pricing.baseAmount, addOnAmount: pricing.addOnAmount, totalAmount: pricing.totalAmount, selectedAddOns: pricing.addOns.map(a => a._id) });
    res.status(201).json({ success: true, message: 'Booking created successfully', data: await booking.populate(['vehicleId', 'selectedAddOns']) });
  } catch (e) { next(e); }
});
app.get('/api/bookings/:id', auth, async (req, res, next) => {
  try { validateId(req.params.id, 'Booking ID'); const booking = await Booking.findById(req.params.id).populate('customerId', 'name email').populate('vehicleId').populate('selectedAddOns'); if (!booking) fail(404, 'Booking not found', 'NOT_FOUND'); const allowed = req.user.role === 'ADMIN' || String(booking.customerId._id) === String(req.user._id) || (req.user.role === 'BRANCH_STAFF' && branchScope(booking.vehicleId.branchId, req.user)); if (!allowed) fail(403, 'You cannot access this booking', 'FORBIDDEN'); res.json({ success: true, data: booking }); } catch (e) { next(e); }
});
app.get('/api/customers/:id/bookings', auth, async (req, res, next) => {
  try { validateId(req.params.id, 'Customer ID'); if (req.user.role !== 'ADMIN' && String(req.user._id) !== String(req.params.id)) fail(403, 'You can only view your own rental history', 'FORBIDDEN'); const data = await Booking.find({ customerId: req.params.id }).populate('vehicleId').populate('selectedAddOns').sort({ startDate: -1 }); res.json({ success: true, data }); } catch (e) { next(e); }
});
app.post('/api/bookings/:id/cancel', auth, permit('CUSTOMER'), async (req, res, next) => {
  try { validateId(req.params.id, 'Booking ID'); const booking = await Booking.findById(req.params.id); if (!booking) fail(404, 'Booking not found', 'NOT_FOUND'); if (String(booking.customerId) !== String(req.user._id)) fail(403, 'You can only cancel your own booking', 'FORBIDDEN'); if (booking.status !== 'RESERVED') fail(409, 'Only reserved bookings can be cancelled', 'INVALID_STATUS_TRANSITION'); const charge = await cancellationCharge(booking); booking.cancellationCharge = charge; booking.adjustmentAmount = -charge; booking.status = 'CANCELLED'; booking.totalAmount = Math.max(0, booking.totalAmount - charge); await booking.save(); res.json({ success: true, message: 'Booking cancelled', data: { booking, cancellationCharge: charge } }); } catch (e) { next(e); }
});

app.post('/api/bookings/:id/pickup', auth, permit('BRANCH_STAFF', 'ADMIN'), upload.array('photos', 8), async (req, res, next) => {
  try {
    validateId(req.params.id, 'Booking ID');
    const booking = await Booking.findById(req.params.id).populate('vehicleId'); if (!booking) fail(404, 'Booking not found', 'NOT_FOUND');
    if (!branchScope(booking.vehicleId.branchId, req.user)) fail(403, 'You cannot process another branch booking', 'FORBIDDEN');
    if (booking.status !== 'RESERVED') fail(409, 'Only reserved bookings can be picked up', 'INVALID_STATUS_TRANSITION');
    const { odometer, fuelLevel, damageNotes = '' } = req.body;
    if (odometer === undefined || fuelLevel === undefined) fail(400, 'Pickup odometer and fuel level are required', 'VALIDATION_ERROR');
    const duplicate = await Inspection.exists({ bookingId: booking._id, stage: 'PICKUP' }); if (duplicate) fail(409, 'Pickup inspection already exists', 'BUSINESS_RULE_CONFLICT');
    const photos = (req.files || []).map(file => `/uploads/${file.filename}`);
    await Inspection.create({ bookingId: booking._id, stage: 'PICKUP', odometer: Number(odometer), fuelLevel: Number(fuelLevel), damageNotes, photos });
    booking.status = 'PICKED_UP'; await booking.save();
    booking.vehicleId.status = 'RENTED'; await booking.vehicleId.save();
    res.json({ success: true, message: 'Pickup inspection recorded', data: booking });
  } catch (e) { next(e); }
});

app.post('/api/bookings/:id/return', auth, permit('BRANCH_STAFF', 'ADMIN'), upload.array('photos', 8), async (req, res, next) => {
  try {
    validateId(req.params.id, 'Booking ID');
    const booking = await Booking.findById(req.params.id).populate('vehicleId'); if (!booking) fail(404, 'Booking not found', 'NOT_FOUND');
    if (!branchScope(booking.vehicleId.branchId, req.user)) fail(403, 'You cannot process another branch booking', 'FORBIDDEN');
    if (booking.status !== 'PICKED_UP') fail(409, 'Only picked-up bookings can be returned', 'INVALID_STATUS_TRANSITION');
    const pickup = await Inspection.findOne({ bookingId: booking._id, stage: 'PICKUP' }); if (!pickup) fail(409, 'Pickup inspection is required before return', 'BUSINESS_RULE_CONFLICT');
    const { odometer, fuelLevel, damageNotes = '', damageCharge = 0 } = req.body;
    if (odometer === undefined || fuelLevel === undefined) fail(400, 'Return odometer and fuel level are required', 'VALIDATION_ERROR');
    const returnOdometer = Number(odometer), returnFuel = Number(fuelLevel);
    if (returnOdometer < pickup.odometer) fail(400, 'Return odometer cannot be less than pickup odometer', 'VALIDATION_ERROR');
    const travelledKm = returnOdometer - pickup.odometer;
    const extraKm = Math.max(travelledKm - booking.vehicleId.permittedKilometers, 0);
    const extraCharge = extraKm * booking.vehicleId.extraKilometerCharge;
    const fuelRate = booking.vehicleId.fuelType !== 'ELECTRIC' ? await FuelRate.findOne({ city: (await Branch.findById(booking.vehicleId.branchId)).city, fuelType: booking.vehicleId.fuelType }).sort({ effectiveFrom: -1 }) : null;
    let fuelAdjustment = 0, fuelAdjustmentType = 'NONE';
    if (fuelRate && booking.vehicleId.fuelTankCapacity > 0 && returnFuel !== pickup.fuelLevel) {
      const litres = Math.abs(returnFuel - pickup.fuelLevel) / 100 * booking.vehicleId.fuelTankCapacity;
      fuelAdjustment = Number((litres * fuelRate.pricePerLitre).toFixed(2));
      fuelAdjustmentType = returnFuel < pickup.fuelLevel ? 'CHARGE' : 'CREDIT';
      if (fuelAdjustmentType === 'CREDIT') fuelAdjustment = -fuelAdjustment;
    }
    const photos = (req.files || []).map(file => `/uploads/${file.filename}`);
    const inspection = await Inspection.create({ bookingId: booking._id, stage: 'RETURN', odometer: returnOdometer, fuelLevel: returnFuel, damageNotes, damageCharge: Number(damageCharge || 0), fuelCharge: fuelAdjustment, extraKilometers: extraKm, extraKilometerCharge: extraCharge, fuelAdjustmentType, photos });
    booking.adjustmentAmount = extraCharge + Number(damageCharge || 0) + fuelAdjustment;
    booking.totalAmount = Math.max(0, booking.totalAmount + booking.adjustmentAmount);
    booking.status = 'RETURNED'; await booking.save();
    booking.vehicleId.status = 'AVAILABLE'; await booking.vehicleId.save();
    res.json({ success: true, message: 'Return inspection recorded and settlement calculated', data: { booking, inspection, settlement: { travelledKm, extraKm, extraCharge, fuelAdjustment, damageCharge: Number(damageCharge || 0), finalTotal: booking.totalAmount } } });
  } catch (e) { next(e); }
});

app.get('/api/staff/bookings', auth, permit('BRANCH_STAFF', 'ADMIN'), async (req, res, next) => {
  try { const vehicles = await Vehicle.find(req.user.role === 'ADMIN' ? {} : { branchId: req.user.branchId }).select('_id'); const data = await Booking.find({ vehicleId: { $in: vehicles.map(v => v._id) }, ...(req.query.status ? { status: req.query.status } : {}) }).populate('customerId', 'name email').populate('vehicleId').sort({ startDate: 1 }); res.json({ success: true, data }); } catch (e) { next(e); }
});

app.get('/api/admin/reports/utilization', auth, permit('ADMIN', 'BRANCH_STAFF'), async (req, res, next) => {
  try {
    const branchFilter = req.user.role === 'BRANCH_STAFF' ? { _id: req.user.branchId } : (req.query.branchId ? { _id: req.query.branchId } : {});
    const branches = await Branch.find(branchFilter);
    const from = req.query.from ? new Date(req.query.from) : new Date(new Date().getFullYear(), 0, 1);
    const to = req.query.to ? new Date(req.query.to) : new Date();
    const days = Math.max(1, Math.ceil((to - from) / 86400000));
    const rows = [];
    for (const branch of branches) {
      const vehicles = await Vehicle.find({ branchId: branch._id }).select('_id name make model');
      const ids = vehicles.map(v => v._id);
      const bookings = await Booking.find({ vehicleId: { $in: ids }, status: { $in: ['PICKED_UP', 'RETURNED'] }, startDate: { $lt: to }, endDate: { $gt: from } });
      const bookedDays = bookings.reduce((sum, b) => { const s = Math.max(from, new Date(b.startDate)); const e = Math.min(to, new Date(b.endDate)); return sum + Math.max(0, (e - s) / 86400000); }, 0);
      const capacity = Math.max(1, vehicles.length * days);
      const revenue = bookings.reduce((sum, b) => sum + b.totalAmount, 0);
      rows.push({ branchId: branch._id, branch: branch.name, city: branch.city, vehicles: vehicles.length, bookedVehicleDays: Number(bookedDays.toFixed(2)), capacityVehicleDays: capacity, utilizationRate: Number((bookedDays / capacity * 100).toFixed(2)), revenue: Number(revenue.toFixed(2)) });
    }
    res.json({ success: true, data: { from, to, branches: rows, totals: { revenue: rows.reduce((s,r)=>s+r.revenue,0), utilizationRate: rows.length ? Number((rows.reduce((s,r)=>s+r.utilizationRate,0)/rows.length).toFixed(2)) : 0 } } });
  } catch (e) { next(e); }
});
app.get('/api/admin/dashboard', auth, permit('ADMIN', 'BRANCH_STAFF'), async (req, res, next) => {
  try { const filter = req.user.role === 'BRANCH_STAFF' ? { branchId: req.user.branchId } : {}; const vehicleCount = await Vehicle.countDocuments(filter); const available = await Vehicle.countDocuments({ ...filter, status: 'AVAILABLE' }); const rented = await Vehicle.countDocuments({ ...filter, status: 'RENTED' }); const maintenance = await Vehicle.countDocuments({ ...filter, status: 'MAINTENANCE' }); const bookingFilter = req.user.role === 'BRANCH_STAFF' ? { vehicleId: { $in: await Vehicle.find({ branchId: req.user.branchId }).distinct('_id') } } : {}; const bookings = await Booking.countDocuments(bookingFilter); const revenue = await Booking.aggregate([{ $match: { ...bookingFilter, status: { $in: ['RETURNED'] } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]); res.json({ success: true, data: { vehicleCount, available, rented, maintenance, bookings, revenue: revenue[0]?.total || 0 } }); } catch (e) { next(e); }
});

app.use((err, _req, res, _next) => {
  const status = err.status || (err.name === 'ValidationError' ? 400 : 500);
  const code = err.errorCode || (err.name === 'ValidationError' ? 'VALIDATION_ERROR' : 'INTERNAL_ERROR');
  res.status(status).json({ success: false, message: err.message || 'Internal server error', errorCode: code });
});

await mongoose.connect(MONGODB_URI);
app.listen(PORT, () => console.log(`Vehicle Rental API running on http://localhost:${PORT}`));
