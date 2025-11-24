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

/* ---------- Firebase Config ---------- */
const firebaseConfig = {
  apiKey: "AIzaSyD_GjkTox5tum9o4AupO0LeWzjTocJg8RI",
  authDomain: "dettyverse.firebaseapp.com",
  projectId: "dettyverse",
  storageBucket: "dettyverse.firebasestorage.app",
  messagingSenderId: "1036459652488",
  appId: "1:1036452488:web:e8910172ed16e9cac9b63d",
  measurementId: "G-NX2KWZW85V"
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
