# PSession

`PSession` is a lightweight session management tool that provides a simple yet powerful API to help developers easily handle session communication processes in `one-to-one` or `one-to-many` communication scenarios.

## Features

-   🚀 Lightweight design, easy to integrate
-   🔄 Support for multi-port session management
-   ⏱️ Built-in session timeout mechanism
-   🔁 Support for retry mechanism
-   🧩 Flexible session ID management
-   📦 TypeScript support, type-safe

## Installation

```bash
npm install psession
yarn add psession
pnpm add psession
bun add psession
```

## How It Works

`PSession` is designed to help establish `request/response` communication when two endpoints on remote networks need to perform point-to-point asynchronous communication.

That is, sending an asynchronous message to a remote object and waiting for its response, ensuring end-to-end `request/response` communication between local and remote.

**Basic Principles:**

1. Create a `SessionManager` on `Local` to track and manage sessions.
2. Create a `Session` object, which is automatically assigned a `sid` by the local `SessionManager`.
3. When `session.send(message)` sends a message to `Remote`, the `session.send` method automatically adds a session identifier (i.e., `sid`) to the message body.

```ts
message = {
    type: "get",
    payload: 1,
};

session.send(message);
// Actually sends {type:'get',payload:1,sid:<session id>}
```

3. After `Remote` receives the message, it needs to **return the session id as-is** when responding. This way, locally, the response can be sent to the sender based on this `sid`.

## Quick Start

To help you quickly understand how to use `PSession`, assume there are two objects `Local` and `Remote` located on different computers, communicating via `TCP/UDP/WebSocket`, or in a browser communicating with a `worker`, and they call the `onMessage` method when receiving messages. As follows:

### Environment Setup

Below is an example of `request/response` communication between a page and a `worker` in a browser:

```ts
// main.js
const worker = new Worker("./worker.js");

class Local {
    constructor() {
        worker.onmessage = this.onMessage.bind(this);
    }
    onMessage(message) {
        // Receive messages from worker
    }
}

// worker.js
class Remote {
    constructor() {
        self.onmessage = this.onMessage.bind(this);
    }
    onMessage(message) {
        // Receive messages from page
    }
}
```

Now we need to use `PSession` to implement end-to-end message sending from `Local` to `Remote` and get the correct response.

### Step 1: Create `SessionManager`

On the sending side, you need to create a `SessionManager` to manage and track each session.

```ts
// main.ts
import { SessionManager } from "psession";

const worker = new Worker("./worker.js");

class Local {
    // Create session manager
    sessionManager = new SessionManager({
        // Configure a sender function to send messages to remote
        sender: (message) => {
            worker.postMessage(message);
        },
    });
    constructor() {
        worker.onmessage = this.onMessage.bind(this);
    }
    onMessage(message) {
        // Receive messages from worker
    }
}
```

### Step 2: Create `Session` and Send Message

Next, `Local` creates a session object and sends a message to `Remote`.

```ts
// main.ts
import { SessionManager } from "psession";

const worker = new Worker("./worker.js");

class Local {
    // Create session manager
    sessionManager = new SessionManager({
        // Configure a sender function to send messages to remote
        sender: (message) => {
            worker.postMessage(message);
        },
    });
    constructor() {
        worker.onmessage = this.onMessage.bind(this);
    }
    onMessage(message) {
        // Receive messages from worker
    }
    // Send message to remote
    send(message) {
        const session = this.sessionManager.createSession({ once: true });
        // session.send internally calls the configured sender to send the message via worker.postMessage

        return session.send(message);
    }
}

const local = new Local();
// send returns a Promise because it needs to wait for a response
// Send to remote and wait for response
const result = await local.send({ type: "request", value: 1 });
```

-   `this.sessionManager.createSession` creates a `Session` instance and saves it until the session ends.
-   The `{ once: true }` parameter is used to identify that the session is one-time and will be automatically destroyed when the session responds or ends.
-   `session.send` returns a `Promise` that is `resolved` or `rejected` when the session gets a response/timeout/abort/cancel, etc.

### Step 3: Receiver Response

When `Remote` receives a message from `Local`, it needs to identify and respond.

```ts
// worker.ts
class Remote {
    constructor() {
        self.onmessage = this.onMessage.bind(this);
    }
    onMessage(message) {
        // If sid>0 in the message body, it means this is a session message
        if (message.sid && message.sid > 0) {
            // ...process message
            self.postMessage({
                type: "response",
                payload: 100,
                // Important: need to return this sid value as-is so Local can identify it
                sid: message.sid,
            });
        }
    }
}
```

### Step 4: Handle Response Message

In `Step 2`, the `await local.send(....)` send statement is in a blocking state `pending`, waiting for a response from `Remote`.

When the `Local` side receives a message from `Remote` for identification, as follows:

```ts
// main.ts
import { SessionManager } from "psession";

const worker = new Worker("./worker.js");

class Local {
    sessionManager = new SessionManager(...);
    onMessage(message) {
        // Check if the received message is a session message
        // In fact, it just checks if the message body has sid and sid>0
        if(this.sessionManager.isSession(message)){
            // If yes, get the session instance, i.e., Session instance
            const session = this.sessionManager.getSession()
            // If the session instance exists,
            if(session){
                // Session response, i.e., the above await send() is resolved
                session.resolve(message)
            }else{
                // The session instance may have been destroyed due to timeout, etc.
            }
        }
    }
    ...
}
```

### Step 5: Get Response Result

When the sender identifies the received response and calls `session.resolve`, `await send(...)` can return the result.

```ts
const local = new Local();
// send returns a Promise because it needs to wait for a response
// Send to remote and wait for response
const result = await local.send({ type: "request", value: 1 });
console.log(result);
// { type: "response",payload: 100, sid: 1}
```

### Summary

Above, we only created a `SessionManager` on `Local`. If `Remote` also needs to send messages to `Local` and get responses, just create a `SessionManager` and handle it with the same logic.

## Guide

### Create Session Manager

The session manager is responsible for managing all session objects.

```typescript
import { SessionManager } from "psession";

// Create session manager
const manager = new SessionManager({
    // Function to send messages
    sender: (message) => {
        // Implement message sending logic
        console.log("Sending message:", message);
        // For example: socket.send(JSON.stringify(message));
    },
    // Optional configuration
    sessionTimeout: 5000, // Session timeout, default 60000ms (1 minute)
    sessionMaxLife: 600000, // Session max lifetime, default 600000ms (10 minutes)
    sessionIdName: "sid", // Session ID field name, default 'sid'
    maxSessionCount: 255, // Maximum session count, default 65535
});
```

-   The key point of `SessionManager` is to provide a `sender` function to send messages to the remote end.

### Create Session

When sending a message to the remote end and needing a response, you need to create a `Session` instance and call `await session.send` to send a session message and wait for a response.

```typescript
// Create a session
const session = manager.createSession("default");

// Send message and wait for reply
try {
    const response = await session.send({ command: "turn on light" });
    console.log("Received reply:", response);

    // Can continue sending messages in the same session
    if (response.status === "needPassword") {
        const result = await session.send({ password: "123456" });
        console.log("Verification result:", result);
    }
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Session timeout");
    }
} finally {
    // Remember to call end method to release resources after session ends
    session.end();
}
```

-   The created `Session` can be reused multiple times.
-   `await session.send(message)` will wait for the other party's response until timeout triggers `SessionTimeoutError`.

### Dispatch Session Messages

After executing `session.send`, the endpoint will be in the stage of waiting for a remote response. During this period, many messages may be received from the remote `Remote`. You need to identify whether it is a session message through `manager.isSession(message)`. If yes, find the corresponding session instance through `manager.getSession(message)`, then call `session.resolve(message)` to pass the message to the session handler, thus causing the `resolve` of `await session.send(message)`.

```typescript
// In message receiving handler
function onMessage(message) {
    // Check if it's a session message
    if (manager.isSession(message)) {
        // Get the corresponding session
        const session = manager.getSession(message);
        if (session) {
            // Pass the message to session handler
            session.resolve(message);
        }
    } else {
        // Handle non-session messages
        console.log("Received normal message:", message);
    }
}
```

**Key Points:**

-   Use `await session.send` to send session messages
-   When receiving messages, identify whether the received message is a session message through `manager.isSession`.
-   If yes, find the corresponding `session` instance and call `session.resolve`.
-   Since the sender may create multiple sessions, the above code's role is to dispatch messages to the corresponding `Session` instance.

### Respond to Session Messages

When `session.send(message)` sends a message, it automatically adds a `session ID (i.e., sid)` to the message, for example:

```ts
const response = await session.send({ type: "open", payload: 1 });
// Automatically adds sid when sending
// {sid:123, type:'open',payload:1}
```

The `sid` is automatically added and maintained by the session manager. And the field name of `sid` can also be configured through `sessionIdName`.

When the remote communication receiver receives this session message, it needs to carry this `sid` value in the response message when replying.
When the sender processes the response message, the `isSession` call essentially checks whether the received response message has a `sid`. If yes, it means it's a `Session` session message.
Then when calling `getSession`, it finds the corresponding session instance in the session manager based on the `sid` value in the response message.

After understanding the above basic logic, the logic of responding to a session is very simple: **just return the sid value as-is**.

The remote receiver does not need to use `PSession` either, **just carry the same `sid` value in the response message.**

### Retry Mechanism

`PSession` has a built-in retry mechanism. You can set the retry count and retry interval through the `retryCount` and `retryInterval` parameters of the `send` method.

```typescript
import { SessionTimeoutError } from "psession";

// Send message with built-in retry mechanism
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // Set retry parameters directly in the send method
        const response = await session.send(
            { command: "query status" },
            {
                retryCount: 3, // Retry 3 times (4 times total)
                retryInterval: 500, // 500ms interval between retries
            }
        );
        console.log("Received reply:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("Still timeout after multiple retries");
        } else {
            console.error("Error occurred:", error);
        }
    } finally {
        session.end();
    }
}
```

### Timeout Mechanism

`PSession` provides two timeout mechanisms to manage the session lifecycle:

1. **Session Timeout (sessionTimeout)**: Controls the maximum time to wait for a response after each message send
2. **Session Max Lifetime (sessionMaxLife)**: Controls the maximum lifetime of the entire session object

```typescript
// Configure timeout parameters when creating session manager
const manager = new SessionManager({
    sender: (message) => {
        /* sending logic */
    },
    sessionTimeout: 5000, // Session will timeout if no response is received after 5 seconds
    sessionMaxLife: 600000, // After 10 minutes, the session will be automatically cleaned up even if still in use
});

// Configure timeout parameters for a single send (higher priority than global configuration)
try {
    const response = await session.send(
        { command: "query status" },
        { timeout: 3000 } // Set 3 second timeout for this request only
    );
    console.log("Received reply:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Request timeout");
    }
}
```

**How Timeout Mechanism Works**:

-   After each message send, the system starts a timer. If no response is received within `sessionTimeout`, it throws `SessionTimeoutError`
-   The system periodically checks all sessions (by default every `sessionTimeout/2` time)
-   If a session's last activity time exceeds `sessionMaxLife`, it will automatically end and clean up the session
-   When using the retry mechanism, timeout detection is paused until all retries are complete
-   After a `Session` instance is created, it can be reused, i.e., the `send` method can be called multiple times. Each call to the `send` method starts `SessionTimeout`, i.e., `sessionTimeout` is the timeout for each call and wait for response.
-   `sessionMaxLife` is the lifecycle time of the entire `Session` instance, calculated from the last call to `send`. If it exceeds `sessionMaxLife`, the session instance is destroyed. Like browser session timeout (default is `20` minutes of inactivity).

### Multi-Port Sessions

`PSession` can also be used in one-to-many and many-to-many communication scenarios, such as when developing a `TCP Server` that needs to communicate point-to-point with multiple clients.

Sessions occur in end-to-end scenarios, and session management needs to identify different remote communication objects.

For this purpose, the `Port` concept is introduced in `PSession`:

1. **Role of Ports**:

    - Ports are used to distinguish different communication peers (such as different devices, services, or clients)
    - Each port maintains its own session collection, allowing `session IDs` of different ports to be managed independently
    - The port mechanism enables the system to establish sessions with multiple peers simultaneously without confusing session states
    - Session IDs of different `Ports` can be duplicated.

2. **One-to-Many Communication Scenario**:

    - When an application needs to communicate with multiple devices simultaneously, a port can be created for each device
    - Each port can independently manage sessions with the corresponding device, using their own session ID space
    - For example: A control center connects to multiple smart home devices simultaneously, each device using an independent port

3. **Many-to-Many Communication Scenario**:

    - In complex systems, multiple services need to communicate with multiple clients
    - The port mechanism allows the system to create independent session management spaces for each communication relationship
    - For example: In a microservice architecture, service A needs to communicate with services B, C, and D simultaneously

Here's a simple example of a `Socket` server using `PSession`, showing how to manage sessions for multiple clients:

```typescript
// server.ts
import { SessionManager } from "psession";
import * as net from "net";

// Create session manager
const manager = new SessionManager({
    sender: (message) => {
        // Send message to client
        const client = message.client;
        if (client && !client.destroyed) {
            client.write(JSON.stringify(message));
        }
    },
    sessionTimeout: 10000, // 10 second timeout
});

// Create TCP server
const server = net.createServer((client) => {
    console.log("Client connected", client.remoteAddress);

    // Create a port for each client, give the port a unique identifier
    const portName = `client_${client.remoteAddress}:${client.remotePort}`;
    const port = manager.createPort(portName, {
        sender: (message) => {
            // Send message to specific client
            if (!client.destroyed) {
                client.write(JSON.stringify(message));
            }
        },
    });

    // Handle client messages
    client.on("data", (data) => {
        try {
            const message = JSON.parse(data.toString());
            message.client = client; // Attach client reference

            // If it's a session message, hand it to session manager
            if (manager.isSession(message)) {
                // Need to pass the 2nd parameter: port name
                const session = manager.getSession(message, portName);
                if (session) {
                    session.resolve(message);
                }
            } else {
                // Handle non-session messages
                console.log("Received normal message:", message);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Clean up resources when client disconnects
    client.on("end", () => {
        console.log("Client disconnected", client.remoteAddress);
        port.destory();
    });
});

// Start server
server.listen(3000, () => {
    console.log("Server started, listening on port 3000");
});
```

Client usage is the same as above, just send session messages.

## Error Handling

`PSession` provides several error types to help handle different exception situations:

-   `SessionTimeoutError`: Session timeout error
-   `SessionCancelError`: Session canceled error
-   `SessionInvalidError`: Invalid session error
-   `SessionAbortError`: Session aborted error

```typescript
import {
    SessionTimeoutError,
    SessionCancelError,
    SessionInvalidError,
    SessionAbortError,
} from "psession";

try {
    const response = await session.send({ command: "query" });
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Session timeout");
    } else if (error instanceof SessionCancelError) {
        console.error("Session canceled");
    } else if (error instanceof SessionInvalidError) {
        console.error("Invalid session");
    } else if (error instanceof SessionAbortError) {
        console.error("Session aborted");
    } else {
        console.error("Unknown error:", error);
    }
}
```

## Notes

1. Be sure to call the `session.end()` method to release resources after using the session
2. Set `sessionTimeout` and `sessionMaxLife` parameters reasonably to avoid resource waste
3. When handling received messages, ensure to call the `session.resolve(message)` method correctly

## License

`MIT`

[Open Source Recommendations](https://zhangfisher.github.io/repos/)
