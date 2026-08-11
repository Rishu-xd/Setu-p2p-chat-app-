"use client";

 // app/qwbp/page.tsx
 //
 // Pairs two devices using QWBP by exchanging the small handshake payload
 // directly inside the URL fragment instead of a file or QR code.
 //
 // IMPORTANT:
 // The payload is put after "#" (the URL fragment). Browsers do NOT send the
 // fragment to the server, so the handshake payload is processed client-side.
 //
 // Flow:
 //   1. Device A generates a payload and creates a URL containing it.
 //   2. Send/copy that URL to Device B and open/paste it there.
 //   3. Device B processes A's payload and creates a response URL.
 //   4. Send/copy the response URL back to Device A.
 //   5. Device A processes it and both sides share an encrypted DataChannel.
 //
 // Install:
 //   npm install qwbp

 import { useCallback, useEffect, useState, useRef } from "react";
 import { QWBPConnection } from "qwbp";

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
 //
 // We deliberately use the fragment (#...) rather than ?payload=...
 // because the fragment is not included in the HTTP request to Next.js.
 // ---------------------------------------------------------------------------

 function makePairingUrl(payload: Uint8Array): string {
   const encoded = bytesToBase64Url(payload);
   const url = new URL(window.location.href);

   // Remove any previous handshake payload.
   url.search = "";
   url.hash = `qwbp=${encoded}`;

   return url.toString();
 }

 function readPairingPayloadFromUrl(value: string): Uint8Array {
   let raw = value.trim();

   // Accept a complete URL.
   try {
     const url = new URL(raw);
     raw = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
   } catch {
     // Also accept just:
     // qwbp=...
     // or #qwbp=...
     raw = raw.startsWith("#") ? raw.slice(1) : raw;
   }

   if (raw.startsWith("qwbp=")) {
     raw = raw.slice("qwbp=".length);
   }

   if (!raw) {
     throw new Error("No QWBP payload was found in that URL.");
   }

   return base64UrlToBytes(raw);
 }

 // ---------------------------------------------------------------------------
 // Page state machine
 // ---------------------------------------------------------------------------

 type Step =
   | "choose-role"
   | "a-show-initial"
   | "a-import-response"
   | "b-import-initial"
   | "b-show-response"
   | "connected";

 type Role = "A" | "B" | null;

 const CONNECTION_SESSION_TIMEOUT_MS = 10 * 60 * 1000;
 const GENERATE_TIMEOUT_MS = 15000;

 export default function QWBPPage() {
   const [role, setRole] = useState<Role>(null);
   const [step, setStep] = useState<Step>("choose-role");
   const [statusMsg, setStatusMsg] = useState("");
   const [log, setLog] = useState<string[]>([]);
   const [inbound, setInbound] = useState("");
   const [pairingUrl, setPairingUrl] = useState("");
   const [generating, setGenerating] = useState(false);
   const [elapsedMs, setElapsedMs] = useState(0);
  const [autoDetected, setAutoDetected] = useState(false);

   const connectionRef = useRef<QWBPConnection | null>(null);
   const channelRef = useRef<any>(null);

   const appendLog = useCallback((line: string) => {
     setLog((prev) => [...prev, line]);
   }, []);

   const runWithProgress = useCallback(
     async (task: () => Promise<void>) => {
       setGenerating(true);
       setElapsedMs(0);

       const start = performance.now();

       const tick = setInterval(() => {
         setElapsedMs(performance.now() - start);
       }, 30);

       let timeoutId: ReturnType<typeof setTimeout>;

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
         clearTimeout(timeoutId!);
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
         setStatusMsg("Connected! Encrypted DataChannel is open.");

         channel.onmessage = (e: MessageEvent) => {
           setInbound(String(e.data));
           appendLog(`Received: ${e.data}`);
         };
       });
     },
     [appendLog]
   );

   // -------------------------------------------------------------------------
   // Device A
   // -------------------------------------------------------------------------

   const startAsDeviceA = useCallback(async () => {
     setRole("A");

     await runWithProgress(async () => {
       const conn = new QWBPConnection({
         timeout: CONNECTION_SESSION_TIMEOUT_MS,
         onError: (err: any) => {
           setStatusMsg(
             `Connection error: ${err?.message ?? err}. Start over and try again.`
           );
         },
       });

       await conn.initialize();

       connectionRef.current = conn;
       wireDataChannel(conn);

       const payload = conn.getQRPayload();
       const url = makePairingUrl(payload);

       setPairingUrl(url);
       await copyText(url, "Pairing URL copied ✓ Send it to Device B.");
       setStep("a-show-initial");

       appendLog("Device A initialized. Initial pairing URL generated.");
     });
   }, [runWithProgress, wireDataChannel, appendLog, copyText]);

   // -------------------------------------------------------------------------
   // Device B
   // -------------------------------------------------------------------------

   const startAsDeviceB = useCallback(async () => {
     setRole("B");

     await runWithProgress(async () => {
       const conn = new QWBPConnection({
         timeout: CONNECTION_SESSION_TIMEOUT_MS,
         onError: (err: any) => {
           setStatusMsg(
             `Connection error: ${err?.message ?? err}. Start over and try again.`
           );
         },
       });

       await conn.initialize();

       connectionRef.current = conn;
       wireDataChannel(conn);

       setStatusMsg(
         "Paste the pairing URL from Device A below, then press Connect."
       );
       setStep("b-import-initial");

       appendLog("Device B initialized. Waiting for Device A's URL.");
     });
   }, [runWithProgress, wireDataChannel, appendLog]);

   // -------------------------------------------------------------------------
   // Device B: process A's URL
   // -------------------------------------------------------------------------

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

         const responsePayload = conn.getQRPayload();
         const responseUrl = makePairingUrl(responsePayload);

         setPairingUrl(responseUrl);
         await copyText(responseUrl, "Response URL copied ✓ Send it back to Device A.");
         setStep("b-show-response");

         appendLog(
           "Processed Device A's URL. Response URL generated."
         );
       });
     } catch (err: any) {
       setStatusMsg(err?.message ?? "Invalid pairing URL.");
     }
   }, [pairingUrl, runWithProgress, appendLog, copyText]);

   // -------------------------------------------------------------------------
   // Device A: process B's response URL
   // -------------------------------------------------------------------------

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

         appendLog(
           "Processed Device B's response URL. Finalizing connection..."
         );
         setStatusMsg("Finalizing connection...");
       });
     } catch (err: any) {
       setStatusMsg(err?.message ?? "Invalid response URL.");
     }
   }, [pairingUrl, runWithProgress, appendLog]);

   // -------------------------------------------------------------------------
   // Clipboard
   // -------------------------------------------------------------------------

   const copyPairingUrl = useCallback(async () => {
    if (!pairingUrl) return;
    await copyText(pairingUrl, "Pairing URL copied ✓");
  }, [pairingUrl, copyText]);

   // If this page was opened with a LokSetu pairing URL, automatically act as Device B.
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
        await copyText(responseUrl, "Response URL copied ✓ Send it back to Device A.");
        window.history.replaceState(null, "", window.location.pathname);
        setStep("b-show-response");
        appendLog("Auto-detected Device A's pairing URL and generated response.");
      } catch (err: any) {
        setStatusMsg(err?.message ?? "Could not process the pairing URL.");
        setStep("b-import-initial");
      }
    })();
  }, [autoDetected, wireDataChannel, appendLog, copyText]);

  const sendHello = useCallback(() => {
     const channel = channelRef.current;

     if (!channel) return;

     const msg = "Hello from " + (role === "A" ? "A!" : "B!");

     channel.send(msg);
     appendLog(`Sent: ${msg}`);
   }, [role, appendLog]);

   const reset = useCallback(() => {
     connectionRef.current = null;
     channelRef.current = null;

     setRole(null);
     setStep("choose-role");
     setStatusMsg("");
     setLog([]);
     setInbound("");
     setPairingUrl("");
     setGenerating(false);
   }, []);

   return (
     <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-4 py-10">
       <header>
         <h1 className="text-xl font-semibold tracking-tight">
           QWBP Pairing
         </h1>

         <p className="mt-1 text-sm text-neutral-500">
           Pair two devices over an encrypted DataChannel by exchanging the
           handshake payload directly inside a URL.
         </p>
       </header>

       {step === "choose-role" && (
         <div className="flex flex-col gap-3">
           <button
             onClick={startAsDeviceA}
             disabled={generating}
             className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
           >
             I'm Device A — start the connection
           </button>

           <button
             onClick={startAsDeviceB}
             disabled={generating}
             className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
           >
             I'm Device B — join a connection
           </button>
         </div>
       )}

       {generating && (
         <div className="flex flex-col gap-2 rounded-lg border border-neutral-200 p-4">
           <div className="flex items-center justify-between">
             <span className="text-sm font-medium text-neutral-700">
               Compressing…
             </span>

             <span className="font-mono text-xs text-neutral-400">
               {elapsedMs.toFixed(0)} ms / {GENERATE_TIMEOUT_MS} ms
             </span>
           </div>

           <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-200">
             <div
               className="h-full rounded-full bg-neutral-900 transition-[width] duration-75 ease-linear"
               style={{
                 width: `${Math.min(
                   (elapsedMs / GENERATE_TIMEOUT_MS) * 100,
                   100
                 )}%`,
               }}
             />
           </div>
         </div>
       )}

       {statusMsg && step !== "choose-role" && !generating && (
         <p className="text-sm text-neutral-600">{statusMsg}</p>
       )}

       {/* Device A: generated URL */}
       {step === "a-show-initial" && (
         <div className="flex flex-col gap-3">
           <label className="text-sm font-medium text-neutral-700">
             Send this pairing URL to Device B
           </label>

           <textarea
             value={pairingUrl}
             readOnly
             rows={5}
             className="w-full resize-none rounded-md border border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-700 outline-none"
           />

           <button
             onClick={copyPairingUrl}
             className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800"
           >
             Copy pairing URL
           </button>

           <button
             onClick={() => {
               setPairingUrl("");
               setStep("a-import-response");
               setStatusMsg("Paste Device B's response URL below.");
             }}
             disabled={generating}
             className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
           >
             Next: enter Device B's response
           </button>
         </div>
       )}

       {/* Device A: response URL */}
       {step === "a-import-response" && (
         <div className="flex flex-col gap-3">
           <label className="text-sm font-medium text-neutral-700">
             Paste Device B's response URL
           </label>

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
             className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
           >
             Connect
           </button>
         </div>
       )}

       {/* Device B: A's URL */}
       {step === "b-import-initial" && (
         <div className="flex flex-col gap-3">
           <label className="text-sm font-medium text-neutral-700">
             Paste Device A's pairing URL
           </label>

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
             className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
           >
             Generate response
           </button>
         </div>
       )}

       {/* Device B: response URL */}
       {step === "b-show-response" && (
         <div className="flex flex-col gap-3">
           <label className="text-sm font-medium text-neutral-700">
             Send this response URL back to Device A
           </label>

           <textarea
             value={pairingUrl}
             readOnly
             rows={5}
             className="w-full resize-none rounded-md border border-neutral-300 bg-neutral-50 p-3 text-xs text-neutral-700 outline-none"
           />

           <button
             onClick={copyPairingUrl}
             className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800"
           >
             Copy response URL
           </button>

           <p className="text-center text-xs text-neutral-500">
             Send the URL to Device A and have it paste it into the response
             field.
           </p>
         </div>
       )}

       {/* Connected */}
       {step === "connected" && (
         <div className="flex flex-col gap-4">
           <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-800">
             Connected via encrypted DataChannel.
           </div>

           <button
             onClick={sendHello}
             className="rounded-md bg-neutral-900 px-4 py-3 text-sm font-medium text-white hover:bg-neutral-800"
           >
             Send "Hello from {role}!"
           </button>

           {inbound && (
             <p className="text-sm text-neutral-700">
               Last received:{" "}
               <span className="font-mono">{inbound}</span>
             </p>
           )}
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
           className="mt-2 self-start text-xs text-neutral-400 underline hover:text-neutral-600"
         >
           Start over
         </button>
       )}
     </main>
   );
 }
