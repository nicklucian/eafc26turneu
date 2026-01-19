// @ts-ignore
import { initializeApp } from "firebase/app";
// @ts-ignore
import { getAuth } from "firebase/auth";
// @ts-ignore
import { getFirestore } from "firebase/firestore";

// Configuration updated with provided credentials
const firebaseConfig = {
  apiKey: "AIzaSyAU_sYXsWZOgeHf1BbmzB4knv8R0paFhCU",
  authDomain: "fc26-pro-live.firebaseapp.com",
  projectId: "fc26-pro-live",
  storageBucket: "fc26-pro-live.firebasestorage.app",
  messagingSenderId: "943202841057",
  appId: "1:943202841057:web:2771b803bc629b655562a0",
  measurementId: "G-E6HVG2YSCX"
};

// Explicitly type variables as 'any' to bypass strict TypeScript checks during build
// while maintaining compatibility with the existing service code structure.
let app: any;
let auth: any;
let db: any;
let initError: string | null = null;

try {
  // Initialize Firebase
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  
  console.log("Firebase initialized successfully");

} catch (error: any) {
  console.error("Firebase Initialization Failed:", error.message);
  initError = error.message;
  
  app = null;
  auth = null;
  db = null;
}

export { app, auth, db, initError };