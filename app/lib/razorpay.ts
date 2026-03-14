import Razorpay from "razorpay";
import { validateServerEnv } from "@/app/lib/env";

validateServerEnv();

const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || "",
  key_secret: process.env.RAZORPAY_KEY_SECRET || "",
});

export default razorpayInstance;
