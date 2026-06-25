import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
const firebaseConfig = {
  apiKey: "AIzaSyAjdAdrVVwJvZ8vhrySwsm_WO7kZ44ZZ9I",
  authDomain: "mensajeria-24970.firebaseapp.com",
  projectId: "mensajeria-24970",
  storageBucket: "mensajeria-24970.firebasestorage.app",
  messagingSenderId: "287234369167",
  appId: "1:287234369167:web:3135b7b073d77e11c032fa"
};
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const CLOUDINARY_CLOUD = 'dtvsig9rv';
export const CLOUDINARY_PRESET = 'mensajeria';
