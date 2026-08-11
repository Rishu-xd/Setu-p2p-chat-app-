"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { QWBPConnection } from "qwbp";
import ChatUI from "./ChatUI";

// ---------------------------------------------------------------------------
// Uint8Array <-> URL-safe base64
// ---------------------------------------------------------------------------

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function makePairingUrl(payload: Uint8Array): string {
  const encoded = bytesToBase64Url(payload);
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = `qwbp=${encoded}`;
  return url.toString();
}

function readPairingPayloadFromUrl(value: string): Uint8Array {
  let raw = value.trim();
  try {
    const url = new URL(raw);
    raw = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  } catch {
    raw = raw.startsWith("#") ? raw.slice(1) : raw;
  }
  if (raw.startsWith("qwbp=")) raw = raw.slice("qwbp=".length);
  if (!raw) throw new Error("No QWBP payload was found in that URL.");
  return base64UrlToBytes(raw);
}

// ---------------------------------------------------------------------------
// Page & State Machine
// ---------------------------------------------------------------------------

type Step =
  | "choose-role"
  | "a-show-initial"
  | "a-import-response"
  | "b-import-initial"
  | "b-show-response"
  | "connected";

type Role = "A" | "B" | null;

interface Message {
  id: string;
  sender: "me" | "peer";
  text: string;
  timestamp: string;
}

const CONNECTION_SESSION_TIMEOUT_MS = 10 * 60 * 1000;
const GENERATE_TIMEOUT_MS = 15000;

export default function QWBPPage() {
  const [role, setRole] = useState<Role>(null);
  const [step, setStep] = useState<Step>("choose-role");
  const [statusMsg, setStatusMsg] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [pairingUrl, setPairingUrl] = useState("");
  const [generating, setGenerating] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [autoDetected, setAutoDetected] = useState(false);

  // Connection-wide Chat Messages
  const [messages, setMessages] = useState<Message[]>([]);

  const connectionRef = useRef<QWBPConnection | null>(null);
  const channelRef = useRef<any>(null);

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [...prev, line]);
  }, []);

  const copyText = useCallback(async (text: string, successMsg?: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        textArea.remove();
      }
      if (successMsg) setStatusMsg(successMsg);
    } catch {
      if (successMsg) setStatusMsg(successMsg);
    }
  }, []);

  const runWithProgress = useCallback(
    async (task: () => Promise<void>) => {
      setGenerating(true);
      setElapsedMs(0);
      const start = performance.now();
      const tick = setInterval(() => {
        setElapsedMs(performance.now() - start);
      }, 30);

      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Timed out after 15s."));
        }, GENERATE_TIMEOUT_MS);
      });

      try {
        await Promise.race([task(), timeout]);
      } catch (err: any) {
        setStatusMsg(err?.message ?? "Something went wrong.");
      } finally {
        clearInterval(tick);
        if (timeoutId) clearTimeout(timeoutId);
        setElapsedMs(performance.now() - start);
        setGenerating(false);
      }
    },
    []
  );

  const wireDataChannel = useCallback(
    (conn: QWBPConnection) => {
      conn.onDataChannel((channel: any) => {
        channelRef.current = channel;
        setStep("connected");

        channel.onmessage = (e: MessageEvent) => {
          const newMsg: Message = {
            id: Math.random().toString(36).substring(2, 9),
            sender: "peer",
            text: String(e.data),
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          };
          setMessages((prev) => [...prev, newMsg]);
        };
      });
    },
    []
  );

  // -------------------------------------------------------------------------
  // Outbound Chat Transmitter
  // -------------------------------------------------------------------------

  const handleSendMessage = useCallback((text: string) => {
    const channel = channelRef.current;
    if (!channel) return;

    channel.send(text);

    const myMsg: Message = {
      id: Math.random().toString(36).substring(2, 9),
      sender: "me",
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, myMsg]);
  }, []);

  // -------------------------------------------------------------------------
  // Connection Handlers
  // -------------------------------------------------------------------------

  const startAsDeviceA = useCallback(async () => {
    setRole("A");
    await runWithProgress(async () => {
      const conn = new QWBPConnection({
        timeout: CONNECTION_SESSION_TIMEOUT_MS,
        onError: (err: any) => setStatusMsg(`Connection error: ${err?.message ?? err}.`),
      });
      await conn.initialize();
      connectionRef.current = conn;
      wireDataChannel(conn);
      const url = makePairingUrl(conn.getQRPayload());
      setPairingUrl(url);
      await copyText(url, "Pairing URL copied ✓ Send it to Device B.");
      setStep("a-show-initial");
      appendLog("Device A initialized. Initial pairing URL generated.");
    });
  }, [runWithProgress, wireDataChannel, appendLog, copyText]);

  const startAsDeviceB = useCallback(async () => {
    setRole("B");
    await runWithProgress(async () => {
      const conn = new QWBPConnection({
        timeout: CONNECTION_SESSION_TIMEOUT_MS,
        onError: (err: any) => setStatusMsg(`Connection error: ${err?.message ?? err}.`),
      });
      await conn.initialize();
      connectionRef.current = conn;
      wireDataChannel(conn);
      setStatusMsg("Paste the pairing URL from Device A below, then press Connect.");
      setStep("b-import-initial");
      appendLog("Device B initialized. Waiting for Device A's URL.");
    });
  }, [runWithProgress, wireDataChannel, appendLog]);

  const handleBImportedInitial = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) {
      setStatusMsg("Device B is not initialized.");
      return;
    }
    try {
      const payload = readPairingPayloadFromUrl(pairingUrl);
      await runWithProgress(async () => {
        conn.processScannedPayload(payload);
        const responseUrl = makePairingUrl(conn.getQRPayload());
        setPairingUrl(responseUrl);
        await copyText(responseUrl, "Response URL copied ✓ Send back to Device A.");
        setStep("b-show-response");
        appendLog("Processed Device A's URL. Response URL generated.");
      });
    } catch (err: any) {
      setStatusMsg(err?.message ?? "Invalid pairing URL.");
    }
  }, [pairingUrl, runWithProgress, appendLog, copyText]);

  const handleAImportedResponse = useCallback(async () => {
    const conn = connectionRef.current;
    if (!conn) {
      setStatusMsg("Device A is not initialized.");
      return;
    }
    try {
      const payload = readPairingPayloadFromUrl(pairingUrl);
      await runWithProgress(async () => {
        conn.processScannedPayload(payload);
        appendLog("Processed Device B's response URL. Finalizing connection...");
        setStatusMsg("Finalizing connection...");
      });
    } catch (err: any) {
      setStatusMsg(err?.message ?? "Invalid response URL.");
    }
  }, [pairingUrl, runWithProgress, appendLog]);

  const copyPairingUrl = useCallback(async () => {
    if (!pairingUrl) return;
    await copyText(pairingUrl, "SETU URL copied ✓");
  }, [pairingUrl, copyText]);

  useEffect(() => {
    if (typeof window === "undefined" || autoDetected) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#qwbp=")) return;
    const encoded = hash.slice("#qwbp=".length);
    if (!encoded) return;

    setAutoDetected(true);
    setRole("B");
    setPairingUrl(window.location.href);
    setStatusMsg("Pairing request detected. Connecting…");

    void (async () => {
      try {
        const conn = new QWBPConnection({
          timeout: CONNECTION_SESSION_TIMEOUT_MS,
          onError: (err: any) => setStatusMsg(`Connection error: ${err?.message ?? err}.`),
        });
        await conn.initialize();
        connectionRef.current = conn;
        wireDataChannel(conn);
        conn.processScannedPayload(base64UrlToBytes(encoded));

        const responseUrl = makePairingUrl(conn.getQRPayload());
        setPairingUrl(responseUrl);
        await copyText(responseUrl, "Response URL copied ✓ Send back to Device A.");
        window.history.replaceState(null, "", window.location.pathname);
        setStep("b-show-response");
        appendLog("Auto-detected Device A's pairing URL and generated response.");
      } catch (err: any) {
        setStatusMsg(err?.message ?? "Could not process the pairing URL.");
        setStep("b-import-initial");
      }
    })();
  }, [autoDetected, wireDataChannel, appendLog, copyText]);

  const reset = useCallback(() => {
    connectionRef.current = null;
    channelRef.current = null;
    setRole(null);
    setStep("choose-role");
    setStatusMsg("");
    setLog([]);
    setPairingUrl("");
    setGenerating(false);
    setMessages([]);
  }, []);

  // -------------------------------------------------------------------------
  // Render Switch: If connected, render the standalone liquid-glass Chat UI
  // -------------------------------------------------------------------------

  if (step === "connected" && role) {
    return (
      <ChatUI
        role={role}
        messages={messages}
        onSendMessage={handleSendMessage}
        onReset={reset}
      />
    );
  }

  // Fallback setup pairing page UI
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">LOKSetu Pairing</h1>
        <p className="mt-1 text-sm text-neutral-500">
         Pair two devices over an encrypted DataChannel using the <span className="text-amber-50">QWBP protocol</span>. The handshake payload is exchanged directly through a URL, with no central signaling server.
        </p>
      </header>

      {step === "choose-role" && (
        <div className="flex flex-col gap-3">
          <button
            onClick={startAsDeviceA}
            disabled={generating}
            className=" cursor-pointer rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create SETU
          </button>
          <button
            onClick={startAsDeviceB}
            disabled={generating}
            className=" cursor-pointer rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium hover:bg-neutral-50 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            Join SETU
          </button>
        </div>
      )}

      {generating && (
        <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-neutral-700">Compressing…</span>
            <span className="font-mono text-xs text-neutral-400">
              {elapsedMs.toFixed(0)} ms / {GENERATE_TIMEOUT_MS} ms
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
            <div
              className="h-full rounded-full bg-neutral-900 transition-[width] duration-75 ease-linear"
              style={{ width: `${Math.min((elapsedMs / GENERATE_TIMEOUT_MS) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {statusMsg && step !== "choose-role" && !generating && (
        <p className="text-sm text-neutral-600">{statusMsg}</p>
      )}

      {step === "a-show-initial" && (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-neutral-700">Send this  SETU URL to Device B</label>
          <textarea
            value={pairingUrl}
            readOnly
            rows={5}
            className="w-full resize-none rounded-md border border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-700 outline-none"
          />
          <button
            onClick={copyPairingUrl}
            className="c cursor-pointer rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Copy SETU URL
          </button>
          <button
            onClick={() => {
              setPairingUrl("");
              setStep("a-import-response");
              setStatusMsg("Paste Device B's response URL below.");
            }}
            disabled={generating}
            className="cursor-pointer hover:text-black rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {step === "a-import-response" && (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-neutral-700">Paste Device B&apos;s SETU URL</label>
          <textarea
            value={pairingUrl}
            onChange={(e) => setPairingUrl(e.target.value)}
            placeholder="Paste the full URL here..."
            rows={5}
            className="w-full resize-none rounded-md border border-neutral-300 p-3 text-xs outline-none focus:border-neutral-500"
          />
          <button
            onClick={handleAImportedResponse}
            disabled={generating || !pairingUrl.trim()}
            className="cursor-pointer rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Connect
          </button>
        </div>
      )}

      {step === "b-import-initial" && (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-neutral-700">Paste Device A&apos;s SETU URL</label>
          <textarea
            value={pairingUrl}
            onChange={(e) => setPairingUrl(e.target.value)}
            placeholder="Paste the full URL here..."
            rows={5}
            className="w-full resize-none rounded-md border border-neutral-300 p-3 text-xs outline-none focus:border-neutral-500"
          />
          <button
            onClick={handleBImportedInitial}
            disabled={generating || !pairingUrl.trim()}
            className=" cursor-pointer rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate response
          </button>
        </div>
      )}

      {step === "b-show-response" && (
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-neutral-700">Send this SETU URL back to Device A</label>
          <textarea
            value={pairingUrl}
            readOnly
            rows={5}
            className="w-full resize-none rounded-md border border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-700 outline-none"
          />
          <button
            onClick={copyPairingUrl}
            className=" cursor-pointer rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Copy SETU URL
          </button>
          <p className="text-center text-xs text-neutral-500">
            Send the URL to Device A and have it paste it into the response field.
          </p>
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
          {log.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}

      {step !== "choose-role" && (
        <button
          onClick={reset}
          className=" self-start text-xs text-neutral-400 hover:text-neutral-600 flex  hover:fill-gray-500 mt-2"
        >
          <svg width="20px" height="20px" viewBox="0 0 1024 1024" fill="#fff" className="mr-1 "  version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M669.6 849.6c8.8 8 22.4 7.2 30.4-1.6s7.2-22.4-1.6-30.4l-309.6-280c-8-7.2-8-17.6 0-24.8l309.6-270.4c8.8-8 9.6-21.6 2.4-30.4-8-8.8-21.6-9.6-30.4-2.4L360.8 480.8c-27.2 24-28 64-0.8 88.8l309.6 280z" fill="" /></svg><p className="cursor-pointer mt-1">Start over</p>
        </button>
      )}
    </main>
  );
}