import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

if (!process.env.MONGODB_URI || !process.env.SEED_PASSWORD) throw new Error('MONGODB_URI and SEED_PASSWORD are required for seeding');
const { Schema } = mongoose;
const branchSchema = new Schema({branchId:{type:String,unique:true},name:String,location:String,city:String},{timestamps:true});
const userSchema = new Schema({name:String,email:{type:String,unique:true},passwordHash:String,role:String,branchId:{type:Schema.Types.ObjectId}},{timestamps:true});
const vehicleSchema = new Schema({branchId:Schema.Types.ObjectId,type:String,name:String,make:String,model:String,photos:[String],perDayRate:Number,permittedKilometers:Number,extraKilometerCharge:Number,fuelType:String,fuelTankCapacity:Number,status:String},{timestamps:true});
const addOnSchema = new Schema({type:{type:String,unique:true},label:String,pricePerDay:Number,active:Boolean},{timestamps:true});
const Branch=mongoose.model('Branch',branchSchema),User=mongoose.model('User',userSchema),Vehicle=mongoose.model('Vehicle',vehicleSchema),AddOn=mongoose.model('AddOn',addOnSchema);
await mongoose.connect(process.env.MONGODB_URI);
await Promise.all([User.deleteMany({}),Branch.deleteMany({}),Vehicle.deleteMany({}),AddOn.deleteMany({})]);
const branches=await Branch.insertMany([
 {branchId:'BR001',name:'Indiranagar Hub',location:'Indiranagar, Bengaluru',city:'Indiranagar, Bengaluru'},
 {branchId:'BR002',name:'Koramangala Hub',location:'Koramangala, Bengaluru',city:'Koramangala, Bengaluru'}
]);
const passwordHash=await bcrypt.hash(process.env.SEED_PASSWORD,12);
await User.insertMany([
 {name:'System Administrator',email:'admin@vroom.local',passwordHash,role:'ADMIN'},
 {name:'Indiranagar Staff',email:'staff1@vroom.local',passwordHash,role:'BRANCH_STAFF',branchId:branches[0]._id},
 {name:'Koramangala Staff',email:'staff2@vroom.local',passwordHash,role:'BRANCH_STAFF',branchId:branches[1]._id},
 {name:'Demo Customer',email:'customer@vroom.local',passwordHash,role:'CUSTOMER'}
]);
await Vehicle.insertMany([
 {branchId:branches[0]._id,type:'BIKE',name:'Street 200',make:'Yamaha',model:'FZ-X',perDayRate:799,permittedKilometers:100,extraKilometerCharge:4,fuelType:'PETROL',fuelTankCapacity:10,status:'AVAILABLE'},
 {branchId:branches[0]._id,type:'BIKE',name:'Urban 160',make:'Honda',model:'Hornet 2.0',perDayRate:749,permittedKilometers:100,extraKilometerCharge:4,fuelType:'PETROL',fuelTankCapacity:12,status:'AVAILABLE'},
 {branchId:branches[1]._id,type:'BIKE',name:'Tour 250',make:'Royal Enfield',model:'Hunter 350',perDayRate:999,permittedKilometers:120,extraKilometerCharge:5,fuelType:'PETROL',fuelTankCapacity:13.5,status:'AVAILABLE'},
 {branchId:branches[1]._id,type:'CAR',name:'Compact Automatic',make:'Hyundai',model:'i20',perDayRate:1899,permittedKilometers:150,extraKilometerCharge:8,fuelType:'PETROL',fuelTankCapacity:37,status:'AVAILABLE'}
]);
await AddOn.insertMany([
 {type:'GPS',label:'GPS Navigation',pricePerDay:0,active:true},
 {type:'INSURANCE',label:'Insurance Cover',pricePerDay:0,active:true},
 {type:'DRIVER',label:'Driver',pricePerDay:0,active:true}
]);
console.log('Seed complete. Use the SEED_PASSWORD value to sign in with the seeded demo accounts.');
await mongoose.disconnect();
