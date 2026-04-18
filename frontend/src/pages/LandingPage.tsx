import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";

export default function LandingPage() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const match = url.trim().match(/github\.com\/([^/\s]+)\/([^/\s]+)/);
    if (!match) {
      setError(true);
      inputRef.current?.focus();
      return;
    }
    setError(false);
    navigate(`/${match[1]}/${match[2]}`);
  }

  return (
    <div
      style={{
        minHeight: "100svh",
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "clamp(2rem, 8vw, 6rem)",
        maxWidth: "900px",
        margin: "0 auto",
        width: "100%",
      }}
    >
      {/* Wordmark — pinned to top-left */}
      <div
        className="fade-up"
        style={{
          position: "absolute",
          top: "clamp(1.5rem, 3vw, 2.5rem)",
          left: "clamp(2rem, 8vw, 6rem)",
          fontSize: "11px",
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          color: "var(--muted-foreground)",
          fontWeight: 500,
        }}
      >
        AskAboutGit
      </div>

      {/* Main content */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {/* Headline */}
        <h1
          className="fade-up fade-up-delay-1"
          style={{
            fontSize: "clamp(2rem, 4.5vw, 4.2rem)",
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            margin: 0,
            fontWeight: 800,
          }}
        >
          Chat with any
          <br />
          <span style={{ color: "var(--green)", fontWeight: 300 }}>
            GitHub repository.
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className="fade-up fade-up-delay-2"
          style={{
            fontSize: "clamp(0.9rem, 1.5vw, 1.05rem)",
            color: "var(--muted-foreground)",
            margin: 0,
            lineHeight: 1.6,
            maxWidth: "420px",
            fontWeight: 400,
          }}
        >
          Paste any public GitHub URL. Understand the codebase instantly — no
          cloning, no setup, no account required.
        </p>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="fade-up fade-up-delay-3"
          style={{ width: "100%", maxWidth: "560px" }}
        >
          {/* Unified input row */}
          <div
            style={{
              display: "flex",
              alignItems: "stretch",
              border: `1px solid ${error ? "#ef4444" : "var(--border)"}`,
              borderRadius: "6px",
              overflow: "hidden",
              transition: "border-color 0.2s",
            }}
          >
            {/* Prefix badge */}
            <span
              style={{
                padding: "11px 14px",
                background: "#111",
                color: "var(--green)",
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.02em",
                borderRight: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              github.com/
            </span>

            {/* Text input */}
            <input
              ref={inputRef}
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(false);
              }}
              placeholder="owner/repo"
              autoFocus
              style={{
                flex: 1,
                padding: "11px 14px",
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--foreground)",
                fontSize: "14px",
                fontFamily: "inherit",
                fontWeight: 400,
                caretColor: "var(--green)",
                minWidth: 0,
              }}
            />

            {/* Submit button */}
            <button
              type="submit"
              style={{
                padding: "11px 22px",
                background: "var(--green)",
                color: "#0a0a0a",
                border: "none",
                fontSize: "13px",
                fontWeight: 700,
                fontFamily: "inherit",
                cursor: "pointer",
                letterSpacing: "0.04em",
                transition: "opacity 0.15s",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Ask →
            </button>
          </div>

          {error && (
            <p style={{ fontSize: "12px", color: "#ef4444", marginTop: "8px" }}>
              Paste a full GitHub URL, e.g. github.com/facebook/react
            </p>
          )}

          <p
            style={{
              fontSize: "12px",
              color: "var(--muted-foreground)",
              marginTop: "12px",
              lineHeight: 1.5,
            }}
          >
            Or swap the URL directly —{" "}
            <span style={{ color: "var(--foreground)", opacity: 0.4 }}>
              github.com → askaboutgit.guyregev.dev
            </span>
          </p>
        </form>
      </div>
    </div>
  );
}
