import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

// TODO: Replace with your Firebase credentials
// Get these from Firebase Console > Project Settings
const firebaseConfig = {
  apiKey: "AIzaSyDIqVgGYWiY6SHBCihqeqlJ88SPaPiwBv0",
  authDomain: "shiksha-aid.firebaseapp.com",
  projectId: "shiksha-aid",
  storageBucket: "shiksha-aid.appspot.com",
  messagingSenderId: "1018363210699",
  appId: "1:1018363210699:web:f44380efe3056bb9b3244e",
  databaseURL: "https://shiksha-aid-default-rtdb.firebaseio.com",
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);
