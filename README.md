# Setu — P2P Chat App

Setu is an experimental **device-to-device (D2D) chat application** built as a prototype for the networking layer that will eventually become part of **LokSetu**.

The goal of Setu is simple:

> **Connect two devices directly without requiring a central signaling server to carry their communication.**

Setu currently focuses on establishing a secure connection between two devices through a small handshake exchanged using a URL.

---

## ✨ Features

*  **D2D communication**
*  Encrypted WebRTC DataChannel
*  URL-based device pairing 
*  No central signaling server
*  Copy/paste pairing instead of QR scanning
*  Lightweight handshake exchange
*  Basic real-time chat interface
*  QWBP-based connection handshake

---

##  How It Works

Setu uses a two-way handshake to establish the connection.

```text
Device A                         Device B
   │                                │
   │  Generate handshake             │
   │                                │
   │────── Setu URL ────────────────►│
   │                                │
   │                         Process handshake
   │                         Generate response
   │                                │
   │◄──── Response URL ──────────────│
   │                                │
   │  Process response               │
   │                                │
   └──────── D2D connection ────────┘
```

The handshake payload is encoded directly into the URL fragment:

```text
https://example.com/#qwbp=...
```

The fragment is processed on the client side and is not included in the normal HTTP request to the server.

After the handshake is completed, the devices communicate through an encrypted **WebRTC DataChannel**.

---

##  QWBP

Setu uses **QWBP** for the connection handshake.

QWBP is responsible for the handshake payload exchanged between the devices, while Setu provides the user-facing pairing and chat experience.

In short:

```text
Setu
  │
  ├── Pairing UI
  ├── URL exchange
  ├── Connection management
  └── Chat interface
        │
        ▼
      QWBP
        │
        └── Handshake
```

---

##  Why No Signaling Server?

A traditional WebRTC application commonly uses a signaling server to exchange connection information between two devices.

Setu intentionally experiments with a different approach.

The connection information is exchanged directly by the users through the pairing URLs.

This means Setu does not require a server operated by the project author to coordinate the handshake.

The current prototype therefore follows the principle:

> **The infrastructure required for connecting two devices should not have to be controlled by one central service.**

---

## 🔗 Pairing

### Device A

1. Start Setu as Device A.
2. Generate the pairing link.
3. Send the link to Device B.

### Device B

1. Open the Setu pairing link.
2. Setu detects the handshake automatically.
3. A response link is generated.
4. Send the response back to Device A.

### Device A

1. Open/paste the response.
2. Setu completes the handshake.
3. The encrypted DataChannel is established.

Once connected, the devices can exchange messages directly.

---

##  Tech Stack

* **Next.js**
* **React**
* **TypeScript**
* **WebRTC**
* **QWBP**
* **Tailwind CSS**

---

## 🚧 Current Status

Setu is an **experimental prototype**, not a production-ready messaging application.

The current implementation is primarily intended to prove that:

* two devices can establish a connection;
* the handshake can be exchanged without a dedicated signaling server;
* the handshake can be transported through URLs;
* an encrypted DataChannel can be established;
* a basic chat interface can operate over that connection.

There are still many things to improve before this could be considered a complete communication system.

---

## 🗺️ Future Direction

Setu is the first step toward a larger project called **LokSetu**.

The broader idea is to build a decentralized social network where the infrastructure is not controlled by a single organization.

The planned architecture looks roughly like:

```text
                         LokSetu
                            │
             ┌──────────────┼──────────────┐
             │              │              │
            D2D          Federation     Discovery
             │              │              │
        Device ↔ Device  Server ↔ Server  Find servers
             │              │              │
             └──────────────┼──────────────┘
                            │
                      Social Network
```

Independent users or organizations could operate LokSetu servers and allow other users to connect to them.

A discovery service could simply act as a directory of available servers rather than controlling the network itself.

The long-term goal is to make the network **distributed, interoperable, and not dependent on a single infrastructure provider**.

---

##  Setu → LokSetu

Setu is not intended to be the final social platform.

It is the **D2D networking prototype** that explores one of the building blocks needed for LokSetu.

```text
Setu
 │
 ├── D2D connection
 ├── QWBP handshake
 ├── URL pairing
 └── Encrypted DataChannel
          │
          ▼
       LokSetu
          │
          ├── Social accounts
          ├── Posts
          ├── Global feed
          ├── Chat
          ├── Communities
          ├── Independent servers
          ├── Server discovery
          └── D2D communication
```

---

##  Disclaimer

This project is experimental and intended for learning, research, and prototyping.

Do not assume the current implementation provides all the security, reliability, privacy, abuse prevention, or scalability guarantees required for production communication software.

---

##  License

See the repository's license file for licensing information.

---

### Built as the first step toward LokSetu.

**Setu — connecting devices directly.**
