importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyD6fRUVV9PR9A5jhLQayD-4S5YTuX9N4Ag",
  authDomain: "remotedesk-485214.firebaseapp.com",
  projectId: "remotedesk-485214",
  messagingSenderId: "631615784234",
  appId: "1:631615784234:web:e3a2d6380d2dace96e4a53"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/logo192.png"
  };

  self.registration.showNotification(notificationTitle, notificationOptions);

});
