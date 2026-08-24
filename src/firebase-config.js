import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAudvuHhomBouhPzexW6Nd458H2q1NJ-_I",
  authDomain: "chatapdf-d6e6d.firebaseapp.com",
  projectId: "chatapdf-d6e6d",
  storageBucket: "chatapdf-d6e6d.firebasestorage.app",
  messagingSenderId: "508291150601",
  appId: "1:508291150601:web:cad905cb060be8354759d8"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);