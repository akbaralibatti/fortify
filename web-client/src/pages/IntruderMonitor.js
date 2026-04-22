import React, { useEffect, useState } from "react";
import "../App.css";

const API =
  "https://signaling-server-631615784234.asia-south1.run.app";

function IntruderMonitor() {
  const [intruders, setIntruders] = useState([]);

  useEffect(() => {
    fetch(API + "/intruders")
      .then((res) => res.json())
      .then((data) => setIntruders(data))
      .catch((err) => console.error("Error fetching intruders:", err));
  }, []);

  return (
    <div className="app-container">

      {/* HEADER */}
      <div
        className="app-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2>Intruder Monitor</h2>

        {/* GLOBAL GCS BUTTON */}
        <a
          href="https://console.cloud.google.com/storage/browser/remotedesktop-face-dataset-akbarali"
          target="_blank"
          rel="noreferrer"
        >
          <button className="btn-host">
            Open GCS Bucket
          </button>
        </a>
      </div>

      {/* GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, 320px)",
          gap: "20px",
        }}
      >
        {intruders.length === 0 ? (
          <p>No intruder events found</p>
        ) : (
          intruders.map((event, i) => (
            <div
              key={i}
              style={{
                background: "white",
                padding: "10px",
                borderRadius: "12px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
              }}
            >
              {/* IMAGE */}
              <img
                src={event.image}
                alt="Intruder"
                style={{
                  width: "100%",
                  borderRadius: "10px",
                  objectFit: "cover",
                }}
                onError={(e) => {
                  e.target.src =
                    "https://via.placeholder.com/320x240?text=No+Image";
                }}
              />

              {/* DETAILS */}
              <p><b>Device:</b> {event.deviceId || "Unknown"}</p>
              <p><b>Time:</b> {event.time || "N/A"}</p>
              <p><b>Location:</b> {event.location || "N/A"}</p>

              {/* PER IMAGE BUTTON */}
              {event.image && (
                <a
                  href={event.image}
                  target="_blank"
                  rel="noreferrer"
                >
                  <button className="btn-host">
                    Open in GCS
                  </button>
                </a>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default IntruderMonitor;
