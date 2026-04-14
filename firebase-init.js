// firebase-init.js
// تهيئة Firebase Realtime Database بصيغة modular

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import {
  getDatabase,
  ref as dbRef,
  onValue,
  set,
  update,
  remove,
  runTransaction,
  push,
  get,
  query,
  orderByChild,
  limitToFirst,
  limitToLast,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDHdytx9Zicc4gi92fJz6b3IPnrAweLLp0",
  authDomain: "actor-d244f.firebaseapp.com",
  databaseURL: "https://actor-d244f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "actor-d244f",
  storageBucket: "actor-d244f.firebasestorage.app",
  messagingSenderId: "163741303451",
  appId: "1:163741303451:web:10bde58d517cb15c94bc3e",
  measurementId: "G-WNGKV3EVQK",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

const actressesRef = dbRef(db, "actresses");

function actressRef(id) {
  return dbRef(db, `actresses/${id}`);
}

function createActressId() {
  return `actress_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export {
  app,
  db,
  actressesRef,
  actressRef,
  createActressId,
  onValue,
  set,
  update,
  remove,
  runTransaction,
  push,
  get,
  query,
  orderByChild,
  limitToFirst,
  limitToLast,
};