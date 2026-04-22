const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
let latestLocation = {};
// -----------------------------
// 🔒 LOCK STATE (NEW ADDITION)
// -----------------------------
let lastPassword = null;
let isLocked = false;

// -----------------------------
// 🔔 FIREBASE ADMIN SETUP
// -----------------------------
const admin = require("firebase-admin");
const serviceAccount = require("./firebase-admin.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const tokens = [];

// -----------------------------
const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Signaling Server Alive ✅");
});

// -----------------------------
// STORAGE
// -----------------------------
const hosts = {};
const clients = {};

// -----------------------------
// USER DATABASE
// -----------------------------
const users = {
  "admin": "admin123",
  "user1": "password1",
};

// -----------------------------
// AUTH
// -----------------------------
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (users[username] && users[username] === password) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// -----------------------------
// SIGNAL ENDPOINT
// -----------------------------
app.post("/signal", (req, res) => {
  const msg = req.body;

  if (hosts[msg.target]) hosts[msg.target].send(JSON.stringify(msg));
  if (clients[msg.target]) clients[msg.target].send(JSON.stringify(msg));

  res.sendStatus(200);
});

// -----------------------------
// TOKEN REGISTER
// -----------------------------
app.post("/register-token", (req, res) => {
  const { token } = req.body;

  if (token && !tokens.includes(token)) {
    tokens.push(token);
    console.log("📱 Token registered");
  }

  res.sendStatus(200);
});

// -----------------------------
// INTRUDER ALERT
// -----------------------------
const intruderEvents = [];

app.post("/intruder-alert", async (req, res) => {

  const alert = req.body;

  console.log("⚠ Intruder alert:", alert);

  const event = {
    deviceId: alert.deviceId,
    image: alert.image,
    time: alert.time,
    location: alert.location || "Unknown",
    createdAt: Date.now()
  };

  intruderEvents.unshift(event);
  if (intruderEvents.length > 5) intruderEvents.pop();

  const message = {
    notification: {
      title: "⚠ Intruder Detected",
      body: `Device ${alert.deviceId} detected an intruder`
    },
    data: {
      image: alert.image || "",
      deviceId: alert.deviceId || "",
      time: alert.time || ""
    },
    tokens: tokens
  };

  try {
    if (tokens.length > 0) {
      await admin.messaging().sendEachForMulticast(message);
      console.log("📲 Push sent");
    }
  } catch (err) {
    console.error("Push error:", err);
  }

  res.sendStatus(200);
});

app.get("/intruders", (req, res) => {
  res.json(intruderEvents);
});

// -----------------------------
// WS SERVER
// -----------------------------
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// -----------------------------
// WS CONNECTION
// -----------------------------
wss.on("connection", (ws) => {

  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  ws.on("message", (data) => {

    let msg;

    try {
      msg = JSON.parse(data);
    } catch {
      console.log("Invalid JSON");
      return;
    }

    // -----------------------------
    // REGISTER HOST
    // -----------------------------
    if (msg.type === "register-host") {
      hosts[msg.deviceId] = ws;
      ws.role = "host";
      ws.deviceId = msg.deviceId;
      console.log("Host registered:", msg.deviceId);
      return;
    }

    // -----------------------------
    // REGISTER CLIENT
    // -----------------------------
    if (msg.type === "register-client") {

      if (!msg.authenticated) {
        ws.send(JSON.stringify({
          type: "auth-required"
        }));
        ws.close();
        return;
      }

      clients[msg.clientId] = ws;
      ws.role = "client";
      ws.clientId = msg.clientId;

      console.log("Client registered:", msg.clientId);

      // ✅ SEND INITIAL STATE (NEW)
      ws.send(JSON.stringify({
        type: "initial-state",
        locked: isLocked,
        password: lastPassword
      }));

      return;
    }

    // -----------------------------
    // HOST LIST
    // -----------------------------
    if (msg.type === "get-hosts") {

  const activeHosts = Object.entries(hosts)
    .filter(([id, socket]) => socket.readyState === WebSocket.OPEN)
    .map(([id]) => id);

  ws.send(JSON.stringify({
    type: "hosts-list",
    hosts: activeHosts
  }));

  return;
}

    // -----------------------------
    // 🔥 SIGNAL (DO NOT TOUCH)
    // -----------------------------
    if (msg.type === "signal") {

      const enriched = {
        ...msg,
        from: ws.clientId || ws.deviceId || "unknown"
      };

      console.log(
        `Relay signal: ${msg.signal?.type} → ${msg.target}`
      );

      if (hosts[msg.target]) {
        hosts[msg.target].send(JSON.stringify(enriched));
      }

      if (clients[msg.target]) {
        clients[msg.target].send(JSON.stringify(enriched));
      }

      return; // ⚠️ VERY IMPORTANT
    }

    // -----------------------------
    // 🔒 SYSTEM LOCK (SAFE ADD)
    // -----------------------------
    if (msg.type === "system-lock") {

      console.log("🔒 Lock command");

      lastPassword = msg.password;
      isLocked = true;

      Object.values(hosts).forEach(host => {
        host.send(JSON.stringify({
          type: "system-lock",
          password: msg.password
        }));
      });

      return;
    }

    // -----------------------------
    // 🔄 LOCK STATUS UPDATE
    // -----------------------------
    if (msg.type === "lock-status-update") {

      console.log("🔄 Lock status:", msg.locked);

      isLocked = msg.locked;

      Object.values(clients).forEach(client => {
        client.send(JSON.stringify({
          type: "lock-status",
          locked: msg.locked
        }));
      });

      return;
    }

  });

  ws.on("close", () => {

    if (ws.role === "host") {
      delete hosts[ws.deviceId];
      console.log("Host disconnected:", ws.deviceId);
    }

    if (ws.role === "client") {
      delete clients[ws.clientId];
      console.log("Client disconnected:", ws.clientId);
    }

  });

  ws.on("error", (err) => {
    console.log("WS error:", err.message);
  });

});

// -----------------------------
// HEARTBEAT
// -----------------------------
const heartbeatInterval = setInterval(() => {

  wss.clients.forEach((ws) => {

    if (!ws.isAlive) {

  console.log("Removing dead connection");

  // 🔥 REMOVE FROM HOSTS
  if (ws.role === "host") {
    delete hosts[ws.deviceId];
  }

  // 🔥 REMOVE FROM CLIENTS
  if (ws.role === "client") {
    delete clients[ws.clientId];
  }

  return ws.terminate();
}

    ws.isAlive = false;
    ws.ping();

  });

}, 30000);

wss.on("close", () => {
  clearInterval(heartbeatInterval);
});

// -----------------------------
// START
// -----------------------------
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});


// Save location from browser
app.post("/device-location", (req, res) => {
    const { lat, lon, deviceId } = req.body;

    latestLocation[deviceId] = { lat, lon };

    console.log("Updated location:", latestLocation);

    res.send("Location saved");
});

// Provide location to Python
app.get("/device-location/:deviceId", (req, res) => {
    const deviceId = req.params.deviceId;

    res.json(latestLocation[deviceId] || {});
});
