import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyD6fRUVV9PR9A5jhLQayD-4S5YTuX9N4Ag",
  authDomain: "remotedesk-485214.firebaseapp.com",
  projectId: "remotedesk-485214",
  storageBucket: "remotedesk-485214.appspot.com",
  messagingSenderId: "631615784234",
  appId: "1:631615784234:web:e3a2d6380d2dace96e4a53"
};

const app = initializeApp(firebaseConfig);

export const messaging = getMessaging(app);
