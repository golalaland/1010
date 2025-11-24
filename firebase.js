// firebase.js

// ---------- FIREBASE IMPORTS ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence } 
  from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { 
  getFirestore,
  doc,
  getDoc,
  runTransaction,
  collection,
  addDoc,
  serverTimestamp,
  updateDoc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ---------- FIREBASE CONFIG ----------
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// ---------- INITIALIZE APP ----------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ---------- FORCE LOCAL PERSISTENCE ----------
setPersistence(auth, browserLocalPersistence)
  .then(() => console.log("Firebase auth persistence set to LOCAL ✅"))
  .catch((err) => console.error("Error setting Firebase persistence:", err));

// ---------- EXPORT ----------
export { 
  app, auth, db,
  doc, getDoc, runTransaction, collection, addDoc, serverTimestamp, updateDoc, getDocs, setDoc,
  query, where, orderBy, onSnapshot, onAuthStateChanged
};
