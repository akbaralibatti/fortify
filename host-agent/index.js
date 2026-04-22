const WebSocket = require("ws");
const { spawn } = require("child_process");
const wrtc = require("wrtc");
const { mouse, Button, Point, keyboard, Key, screen } = require("@nut-tree-fork/nut-js");

// --------------------
const DEVICE_ID = "my-laptop-host";
const WS_URL = "wss://signaling-server-631615784234.asia-south1.run.app";

const STREAM_WIDTH = 1280;
const STREAM_HEIGHT = 800;
const FRAME_SIZE = STREAM_WIDTH * STREAM_HEIGHT * 3 / 2;

// How long to wait in "disconnected" state before force-cleaning up.
// WebRTC "disconnected" is temporary and may recover on network blips.
// A browser refresh sends a signaling "disconnect" first (fast path),
// but this timeout is the safety net for cases where that signal is missed.
const DISCONNECTED_TIMEOUT_MS = 5000;

// --------------------
let connected = false;
let ffmpeg = null;
let ACTUAL_WIDTH = 0;
let ACTUAL_HEIGHT = 0;
let disconnectTimer = null;

let ws = null;
let pc = null;
let videoSource = null;
let currentClientId = null;

console.log("Device:", DEVICE_ID);

// --------------------
async function initScreenDimensions() {
  ACTUAL_WIDTH = await screen.width();
  ACTUAL_HEIGHT = await screen.height();
  console.log(`Actual screen: ${ACTUAL_WIDTH}x${ACTUAL_HEIGHT}`);
  console.log(`Stream size: ${STREAM_WIDTH}x${STREAM_HEIGHT}`);
}

// --------------------
function scaleCoordinates(x, y) {
  return {
    x: Math.round((x / STREAM_WIDTH) * ACTUAL_WIDTH),
    y: Math.round((y / STREAM_HEIGHT) * ACTUAL_HEIGHT)
  };
}

// --------------------
function clearDisconnectTimer() {
  if (disconnectTimer) {
    clearTimeout(disconnectTimer);
    disconnectTimer = null;
  }
}

// --------------------
function cleanupPeer() {
  clearDisconnectTimer();
  connected = false;
  currentClientId = null;
  videoSource = null;

  if (ffmpeg) {
    ffmpeg.kill("SIGINT");
    ffmpeg = null;
  }

  if (pc) {
    const oldPc = pc;
    pc = null;
    oldPc.onconnectionstatechange = null;
    oldPc.onicecandidate = null;
    oldPc.ondatachannel = null;
    oldPc.ontrack = null;
    oldPc.close();
  }

  console.log("🔄 Host reset — ready for new connection");
}

// --------------------
function connectWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) return;

  console.log("Connecting to signaling server...");
  ws = new WebSocket(WS_URL);

  ws.on("open", async () => {
    console.log("✅ Connected to signaling server");
    await initScreenDimensions();
    ws.send(JSON.stringify({ type: "register-host", deviceId: DEVICE_ID }));
  });

  ws.on("message", async (msg) => {
    const data = JSON.parse(msg);

    // ✅ Fast path: client sent explicit disconnect (button click or page close)
    if (data.signal?.type === "disconnect" && data.from === currentClientId) {
      console.log(`👋 Client ${data.from} disconnected intentionally`);
      cleanupPeer();
      return;
    }

    if (data.signal?.type === "offer") {
      console.log(`📨 Offer received from ${data.from}`);

      if (connected) {
        console.log(`🚫 Rejecting ${data.from} — host is busy`);
        ws.send(JSON.stringify({
          type: "signal",
          target: data.from,
          signal: { type: "busy" }
        }));
        return;
      }

      if (pc) cleanupPeer();

      currentClientId = data.from;

      const peer = createPeer();
      pc = peer.pc;
      videoSource = peer.videoSource;
      attachPeerEvents();

      await pc.setRemoteDescription(data.signal);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      ws.send(JSON.stringify({
        type: "signal",
        target: currentClientId,
        signal: answer
      }));
    }

    if (data.signal?.type === "candidate") {
      if (pc && data.from === currentClientId) {
        try {
          await pc.addIceCandidate(data.signal.candidate);
        } catch (e) {
          console.log("ICE candidate error:", e.message);
        }
      }
    }
  });

  ws.on("close", () => {
    console.log("⚠️ WebSocket closed - reconnecting...");
    setTimeout(connectWebSocket, 3000);
  });

  ws.on("error", err => {
    console.log("WS error:", err.message);
  });
}

connectWebSocket();

// --------------------
function createPeer() {
  const pc = new wrtc.RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ]
  });

  const videoSource = new wrtc.nonstandard.RTCVideoSource();
  const track = videoSource.createTrack();
  pc.addTrack(track);

  return { pc, videoSource };
}

// --------------------
function attachPeerEvents() {
  const thisPc = pc;
  let captureStarted = false;

  thisPc.onicecandidate = e => {
    if (e.candidate && currentClientId) {
      ws.send(JSON.stringify({
        type: "signal",
        target: currentClientId,
        signal: { type: "candidate", candidate: e.candidate }
      }));
    }
  };

  thisPc.onconnectionstatechange = () => {
    if (pc !== thisPc) return;

    console.log("Connection state:", thisPc.connectionState);

    if (thisPc.connectionState === "connected") {
      // Cancel any pending timeout from a brief "disconnected" blip
      clearDisconnectTimer();
      if (!captureStarted) {
        captureStarted = true;
        connected = true;
        console.log("✅ Client connected - starting capture");
        startCapture();
      }
    }

    // "disconnected" may be temporary (network blip) — start a timer.
    // If it recovers to "connected" the timer is cleared above.
    if (thisPc.connectionState === "disconnected") {
      console.log(`⏳ Disconnected — waiting ${DISCONNECTED_TIMEOUT_MS / 1000}s before cleanup...`);
      clearDisconnectTimer();
      disconnectTimer = setTimeout(() => {
        console.log("⌛ Timeout — force cleaning up stale connection");
        cleanupPeer();
      }, DISCONNECTED_TIMEOUT_MS);
    }

    // "failed" and "closed" are terminal — clean up immediately
    if (
      thisPc.connectionState === "failed" ||
      thisPc.connectionState === "closed"
    ) {
      console.log("❌ Connection terminal - cleaning up");
      cleanupPeer();
    }
  };

  thisPc.ondatachannel = (event) => {
    console.log("Control channel opened");
    const channel = event.channel;
    channel.onmessage = async (msg) => {
      handleControl(JSON.parse(msg.data));
    };
  };
}

// --------------------
let isMultiTouch = false;
let multiTouchTimer = null;
async function handleControl(data) {
  if (data.type === "move") {
    const p = scaleCoordinates(data.x, data.y);
    await mouse.setPosition(new Point(p.x, p.y));
  }

  if (data.type === "click") await mouse.click(Button.LEFT);
  if (data.type === "rightClick") {

  // 🔥 IGNORE DURING MULTITOUCH
  if (isMultiTouch) {
    return;
  }

  await mouse.click(Button.RIGHT);
}
  if (data.type === "down") await mouse.pressButton(Button.LEFT);
  if (data.type === "up") await mouse.releaseButton(Button.LEFT);

  if (data.type === "scroll") {
    isMultiTouch = true;

  clearTimeout(multiTouchTimer);
  multiTouchTimer = setTimeout(() => {
    isMultiTouch = false;
  }, 300);
    if (data.delta > 0) await mouse.scrollDown(Math.abs(data.delta));
    else await mouse.scrollUp(Math.abs(data.delta));
  }
  if (data.type === "zoom") {
    return;
  }

  if (data.type === "keydown") {
    const keyMap = {
      Enter: Key.Enter, Backspace: Key.Backspace, Tab: Key.Tab,
      Escape: Key.Escape, Space: Key.Space,
      ArrowUp: Key.Up, ArrowDown: Key.Down,
      ArrowLeft: Key.Left, ArrowRight: Key.Right,
      Delete: Key.Delete, Home: Key.Home, End: Key.End,
      PageUp: Key.PageUp, PageDown: Key.PageDown,
      F1: Key.F1, F2: Key.F2, F3: Key.F3, F4: Key.F4,
      F5: Key.F5, F6: Key.F6, F7: Key.F7, F8: Key.F8,
      F9: Key.F9, F10: Key.F10, F11: Key.F11, F12: Key.F12,
      Control: Key.LeftControl, Alt: Key.LeftAlt,
      Shift: Key.LeftShift, Meta: Key.LeftSuper
    };

    try {
      if (data.ctrlKey) await keyboard.pressKey(Key.LeftControl);
      if (data.altKey) await keyboard.pressKey(Key.LeftAlt);
      if (data.shiftKey) await keyboard.pressKey(Key.LeftShift);
      if (data.metaKey) await keyboard.pressKey(Key.LeftSuper);

      if (keyMap[data.key]) {
        await keyboard.pressKey(keyMap[data.key]);
        await keyboard.releaseKey(keyMap[data.key]);
      } else if (data.key.length === 1) {
        await keyboard.type(data.key);
      }

      if (data.metaKey) await keyboard.releaseKey(Key.LeftSuper);
      if (data.shiftKey) await keyboard.releaseKey(Key.LeftShift);
      if (data.altKey) await keyboard.releaseKey(Key.LeftAlt);
      if (data.ctrlKey) await keyboard.releaseKey(Key.LeftControl);
    } catch (e) {
      console.log("Keyboard error:", e.message);
    }
  }
}

// --------------------
function startCapture() {
  if (ffmpeg) return;

  console.log("Starting FFmpeg capture...");

  ffmpeg = spawn("ffmpeg", [
    "-f", "gdigrab",
    "-framerate", "30",
    "-i", "desktop",
    "-preset", "ultrafast",
    "-tune", "zerolatency",
    "-fflags", "nobuffer",
    "-flags", "low_delay",
    "-probesize", "32",
    "-analyzeduration", "0",
    "-vf", `scale=${STREAM_WIDTH}:${STREAM_HEIGHT},format=yuv420p`,
    "-pix_fmt", "yuv420p",
    "-f", "rawvideo",
    "-vsync", "0",
    "pipe:1"
  ]);

  let buffer = Buffer.alloc(0);

  ffmpeg.stdout.on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= FRAME_SIZE) {
      const frame = buffer.subarray(0, FRAME_SIZE);
      buffer = buffer.subarray(FRAME_SIZE);

      if (!videoSource) {
        ffmpeg?.kill("SIGINT");
        return;
      }

      try {
        videoSource.onFrame({
          width: STREAM_WIDTH,
          height: STREAM_HEIGHT,
          data: frame
        });
      } catch {
        ffmpeg?.kill("SIGINT");
        ffmpeg = null;
        return;
      }
    }
  });

  ffmpeg.on("close", (code) => {
    console.log(`FFmpeg exited (code ${code})`);
    ffmpeg = null;
  });
}
