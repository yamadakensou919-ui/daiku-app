import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc, onSnapshot } from "firebase/firestore";

// Firebase Console → プロジェクト設定 → マイアプリ（daiku-app-web）の設定
const firebaseConfig = {
  apiKey: "AIzaSyARdODOfunw_E9b_A556Cvq7ZLMlO02HTo",
  authDomain: "daiku-app-c19a6.firebaseapp.com",
  projectId: "daiku-app-c19a6",
  storageBucket: "daiku-app-c19a6.firebasestorage.app",
  messagingSenderId: "79090129883",
  appId: "1:79090129883:web:749d5524e27074ccc4a5fe"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { signInWithEmailAndPassword, onAuthStateChanged, signOut, doc, setDoc, getDoc, onSnapshot };
