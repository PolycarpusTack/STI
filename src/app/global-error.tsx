"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en" className="dark">
      <body style={{ background: "#0B0F19", color: "#9BAAC4", display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", margin: 0, fontFamily: "monospace" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#F87171", marginBottom: "12px" }}>
            Application Error
          </div>
          <button
            onClick={reset}
            style={{ background: "transparent", border: "1px solid #1F2D45", color: "#9BAAC4", padding: "6px 14px", cursor: "pointer", fontSize: "11px", letterSpacing: "0.08em" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
