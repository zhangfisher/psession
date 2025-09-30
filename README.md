# PSession

[中文](./README_CN.md)

`PSession` is a lightweight session management tool designed for applications that need to maintain multiple session states. It provides a simple yet powerful API to help developers easily handle session communication flows in `one-to-one` or `one-to-many` scenarios.

## Features

-   🚀 Lightweight design, easy to integrate
-   🔄 Support for multi-port session management
-   ⏱️ Built-in session timeout management
-   🔁 Support for retry mechanisms
-   🧩 Flexible session ID management
-   📦 TypeScript support, type safety

## Installation

```bash
npm install psession
yarn add psession
pnpm add psession
bun add psession
```

## Guide

### Session Principles

The core of `PSession` is a session management mechanism based on session IDs (`sid`), which tracks and manages multiple concurrent sessions by embedding unique session identifiers in messages.

1. **SID Generation and Assignment**:

    - Each new session is automatically assigned a unique numeric `ID`
    - `SID` starts from `1` and increments until it reaches the configured maximum session count (default `65535`)
    - When `SID` is exhausted, the system recycles the earliest session ID according to the configured strategy

2. **Message Marking Mechanism**:

    - When sending a message, the system automatically adds a session `SID` field to the message object (default field name is `sid`)
    - The receiver identifies and routes messages to the corresponding session handler by checking the `SID` field in the message
    - This mechanism allows messages from multiple sessions to be transmitted in the same channel without confusion

3. **Session Lifecycle Management**:
    - Session creation: Create a new session via the `createSession()` method
    - Session activity: Update the session's last activity time each time a message is sent
    - Session termination: Actively end the session via the `session.end()` method, or wait for the system to automatically clean up timed-out sessions

`SID` Configuration:

```typescript
// Customize session ID field name
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionIdName: "sessionId", // Change default 'sid' to 'sessionId'
    maxSessionCount: 1000, // Set maximum session count to 1000 (default 65535)
    // Custom session overflow handling strategy
    onSessionOverflow: (port) => {
        // Return the session ID to be recycled
        // Default returns 1, i.e., recycle the earliest created session
        return 1;
    },
});
```

### Creating a Session Manager

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
    sessionMaxLife: 600000, // Maximum session lifecycle, default 600000ms (10 minutes)
    sessionIdName: "sid", // Session ID field name, default 'sid'
    maxSessionCount: 255, // Maximum session count, default 65535
});
```

### Creating and Using Sessions

```typescript
// Create a session
const session = manager.createSession("default");

// Send message and wait for reply
try {
    const response = await session.send({ command: "turnOnLight" });
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

### Handling Session Messages

**Important**: When receiving messages from remote endpoints, you need to use `manager.isSession(message)` to determine if it's a session message. If it is, get the corresponding session via `manager.getSession(message, message.from)` and then call `session.next(message)` to pass the message to the session handler.

```typescript
// In message receiving handler function
function onMessage(message) {
    // Check if it's a session message
    if (manager.isSession(message)) {
        // Get the corresponding session
        const session = manager.getSession(message, message.from);
        if (session) {
            // Pass the message to session handler
            session.next(message);
        }
    } else {
        // Handle non-session messages
        console.log("Received regular message:", message);
    }
}
```

### Retry Mechanism

`PSession` has a built-in retry mechanism that can be configured using the `retryCount` and `retryInterval` parameters of the `send` method.

```typescript
import { SessionTimeoutError } from "psession";

// Use built-in retry mechanism to send messages
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // Set retry parameters directly in the send method
        const response = await session.send(
            { command: "queryStatus" },
            {
                retryCount: 3, // Retry 3 times (4 times total)
                retryInterval: 500, // 500ms interval between retries
            }
        );
        console.log("Received reply:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("Still timed out after multiple retries");
        } else {
            console.error("Error occurred:", error);
        }
    } finally {
        session.end();
    }
}
```

### Timeout Mechanism

`PSession` provides two timeout mechanisms to manage session lifecycles:

1. **Session Timeout (sessionTimeout)**: Controls the maximum time to wait for a response after sending a message
2. **Session Maximum Lifetime (sessionMaxLife)**: Controls the maximum survival time of the entire session object

```typescript
// Configure timeout parameters when creating session manager
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionTimeout: 5000, // Session will timeout if no response is received after 5 seconds
    sessionMaxLife: 600000, // After 10 minutes, the session will be automatically cleaned up even if still in use
});

// Configure timeout parameter for a single send (higher priority than global configuration)
try {
    const response = await session.send(
        { command: "queryStatus" },
        { timeout: 3000 } // Set 3 seconds timeout for this request only
    );
    console.log("Received reply:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Request timeout");
    }
}
```

**How Timeout Mechanism Works**:

-   After sending a message, the system starts a timer. If no response is received within `sessionTimeout`, a `SessionTimeoutError` is thrown
-   The system periodically checks all sessions (default every `sessionTimeout/2` time)
-   If a session's last activity time exceeds `sessionMaxLife`, the session is automatically terminated and cleaned up
-   When using the retry mechanism, timeout detection is paused until all retries are completed

### Port

In `PSession`, `Port` is an important concept, especially suitable for one-to-many and many-to-many communication scenarios:

1. **Purpose of Ports**:

    - Ports are used to distinguish different communication endpoints (such as different devices, services, or clients)
    - Each port maintains its own collection of sessions, allowing session IDs from different ports to be managed independently
    - The port mechanism enables the system to establish sessions with multiple endpoints simultaneously without confusing session states

2. **One-to-Many Communication Scenarios**:

    - When an application needs to communicate with multiple devices simultaneously, it can create a port for each device
    - Each port can independently manage sessions with the corresponding device, using its own session ID space
    - Example: A control center connecting to multiple smart home devices, each device using an independent port

3. **Many-to-Many Communication Scenarios**:

    - In complex systems, multiple services need to communicate with multiple clients
    - The port mechanism allows the system to create independent session management spaces for each communication relationship
    - Example: In a microservice architecture, Service A needs to communicate simultaneously with Services B, C, and D

Example below:

### Socket Server Example

Here's a simple example of a Socket server using PSession, showing how to manage sessions for multiple clients:

```typescript
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
    sessionTimeout: 10000, // 10 seconds timeout
});

// Create TCP server
const server = net.createServer((client) => {
    console.log("Client connected", client.remoteAddress);

    // Create a port for each client
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

            // If it's a session message, pass it to the session manager
            if (manager.isSession(message)) {
                const session = manager.getSession(message, portName);
                if (session) {
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log("Received regular message:", message);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Clean up resources when client disconnects
    client.on("end", () => {
        console.log("Client disconnected", client.remoteAddress);
        port.destroy();
    });
});

// Start server
server.listen(3000, () => {
    console.log("Server started, listening on port 3000");
});

// Example: Handle client commands
manager.on("session:create", (session) => {
    console.log("New session created:", session.id);

    // Set session handler function
    session.on("next", async (message) => {
        console.log("Received session message:", message);

        // Simulate command processing
        if (message.command === "getTime") {
            await session.send({
                status: "success",
                time: new Date().toISOString(),
            });
        }
    });
});
```

This example demonstrates how to:

1. Create an independent port for each connected client
2. Use the session manager to handle client messages
3. Implement basic command processing logic
4. Manage session lifecycle and resource cleanup

## Error Handling

`PSession` provides several error types to help handle different exception situations:

-   `SessionTimeoutError`: Session timeout error
-   `SessionCancelError`: Session cancelled error
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
        console.error("Session cancelled");
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

1. Always call the `session.end()` method to release resources after using a session
2. Set appropriate `sessionTimeout` and `sessionMaxLife` parameters to avoid resource waste
3. When handling received messages, ensure correct calling of the `session.next(message)` method

## License

`MIT`

[Open Source Recommendations](https://zhangfisher.github.io/repos/)

## Quick Start - WebSocket Example

Below is an example of a server and client implementation using WebSocket, demonstrating how to use PSession for session management:

### WebSocket Server Side

````

## Guide

### Session Principles

The core of `PSession` is a session management mechanism based on session IDs (`sid`), which tracks and manages multiple concurrent sessions by embedding unique session identifiers in messages.

1. **SID Generation and Assignment**:

    - Each new session is automatically assigned a unique numeric `ID`
    - `SID` starts from `1` and increments until it reaches the configured maximum session count (default `65535`)
    - When `SID` is exhausted, the system recycles the earliest session ID according to the configured strategy

2. **Message Marking Mechanism**:

    - When sending a message, the system automatically adds a session `SID` field to the message object (default field name is `sid`)
    - The receiver identifies and routes messages to the corresponding session handler by checking the `SID` field in the message
    - This mechanism allows messages from multiple sessions to be transmitted in the same channel without confusion

3. **Session Lifecycle Management**:
    - Session creation: Create a new session via the `createSession()` method
    - Session activity: Update the session's last activity time each time a message is sent
    - Session termination: Actively end the session via the `session.end()` method, or wait for the system to automatically clean up timed-out sessions

**SID Configuration**

```typescript
// Customize session ID field name
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionIdName: "sessionId", // Change default 'sid' to 'sessionId'
    maxSessionCount: 1000, // Set maximum session count to 1000 (default 65535)
    // Custom session overflow handling strategy
    onSessionOverflow: (port) => {
        // Return the session ID to be recycled
        // Default returns 1, i.e., recycle the earliest created session
        return 1;
    },
});
```

### Creating a Session Manager

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
    sessionMaxLife: 600000, // Maximum session lifecycle, default 600000ms (10 minutes)
    sessionIdName: "sid", // Session ID field name, default 'sid'
    maxSessionCount: 255, // Maximum session count, default 65535
});
```

### Creating and Using Sessions

```typescript
// Create a session
const session = manager.createSession("default");

// Send message and wait for reply
try {
    const response = await session.send({ command: "turnOnLight" });
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

### Handling Session Messages

**Important**: When receiving messages from remote endpoints, you need to use `manager.isSession(message)` to determine if it's a session message. If it is, get the corresponding session via `manager.getSession(message, message.from)` and then call `session.next(message)` to pass the message to the session handler.

```typescript
// In message receiving handler function
function onMessage(message) {
    // Check if it's a session message
    if (manager.isSession(message)) {
        // Get the corresponding session
        const session = manager.getSession(message, message.from);
        if (session) {
            // Pass the message to session handler
            session.next(message);
        }
    } else {
        // Handle non-session messages
        console.log("Received regular message:", message);
    }
}
```

### Retry Mechanism

`PSession` has a built-in retry mechanism that can be configured using the `retryCount` and `retryInterval` parameters of the `send` method.

```typescript
import { SessionTimeoutError } from "psession";

// Use built-in retry mechanism to send messages
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // Set retry parameters directly in the send method
        const response = await session.send(
            { command: "queryStatus" },
            {
                retryCount: 3, // Retry 3 times (4 times total)
                retryInterval: 500, // 500ms interval between retries
            }
        );
        console.log("Received reply:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("Still timed out after multiple retries");
        } else {
            console.error("Error occurred:", error);
        }
    } finally {
        session.end();
    }
}
```

### Timeout Mechanism

`PSession` provides two timeout mechanisms to manage session lifecycles:

1. **Session Timeout (sessionTimeout)**: Controls the maximum time to wait for a response after sending a message
2. **Session Maximum Lifetime (sessionMaxLife)**: Controls the maximum survival time of the entire session object

```typescript
// Configure timeout parameters when creating session manager
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionTimeout: 5000, // Session will timeout if no response is received after 5 seconds
    sessionMaxLife: 600000, // After 10 minutes, the session will be automatically cleaned up even if still in use
});

// Configure timeout parameter for a single send (higher priority than global configuration)
try {
    const response = await session.send(
        { command: "queryStatus" },
        { timeout: 3000 } // Set 3 seconds timeout for this request only
    );
    console.log("Received reply:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Request timeout");
    }
}
```

**How Timeout Mechanism Works**:

-   After sending a message, the system starts a timer. If no response is received within `sessionTimeout`, a `SessionTimeoutError` is thrown
-   The system periodically checks all sessions (default every `sessionTimeout/2` time)
-   If a session's last activity time exceeds `sessionMaxLife`, the session is automatically terminated and cleaned up
-   When using the retry mechanism, timeout detection is paused until all retries are completed

### Port

In `PSession`, `Port` is an important concept, especially suitable for one-to-many and many-to-many communication scenarios:

1. **Purpose of Ports**:

    - Ports are used to distinguish different communication endpoints (such as different devices, services, or clients)
    - Each port maintains its own collection of sessions, allowing session IDs from different ports to be managed independently
    - The port mechanism enables the system to establish sessions with multiple endpoints simultaneously without confusing session states

2. **One-to-Many Communication Scenarios**:

    - When an application needs to communicate with multiple devices simultaneously, it can create a port for each device
    - Each port can independently manage sessions with the corresponding device, using its own session ID space
    - Example: A control center connecting to multiple smart home devices, each device using an independent port

3. **Many-to-Many Communication Scenarios**:

    - In complex systems, multiple services need to communicate with multiple clients
    - The port mechanism allows the system to create independent session management spaces for each communication relationship
    - Example: In a microservice architecture, Service A needs to communicate simultaneously with Services B, C, and D

Example below:

### Socket Server Example

Here's a simple example of a Socket server using PSession, showing how to manage sessions for multiple clients:

```typescript
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
    sessionTimeout: 10000, // 10 seconds timeout
});

// Create TCP server
const server = net.createServer((client) => {
    console.log("Client connected", client.remoteAddress);

    // Create a port for each client
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

            // If it's a session message, pass it to the session manager
            if (manager.isSession(message)) {
                const session = manager.getSession(message, portName);
                if (session) {
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log("Received regular message:", message);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Clean up resources when client disconnects
    client.on("end", () => {
        console.log("Client disconnected", client.remoteAddress);
        port.destroy();
    });
});

// Start server
server.listen(3000, () => {
    console.log("Server started, listening on port 3000");
});

// Example: Handle client commands
manager.on("session:create", (session) => {
    console.log("New session created:", session.id);

    // Set session handler function
    session.on("next", async (message) => {
        console.log("Received session message:", message);

        // Simulate command processing
        if (message.command === "getTime") {
            await session.send({
                status: "success",
                time: new Date().toISOString(),
            });
        }
    });
});
```

This example demonstrates how to:

1. Create an independent port for each connected client
2. Use the session manager to handle client messages
3. Implement basic command processing logic
4. Manage session lifecycle and resource cleanup

## Error Handling

`PSession` provides several error types to help handle different exception situations:

-   `SessionTimeoutError`: Session timeout error
-   `SessionCancelError`: Session cancelled error
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
        console.error("Session cancelled");
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

1. Always call the `session.end()` method to release resources after using a session
2. Set appropriate `sessionTimeout` and `sessionMaxLife` parameters to avoid resource waste
3. When handling received messages, ensure correct calling of the `session.next(message)` method

## License

`MIT`

[Open Source Recommendations](https://zhangfisher.github.io/repos/)typescript
import { SessionManager } from "psession";
import { WebSocketServer } from "ws";

// Create WebSocket server
const wss = new WebSocketServer({ port: 8080 });
console.log("WebSocket server started, listening on port 8080");

// Create session manager
const manager = new SessionManager({
sender: (message) => {
// This function won't be used directly as we'll create independent ports for each client
console.log("Default sender should not be called");
},
sessionTimeout: 10000, // 10 seconds timeout
});

// Handle new WebSocket connections
wss.on("connection", (ws, req) => {
const clientId = req.socket.remoteAddress + ":" + req.socket.remotePort;
console.log(`Client connected: ${clientId}`);

    // Create an independent port for each client
    const port = manager.createPort(clientId, {
        sender: (message) => {
            // Send message to specific client
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify(message));
            }
        },
    });

    // Handle messages from client
    ws.on("message", (data) => {
        try {
            const message = JSON.parse(data.toString());

            // Check if it's a session message
            if (manager.isSession(message)) {
                const session = manager.getSession(message, clientId);
                if (session) {
                    // Pass the message to the corresponding session
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log(`Received regular message from ${clientId}:`, message);

                // Example: Handle client request, create new session
                if (message.type === "command") {
                    // Create new session to handle command
                    const session = manager.createSession(clientId);

                    // Send session message and wait for response
                    session
                        .send({
                            type: "response",
                            command: message.command,
                            status: "processing",
                        })
                        .then(() => {
                            // Simulate command processing
                            setTimeout(() => {
                                session.send({
                                    type: "response",
                                    command: message.command,
                                    status: "completed",
                                    result: `Command "${message.command}" has been executed`,
                                });

                                // End session
                                session.end();
                            }, 1000);
                        });
                }
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Handle connection close
    ws.on("close", () => {
        console.log(`Client disconnected: ${clientId}`);
        // Destroy all sessions for this client
        port.destroy();
    });

});

// Listen for session creation events
manager.on("session:create", (session) => {
console.log(`New session created: ${session.id} (port: ${session.port})`);
});

````

## Guide

### Session Principles

The core of `PSession` is a session management mechanism based on session IDs (`sid`), which tracks and manages multiple concurrent sessions by embedding unique session identifiers in messages.

1. **SID Generation and Assignment**:

    - Each new session is automatically assigned a unique numeric `ID`
    - `SID` starts from `1` and increments until it reaches the configured maximum session count (default `65535`)
    - When `SID` is exhausted, the system recycles the earliest session ID according to the configured strategy

2. **Message Marking Mechanism**:

    - When sending a message, the system automatically adds a session `SID` field to the message object (default field name is `sid`)
    - The receiver identifies and routes messages to the corresponding session handler by checking the `SID` field in the message
    - This mechanism allows messages from multiple sessions to be transmitted in the same channel without confusion

3. **Session Lifecycle Management**:
    - Session creation: Create a new session via the `createSession()` method
    - Session activity: Update the session's last activity time each time a message is sent
    - Session termination: Actively end the session via the `session.end()` method, or wait for the system to automatically clean up timed-out sessions

**SID Configuration**

```typescript
// Customize session ID field name
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionIdName: "sessionId", // Change default 'sid' to 'sessionId'
    maxSessionCount: 1000, // Set maximum session count to 1000 (default 65535)
    // Custom session overflow handling strategy
    onSessionOverflow: (port) => {
        // Return the session ID to be recycled
        // Default returns 1, i.e., recycle the earliest created session
        return 1;
    },
});
```

### Creating a Session Manager

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
    sessionMaxLife: 600000, // Maximum session lifecycle, default 600000ms (10 minutes)
    sessionIdName: "sid", // Session ID field name, default 'sid'
    maxSessionCount: 255, // Maximum session count, default 65535
});
```

### Creating and Using Sessions

```typescript
// Create a session
const session = manager.createSession("default");

// Send message and wait for reply
try {
    const response = await session.send({ command: "turnOnLight" });
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

### Handling Session Messages

**Important**: When receiving messages from remote endpoints, you need to use `manager.isSession(message)` to determine if it's a session message. If it is, get the corresponding session via `manager.getSession(message, message.from)` and then call `session.next(message)` to pass the message to the session handler.

```typescript
// In message receiving handler function
function onMessage(message) {
    // Check if it's a session message
    if (manager.isSession(message)) {
        // Get the corresponding session
        const session = manager.getSession(message, message.from);
        if (session) {
            // Pass the message to session handler
            session.next(message);
        }
    } else {
        // Handle non-session messages
        console.log("Received regular message:", message);
    }
}
```

### Retry Mechanism

`PSession` has a built-in retry mechanism that can be configured using the `retryCount` and `retryInterval` parameters of the `send` method.

```typescript
import { SessionTimeoutError } from "psession";

// Use built-in retry mechanism to send messages
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // Set retry parameters directly in the send method
        const response = await session.send(
            { command: "queryStatus" },
            {
                retryCount: 3, // Retry 3 times (4 times total)
                retryInterval: 500, // 500ms interval between retries
            }
        );
        console.log("Received reply:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("Still timed out after multiple retries");
        } else {
            console.error("Error occurred:", error);
        }
    } finally {
        session.end();
    }
}
```

### Timeout Mechanism

`PSession` provides two timeout mechanisms to manage session lifecycles:

1. **Session Timeout (sessionTimeout)**: Controls the maximum time to wait for a response after sending a message
2. **Session Maximum Lifetime (sessionMaxLife)**: Controls the maximum survival time of the entire session object

```typescript
// Configure timeout parameters when creating session manager
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionTimeout: 5000, // Session will timeout if no response is received after 5 seconds
    sessionMaxLife: 600000, // After 10 minutes, the session will be automatically cleaned up even if still in use
});

// Configure timeout parameter for a single send (higher priority than global configuration)
try {
    const response = await session.send(
        { command: "queryStatus" },
        { timeout: 3000 } // Set 3 seconds timeout for this request only
    );
    console.log("Received reply:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Request timeout");
    }
}
```

**How Timeout Mechanism Works**:

-   After sending a message, the system starts a timer. If no response is received within `sessionTimeout`, a `SessionTimeoutError` is thrown
-   The system periodically checks all sessions (default every `sessionTimeout/2` time)
-   If a session's last activity time exceeds `sessionMaxLife`, the session is automatically terminated and cleaned up
-   When using the retry mechanism, timeout detection is paused until all retries are completed

### Port

In `PSession`, `Port` is an important concept, especially suitable for one-to-many and many-to-many communication scenarios:

1. **Purpose of Ports**:

    - Ports are used to distinguish different communication endpoints (such as different devices, services, or clients)
    - Each port maintains its own collection of sessions, allowing session IDs from different ports to be managed independently
    - The port mechanism enables the system to establish sessions with multiple endpoints simultaneously without confusing session states

2. **One-to-Many Communication Scenarios**:

    - When an application needs to communicate with multiple devices simultaneously, it can create a port for each device
    - Each port can independently manage sessions with the corresponding device, using its own session ID space
    - Example: A control center connecting to multiple smart home devices, each device using an independent port

3. **Many-to-Many Communication Scenarios**:

    - In complex systems, multiple services need to communicate with multiple clients
    - The port mechanism allows the system to create independent session management spaces for each communication relationship
    - Example: In a microservice architecture, Service A needs to communicate simultaneously with Services B, C, and D

Example below:

### Socket Server Example

Here's a simple example of a Socket server using PSession, showing how to manage sessions for multiple clients:

```typescript
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
    sessionTimeout: 10000, // 10 seconds timeout
});

// Create TCP server
const server = net.createServer((client) => {
    console.log("Client connected", client.remoteAddress);

    // Create a port for each client
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

            // If it's a session message, pass it to the session manager
            if (manager.isSession(message)) {
                const session = manager.getSession(message, portName);
                if (session) {
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log("Received regular message:", message);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Clean up resources when client disconnects
    client.on("end", () => {
        console.log("Client disconnected", client.remoteAddress);
        port.destroy();
    });
});

// Start server
server.listen(3000, () => {
    console.log("Server started, listening on port 3000");
});

// Example: Handle client commands
manager.on("session:create", (session) => {
    console.log("New session created:", session.id);

    // Set session handler function
    session.on("next", async (message) => {
        console.log("Received session message:", message);

        // Simulate command processing
        if (message.command === "getTime") {
            await session.send({
                status: "success",
                time: new Date().toISOString(),
            });
        }
    });
});
```

This example demonstrates how to:

1. Create an independent port for each connected client
2. Use the session manager to handle client messages
3. Implement basic command processing logic
4. Manage session lifecycle and resource cleanup

## Error Handling

`PSession` provides several error types to help handle different exception situations:

-   `SessionTimeoutError`: Session timeout error
-   `SessionCancelError`: Session cancelled error
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
        console.error("Session cancelled");
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

1. Always call the `session.end()` method to release resources after using a session
2. Set appropriate `sessionTimeout` and `sessionMaxLife` parameters to avoid resource waste
3. When handling received messages, ensure correct calling of the `session.next(message)` method

## License

`MIT`

[Open Source Recommendations](https://zhangfisher.github.io/repos/)

### WebSocket Client Side

````

## Guide

### Session Principles

The core of `PSession` is a session management mechanism based on session IDs (`sid`), which tracks and manages multiple concurrent sessions by embedding unique session identifiers in messages.

1. **SID Generation and Assignment**:

    - Each new session is automatically assigned a unique numeric `ID`
    - `SID` starts from `1` and increments until it reaches the configured maximum session count (default `65535`)
    - When `SID` is exhausted, the system recycles the earliest session ID according to the configured strategy

2. **Message Marking Mechanism**:

    - When sending a message, the system automatically adds a session `SID` field to the message object (default field name is `sid`)
    - The receiver identifies and routes messages to the corresponding session handler by checking the `SID` field in the message
    - This mechanism allows messages from multiple sessions to be transmitted in the same channel without confusion

3. **Session Lifecycle Management**:
    - Session creation: Create a new session via the `createSession()` method
    - Session activity: Update the session's last activity time each time a message is sent
    - Session termination: Actively end the session via the `session.end()` method, or wait for the system to automatically clean up timed-out sessions

**SID Configuration**

```typescript
// Customize session ID field name
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionIdName: "sessionId", // Change default 'sid' to 'sessionId'
    maxSessionCount: 1000, // Set maximum session count to 1000 (default 65535)
    // Custom session overflow handling strategy
    onSessionOverflow: (port) => {
        // Return the session ID to be recycled
        // Default returns 1, i.e., recycle the earliest created session
        return 1;
    },
});
````

### Creating a Session Manager

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
    sessionMaxLife: 600000, // Maximum session lifecycle, default 600000ms (10 minutes)
    sessionIdName: "sid", // Session ID field name, default 'sid'
    maxSessionCount: 255, // Maximum session count, default 65535
});
```

### Creating and Using Sessions

```typescript
// Create a session
const session = manager.createSession("default");

// Send message and wait for reply
try {
    const response = await session.send({ command: "turnOnLight" });
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

### Handling Session Messages

**Important**: When receiving messages from remote endpoints, you need to use `manager.isSession(message)` to determine if it's a session message. If it is, get the corresponding session via `manager.getSession(message, message.from)` and then call `session.next(message)` to pass the message to the session handler.

```typescript
// In message receiving handler function
function onMessage(message) {
    // Check if it's a session message
    if (manager.isSession(message)) {
        // Get the corresponding session
        const session = manager.getSession(message, message.from);
        if (session) {
            // Pass the message to session handler
            session.next(message);
        }
    } else {
        // Handle non-session messages
        console.log("Received regular message:", message);
    }
}
```

### Retry Mechanism

`PSession` has a built-in retry mechanism that can be configured using the `retryCount` and `retryInterval` parameters of the `send` method.

```typescript
import { SessionTimeoutError } from "psession";

// Use built-in retry mechanism to send messages
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // Set retry parameters directly in the send method
        const response = await session.send(
            { command: "queryStatus" },
            {
                retryCount: 3, // Retry 3 times (4 times total)
                retryInterval: 500, // 500ms interval between retries
            }
        );
        console.log("Received reply:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("Still timed out after multiple retries");
        } else {
            console.error("Error occurred:", error);
        }
    } finally {
        session.end();
    }
}
```

### Timeout Mechanism

`PSession` provides two timeout mechanisms to manage session lifecycles:

1. **Session Timeout (sessionTimeout)**: Controls the maximum time to wait for a response after sending a message
2. **Session Maximum Lifetime (sessionMaxLife)**: Controls the maximum survival time of the entire session object

```typescript
// Configure timeout parameters when creating session manager
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionTimeout: 5000, // Session will timeout if no response is received after 5 seconds
    sessionMaxLife: 600000, // After 10 minutes, the session will be automatically cleaned up even if still in use
});

// Configure timeout parameter for a single send (higher priority than global configuration)
try {
    const response = await session.send(
        { command: "queryStatus" },
        { timeout: 3000 } // Set 3 seconds timeout for this request only
    );
    console.log("Received reply:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Request timeout");
    }
}
```

**How Timeout Mechanism Works**:

-   After sending a message, the system starts a timer. If no response is received within `sessionTimeout`, a `SessionTimeoutError` is thrown
-   The system periodically checks all sessions (default every `sessionTimeout/2` time)
-   If a session's last activity time exceeds `sessionMaxLife`, the session is automatically terminated and cleaned up
-   When using the retry mechanism, timeout detection is paused until all retries are completed

### Port

In `PSession`, `Port` is an important concept, especially suitable for one-to-many and many-to-many communication scenarios:

1. **Purpose of Ports**:

    - Ports are used to distinguish different communication endpoints (such as different devices, services, or clients)
    - Each port maintains its own collection of sessions, allowing session IDs from different ports to be managed independently
    - The port mechanism enables the system to establish sessions with multiple endpoints simultaneously without confusing session states

2. **One-to-Many Communication Scenarios**:

    - When an application needs to communicate with multiple devices simultaneously, it can create a port for each device
    - Each port can independently manage sessions with the corresponding device, using its own session ID space
    - Example: A control center connecting to multiple smart home devices, each device using an independent port

3. **Many-to-Many Communication Scenarios**:

    - In complex systems, multiple services need to communicate with multiple clients
    - The port mechanism allows the system to create independent session management spaces for each communication relationship
    - Example: In a microservice architecture, Service A needs to communicate simultaneously with Services B, C, and D

Example below:

### Socket Server Example

Here's a simple example of a Socket server using PSession, showing how to manage sessions for multiple clients:

```typescript
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
    sessionTimeout: 10000, // 10 seconds timeout
});

// Create TCP server
const server = net.createServer((client) => {
    console.log("Client connected", client.remoteAddress);

    // Create a port for each client
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

            // If it's a session message, pass it to the session manager
            if (manager.isSession(message)) {
                const session = manager.getSession(message, portName);
                if (session) {
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log("Received regular message:", message);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Clean up resources when client disconnects
    client.on("end", () => {
        console.log("Client disconnected", client.remoteAddress);
        port.destroy();
    });
});

// Start server
server.listen(3000, () => {
    console.log("Server started, listening on port 3000");
});

// Example: Handle client commands
manager.on("session:create", (session) => {
    console.log("New session created:", session.id);

    // Set session handler function
    session.on("next", async (message) => {
        console.log("Received session message:", message);

        // Simulate command processing
        if (message.command === "getTime") {
            await session.send({
                status: "success",
                time: new Date().toISOString(),
            });
        }
    });
});
```

This example demonstrates how to:

1. Create an independent port for each connected client
2. Use the session manager to handle client messages
3. Implement basic command processing logic
4. Manage session lifecycle and resource cleanup

## Error Handling

`PSession` provides several error types to help handle different exception situations:

-   `SessionTimeoutError`: Session timeout error
-   `SessionCancelError`: Session cancelled error
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
        console.error("Session cancelled");
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

1. Always call the `session.end()` method to release resources after using a session
2. Set appropriate `sessionTimeout` and `sessionMaxLife` parameters to avoid resource waste
3. When handling received messages, ensure correct calling of the `session.next(message)` method

## License

`MIT`

[Open Source Recommendations](https://zhangfisher.github.io/repos/)typescript
import { SessionManager } from "psession";
import WebSocket from "ws";

// Create WebSocket client
const ws = new WebSocket("ws://localhost:8080");

// Create session manager
const manager = new SessionManager({
sender: (message) => {
// Send message to server
if (ws.readyState === ws.OPEN) {
ws.send(JSON.stringify(message));
} else {
console.error("WebSocket not connected, cannot send message");
}
},
sessionTimeout: 5000, // 5 seconds timeout
});

// Handle successful connection
ws.on("open", () => {
console.log("Connected to server");

    // Send regular command message
    ws.send(
        JSON.stringify({
            type: "command",
            command: "getStatus",
        })
    );

    // Create session and send message
    const session = manager.createSession("default");

    // Use session to send message and wait for response
    session
        .send({
            type: "query",
            query: "getDeviceList",
        })
        .then((response) => {
            console.log("Received session response:", response);

            // Continue sending messages in the same session
            return session.send({
                type: "query",
                query: "getDeviceDetails",
                deviceId: response.devices[0].id,
            });
        })
        .then((details) => {
            console.log("Received device details:", details);

            // End session
            session.end();
        })
        .catch((error) => {
            console.error("Session error:", error);
            session.end();
        });

});

// Handle server messages
ws.on("message", (data) => {
try {
const message = JSON.parse(data.toString());

        // Check if it's a session message
        if (manager.isSession(message)) {
            const session = manager.getSession(message);
            if (session) {
                // Pass the message to the corresponding session
                session.next(message);
            }
        } else {
            // Handle non-session messages
            console.log("Received regular server message:", message);
        }
    } catch (error) {
        console.error("Message parsing error:", error);
    }

});

// Handle connection close
ws.on("close", () => {
console.log("Connection to server closed");
});

// Handle errors
ws.on("error", (error) => {
console.error("WebSocket error:", error);
});

````

## Guide

### Session Principles

The core of `PSession` is a session management mechanism based on session IDs (`sid`), which tracks and manages multiple concurrent sessions by embedding unique session identifiers in messages.

1. **SID Generation and Assignment**:

    - Each new session is automatically assigned a unique numeric `ID`
    - `SID` starts from `1` and increments until it reaches the configured maximum session count (default `65535`)
    - When `SID` is exhausted, the system recycles the earliest session ID according to the configured strategy

2. **Message Marking Mechanism**:

    - When sending a message, the system automatically adds a session `SID` field to the message object (default field name is `sid`)
    - The receiver identifies and routes messages to the corresponding session handler by checking the `SID` field in the message
    - This mechanism allows messages from multiple sessions to be transmitted in the same channel without confusion

3. **Session Lifecycle Management**:
    - Session creation: Create a new session via the `createSession()` method
    - Session activity: Update the session's last activity time each time a message is sent
    - Session termination: Actively end the session via the `session.end()` method, or wait for the system to automatically clean up timed-out sessions

**SID Configuration**

```typescript
// Customize session ID field name
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionIdName: "sessionId", // Change default 'sid' to 'sessionId'
    maxSessionCount: 1000, // Set maximum session count to 1000 (default 65535)
    // Custom session overflow handling strategy
    onSessionOverflow: (port) => {
        // Return the session ID to be recycled
        // Default returns 1, i.e., recycle the earliest created session
        return 1;
    },
});
````

### Creating a Session Manager

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
    sessionMaxLife: 600000, // Maximum session lifecycle, default 600000ms (10 minutes)
    sessionIdName: "sid", // Session ID field name, default 'sid'
    maxSessionCount: 255, // Maximum session count, default 65535
});
```

### Creating and Using Sessions

```typescript
// Create a session
const session = manager.createSession("default");

// Send message and wait for reply
try {
    const response = await session.send({ command: "turnOnLight" });
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

### Handling Session Messages

**Important**: When receiving messages from remote endpoints, you need to use `manager.isSession(message)` to determine if it's a session message. If it is, get the corresponding session via `manager.getSession(message, message.from)` and then call `session.next(message)` to pass the message to the session handler.

```typescript
// In message receiving handler function
function onMessage(message) {
    // Check if it's a session message
    if (manager.isSession(message)) {
        // Get the corresponding session
        const session = manager.getSession(message, message.from);
        if (session) {
            // Pass the message to session handler
            session.next(message);
        }
    } else {
        // Handle non-session messages
        console.log("Received regular message:", message);
    }
}
```

### Retry Mechanism

`PSession` has a built-in retry mechanism that can be configured using the `retryCount` and `retryInterval` parameters of the `send` method.

```typescript
import { SessionTimeoutError } from "psession";

// Use built-in retry mechanism to send messages
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // Set retry parameters directly in the send method
        const response = await session.send(
            { command: "queryStatus" },
            {
                retryCount: 3, // Retry 3 times (4 times total)
                retryInterval: 500, // 500ms interval between retries
            }
        );
        console.log("Received reply:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("Still timed out after multiple retries");
        } else {
            console.error("Error occurred:", error);
        }
    } finally {
        session.end();
    }
}
```

### Timeout Mechanism

`PSession` provides two timeout mechanisms to manage session lifecycles:

1. **Session Timeout (sessionTimeout)**: Controls the maximum time to wait for a response after sending a message
2. **Session Maximum Lifetime (sessionMaxLife)**: Controls the maximum survival time of the entire session object

```typescript
// Configure timeout parameters when creating session manager
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionTimeout: 5000, // Session will timeout if no response is received after 5 seconds
    sessionMaxLife: 600000, // After 10 minutes, the session will be automatically cleaned up even if still in use
});

// Configure timeout parameter for a single send (higher priority than global configuration)
try {
    const response = await session.send(
        { command: "queryStatus" },
        { timeout: 3000 } // Set 3 seconds timeout for this request only
    );
    console.log("Received reply:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Request timeout");
    }
}
```

**How Timeout Mechanism Works**:

-   After sending a message, the system starts a timer. If no response is received within `sessionTimeout`, a `SessionTimeoutError` is thrown
-   The system periodically checks all sessions (default every `sessionTimeout/2` time)
-   If a session's last activity time exceeds `sessionMaxLife`, the session is automatically terminated and cleaned up
-   When using the retry mechanism, timeout detection is paused until all retries are completed

### Port

In `PSession`, `Port` is an important concept, especially suitable for one-to-many and many-to-many communication scenarios:

1. **Purpose of Ports**:

    - Ports are used to distinguish different communication endpoints (such as different devices, services, or clients)
    - Each port maintains its own collection of sessions, allowing session IDs from different ports to be managed independently
    - The port mechanism enables the system to establish sessions with multiple endpoints simultaneously without confusing session states

2. **One-to-Many Communication Scenarios**:

    - When an application needs to communicate with multiple devices simultaneously, it can create a port for each device
    - Each port can independently manage sessions with the corresponding device, using its own session ID space
    - Example: A control center connecting to multiple smart home devices, each device using an independent port

3. **Many-to-Many Communication Scenarios**:

    - In complex systems, multiple services need to communicate with multiple clients
    - The port mechanism allows the system to create independent session management spaces for each communication relationship
    - Example: In a microservice architecture, Service A needs to communicate simultaneously with Services B, C, and D

Example below:

### Socket Server Example

Here's a simple example of a Socket server using PSession, showing how to manage sessions for multiple clients:

```typescript
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
    sessionTimeout: 10000, // 10 seconds timeout
});

// Create TCP server
const server = net.createServer((client) => {
    console.log("Client connected", client.remoteAddress);

    // Create a port for each client
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

            // If it's a session message, pass it to the session manager
            if (manager.isSession(message)) {
                const session = manager.getSession(message, portName);
                if (session) {
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log("Received regular message:", message);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Clean up resources when client disconnects
    client.on("end", () => {
        console.log("Client disconnected", client.remoteAddress);
        port.destroy();
    });
});

// Start server
server.listen(3000, () => {
    console.log("Server started, listening on port 3000");
});

// Example: Handle client commands
manager.on("session:create", (session) => {
    console.log("New session created:", session.id);

    // Set session handler function
    session.on("next", async (message) => {
        console.log("Received session message:", message);

        // Simulate command processing
        if (message.command === "getTime") {
            await session.send({
                status: "success",
                time: new Date().toISOString(),
            });
        }
    });
});
```

This example demonstrates how to:

1. Create an independent port for each connected client
2. Use the session manager to handle client messages
3. Implement basic command processing logic
4. Manage session lifecycle and resource cleanup

## Error Handling

`PSession` provides several error types to help handle different exception situations:

-   `SessionTimeoutError`: Session timeout error
-   `SessionCancelError`: Session cancelled error
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
        console.error("Session cancelled");
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

1. Always call the `session.end()` method to release resources after using a session
2. Set appropriate `sessionTimeout` and `sessionMaxLife` parameters to avoid resource waste
3. When handling received messages, ensure correct calling of the `session.next(message)` method

## License

`MIT`

[Open Source Recommendations](https://zhangfisher.github.io/repos/)bash
npm install psession
yarn add psession
pnpm add psession
bun add psession

````

## Guide

### Session Principles

The core of `PSession` is a session management mechanism based on session IDs (`sid`), which tracks and manages multiple concurrent sessions by embedding unique session identifiers in messages.

1. **SID Generation and Assignment**:

    - Each new session is automatically assigned a unique numeric `ID`
    - `SID` starts from `1` and increments until it reaches the configured maximum session count (default `65535`)
    - When `SID` is exhausted, the system recycles the earliest session ID according to the configured strategy

2. **Message Marking Mechanism**:

    - When sending a message, the system automatically adds a session `SID` field to the message object (default field name is `sid`)
    - The receiver identifies and routes messages to the corresponding session handler by checking the `SID` field in the message
    - This mechanism allows messages from multiple sessions to be transmitted in the same channel without confusion

3. **Session Lifecycle Management**:
    - Session creation: Create a new session via the `createSession()` method
    - Session activity: Update the session's last activity time each time a message is sent
    - Session termination: Actively end the session via the `session.end()` method, or wait for the system to automatically clean up timed-out sessions

**SID Configuration**

```typescript
// Customize session ID field name
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionIdName: "sessionId", // Change default 'sid' to 'sessionId'
    maxSessionCount: 1000, // Set maximum session count to 1000 (default 65535)
    // Custom session overflow handling strategy
    onSessionOverflow: (port) => {
        // Return the session ID to be recycled
        // Default returns 1, i.e., recycle the earliest created session
        return 1;
    },
});
````

### Creating a Session Manager

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
    sessionMaxLife: 600000, // Maximum session lifecycle, default 600000ms (10 minutes)
    sessionIdName: "sid", // Session ID field name, default 'sid'
    maxSessionCount: 255, // Maximum session count, default 65535
});
```

### Creating and Using Sessions

```typescript
// Create a session
const session = manager.createSession("default");

// Send message and wait for reply
try {
    const response = await session.send({ command: "turnOnLight" });
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

### Handling Session Messages

**Important**: When receiving messages from remote endpoints, you need to use `manager.isSession(message)` to determine if it's a session message. If it is, get the corresponding session via `manager.getSession(message, message.from)` and then call `session.next(message)` to pass the message to the session handler.

```typescript
// In message receiving handler function
function onMessage(message) {
    // Check if it's a session message
    if (manager.isSession(message)) {
        // Get the corresponding session
        const session = manager.getSession(message, message.from);
        if (session) {
            // Pass the message to session handler
            session.next(message);
        }
    } else {
        // Handle non-session messages
        console.log("Received regular message:", message);
    }
}
```

### Retry Mechanism

`PSession` has a built-in retry mechanism that can be configured using the `retryCount` and `retryInterval` parameters of the `send` method.

```typescript
import { SessionTimeoutError } from "psession";

// Use built-in retry mechanism to send messages
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // Set retry parameters directly in the send method
        const response = await session.send(
            { command: "queryStatus" },
            {
                retryCount: 3, // Retry 3 times (4 times total)
                retryInterval: 500, // 500ms interval between retries
            }
        );
        console.log("Received reply:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("Still timed out after multiple retries");
        } else {
            console.error("Error occurred:", error);
        }
    } finally {
        session.end();
    }
}
```

### Timeout Mechanism

`PSession` provides two timeout mechanisms to manage session lifecycles:

1. **Session Timeout (sessionTimeout)**: Controls the maximum time to wait for a response after sending a message
2. **Session Maximum Lifetime (sessionMaxLife)**: Controls the maximum survival time of the entire session object

```typescript
// Configure timeout parameters when creating session manager
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionTimeout: 5000, // Session will timeout if no response is received after 5 seconds
    sessionMaxLife: 600000, // After 10 minutes, the session will be automatically cleaned up even if still in use
});

// Configure timeout parameter for a single send (higher priority than global configuration)
try {
    const response = await session.send(
        { command: "queryStatus" },
        { timeout: 3000 } // Set 3 seconds timeout for this request only
    );
    console.log("Received reply:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Request timeout");
    }
}
```

**How Timeout Mechanism Works**:

-   After sending a message, the system starts a timer. If no response is received within `sessionTimeout`, a `SessionTimeoutError` is thrown
-   The system periodically checks all sessions (default every `sessionTimeout/2` time)
-   If a session's last activity time exceeds `sessionMaxLife`, the session is automatically terminated and cleaned up
-   When using the retry mechanism, timeout detection is paused until all retries are completed

### Port

In `PSession`, `Port` is an important concept, especially suitable for one-to-many and many-to-many communication scenarios:

1. **Purpose of Ports**:

    - Ports are used to distinguish different communication endpoints (such as different devices, services, or clients)
    - Each port maintains its own collection of sessions, allowing session IDs from different ports to be managed independently
    - The port mechanism enables the system to establish sessions with multiple endpoints simultaneously without confusing session states

2. **One-to-Many Communication Scenarios**:

    - When an application needs to communicate with multiple devices simultaneously, it can create a port for each device
    - Each port can independently manage sessions with the corresponding device, using its own session ID space
    - Example: A control center connecting to multiple smart home devices, each device using an independent port

3. **Many-to-Many Communication Scenarios**:

    - In complex systems, multiple services need to communicate with multiple clients
    - The port mechanism allows the system to create independent session management spaces for each communication relationship
    - Example: In a microservice architecture, Service A needs to communicate simultaneously with Services B, C, and D

Example below:

### Socket Server Example

Here's a simple example of a Socket server using PSession, showing how to manage sessions for multiple clients:

```typescript
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
    sessionTimeout: 10000, // 10 seconds timeout
});

// Create TCP server
const server = net.createServer((client) => {
    console.log("Client connected", client.remoteAddress);

    // Create a port for each client
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

            // If it's a session message, pass it to the session manager
            if (manager.isSession(message)) {
                const session = manager.getSession(message, portName);
                if (session) {
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log("Received regular message:", message);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Clean up resources when client disconnects
    client.on("end", () => {
        console.log("Client disconnected", client.remoteAddress);
        port.destroy();
    });
});

// Start server
server.listen(3000, () => {
    console.log("Server started, listening on port 3000");
});

// Example: Handle client commands
manager.on("session:create", (session) => {
    console.log("New session created:", session.id);

    // Set session handler function
    session.on("next", async (message) => {
        console.log("Received session message:", message);

        // Simulate command processing
        if (message.command === "getTime") {
            await session.send({
                status: "success",
                time: new Date().toISOString(),
            });
        }
    });
});
```

This example demonstrates how to:

1. Create an independent port for each connected client
2. Use the session manager to handle client messages
3. Implement basic command processing logic
4. Manage session lifecycle and resource cleanup

## Error Handling

`PSession` provides several error types to help handle different exception situations:

-   `SessionTimeoutError`: Session timeout error
-   `SessionCancelError`: Session cancelled error
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
        console.error("Session cancelled");
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

1. Always call the `session.end()` method to release resources after using a session
2. Set appropriate `sessionTimeout` and `sessionMaxLife` parameters to avoid resource waste
3. When handling received messages, ensure correct calling of the `session.next(message)` method

## License

`MIT`

[Open Source Recommendations](https://zhangfisher.github.io/repos/)

## Quick Start - WebSocket Example

Below is an example of a server and client implementation using WebSocket, demonstrating how to use PSession for session management:

### WebSocket Server Side

````

## Guide

### Session Principles

The core of `PSession` is a session management mechanism based on session IDs (`sid`), which tracks and manages multiple concurrent sessions by embedding unique session identifiers in messages.

1. **SID Generation and Assignment**:

    - Each new session is automatically assigned a unique numeric `ID`
    - `SID` starts from `1` and increments until it reaches the configured maximum session count (default `65535`)
    - When `SID` is exhausted, the system recycles the earliest session ID according to the configured strategy

2. **Message Marking Mechanism**:

    - When sending a message, the system automatically adds a session `SID` field to the message object (default field name is `sid`)
    - The receiver identifies and routes messages to the corresponding session handler by checking the `SID` field in the message
    - This mechanism allows messages from multiple sessions to be transmitted in the same channel without confusion

3. **Session Lifecycle Management**:
    - Session creation: Create a new session via the `createSession()` method
    - Session activity: Update the session's last activity time each time a message is sent
    - Session termination: Actively end the session via the `session.end()` method, or wait for the system to automatically clean up timed-out sessions

**SID Configuration**

```typescript
// Customize session ID field name
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionIdName: "sessionId", // Change default 'sid' to 'sessionId'
    maxSessionCount: 1000, // Set maximum session count to 1000 (default 65535)
    // Custom session overflow handling strategy
    onSessionOverflow: (port) => {
        // Return the session ID to be recycled
        // Default returns 1, i.e., recycle the earliest created session
        return 1;
    },
});
````

### Creating a Session Manager

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
    sessionMaxLife: 600000, // Maximum session lifecycle, default 600000ms (10 minutes)
    sessionIdName: "sid", // Session ID field name, default 'sid'
    maxSessionCount: 255, // Maximum session count, default 65535
});
```

### Creating and Using Sessions

```typescript
// Create a session
const session = manager.createSession("default");

// Send message and wait for reply
try {
    const response = await session.send({ command: "turnOnLight" });
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

### Handling Session Messages

**Important**: When receiving messages from remote endpoints, you need to use `manager.isSession(message)` to determine if it's a session message. If it is, get the corresponding session via `manager.getSession(message, message.from)` and then call `session.next(message)` to pass the message to the session handler.

```typescript
// In message receiving handler function
function onMessage(message) {
    // Check if it's a session message
    if (manager.isSession(message)) {
        // Get the corresponding session
        const session = manager.getSession(message, message.from);
        if (session) {
            // Pass the message to session handler
            session.next(message);
        }
    } else {
        // Handle non-session messages
        console.log("Received regular message:", message);
    }
}
```

### Retry Mechanism

`PSession` has a built-in retry mechanism that can be configured using the `retryCount` and `retryInterval` parameters of the `send` method.

```typescript
import { SessionTimeoutError } from "psession";

// Use built-in retry mechanism to send messages
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // Set retry parameters directly in the send method
        const response = await session.send(
            { command: "queryStatus" },
            {
                retryCount: 3, // Retry 3 times (4 times total)
                retryInterval: 500, // 500ms interval between retries
            }
        );
        console.log("Received reply:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("Still timed out after multiple retries");
        } else {
            console.error("Error occurred:", error);
        }
    } finally {
        session.end();
    }
}
```

### Timeout Mechanism

`PSession` provides two timeout mechanisms to manage session lifecycles:

1. **Session Timeout (sessionTimeout)**: Controls the maximum time to wait for a response after sending a message
2. **Session Maximum Lifetime (sessionMaxLife)**: Controls the maximum survival time of the entire session object

```typescript
// Configure timeout parameters when creating session manager
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionTimeout: 5000, // Session will timeout if no response is received after 5 seconds
    sessionMaxLife: 600000, // After 10 minutes, the session will be automatically cleaned up even if still in use
});

// Configure timeout parameter for a single send (higher priority than global configuration)
try {
    const response = await session.send(
        { command: "queryStatus" },
        { timeout: 3000 } // Set 3 seconds timeout for this request only
    );
    console.log("Received reply:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Request timeout");
    }
}
```

**How Timeout Mechanism Works**:

-   After sending a message, the system starts a timer. If no response is received within `sessionTimeout`, a `SessionTimeoutError` is thrown
-   The system periodically checks all sessions (default every `sessionTimeout/2` time)
-   If a session's last activity time exceeds `sessionMaxLife`, the session is automatically terminated and cleaned up
-   When using the retry mechanism, timeout detection is paused until all retries are completed

### Port

In `PSession`, `Port` is an important concept, especially suitable for one-to-many and many-to-many communication scenarios:

1. **Purpose of Ports**:

    - Ports are used to distinguish different communication endpoints (such as different devices, services, or clients)
    - Each port maintains its own collection of sessions, allowing session IDs from different ports to be managed independently
    - The port mechanism enables the system to establish sessions with multiple endpoints simultaneously without confusing session states

2. **One-to-Many Communication Scenarios**:

    - When an application needs to communicate with multiple devices simultaneously, it can create a port for each device
    - Each port can independently manage sessions with the corresponding device, using its own session ID space
    - Example: A control center connecting to multiple smart home devices, each device using an independent port

3. **Many-to-Many Communication Scenarios**:

    - In complex systems, multiple services need to communicate with multiple clients
    - The port mechanism allows the system to create independent session management spaces for each communication relationship
    - Example: In a microservice architecture, Service A needs to communicate simultaneously with Services B, C, and D

Example below:

### Socket Server Example

Here's a simple example of a Socket server using PSession, showing how to manage sessions for multiple clients:

```typescript
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
    sessionTimeout: 10000, // 10 seconds timeout
});

// Create TCP server
const server = net.createServer((client) => {
    console.log("Client connected", client.remoteAddress);

    // Create a port for each client
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

            // If it's a session message, pass it to the session manager
            if (manager.isSession(message)) {
                const session = manager.getSession(message, portName);
                if (session) {
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log("Received regular message:", message);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Clean up resources when client disconnects
    client.on("end", () => {
        console.log("Client disconnected", client.remoteAddress);
        port.destroy();
    });
});

// Start server
server.listen(3000, () => {
    console.log("Server started, listening on port 3000");
});

// Example: Handle client commands
manager.on("session:create", (session) => {
    console.log("New session created:", session.id);

    // Set session handler function
    session.on("next", async (message) => {
        console.log("Received session message:", message);

        // Simulate command processing
        if (message.command === "getTime") {
            await session.send({
                status: "success",
                time: new Date().toISOString(),
            });
        }
    });
});
```

This example demonstrates how to:

1. Create an independent port for each connected client
2. Use the session manager to handle client messages
3. Implement basic command processing logic
4. Manage session lifecycle and resource cleanup

## Error Handling

`PSession` provides several error types to help handle different exception situations:

-   `SessionTimeoutError`: Session timeout error
-   `SessionCancelError`: Session cancelled error
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
        console.error("Session cancelled");
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

1. Always call the `session.end()` method to release resources after using a session
2. Set appropriate `sessionTimeout` and `sessionMaxLife` parameters to avoid resource waste
3. When handling received messages, ensure correct calling of the `session.next(message)` method

## License

`MIT`

[Open Source Recommendations](https://zhangfisher.github.io/repos/)typescript
import { SessionManager } from "psession";
import { WebSocketServer } from "ws";

// Create WebSocket server
const wss = new WebSocketServer({ port: 8080 });
console.log("WebSocket server started, listening on port 8080");

// Create session manager
const manager = new SessionManager({
sender: (message) => {
// This function won't be used directly as we'll create independent ports for each client
console.log("Default sender should not be called");
},
sessionTimeout: 10000, // 10 seconds timeout
});

// Handle new WebSocket connections
wss.on("connection", (ws, req) => {
const clientId = req.socket.remoteAddress + ":" + req.socket.remotePort;
console.log(`Client connected: ${clientId}`);

    // Create an independent port for each client
    const port = manager.createPort(clientId, {
        sender: (message) => {
            // Send message to specific client
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify(message));
            }
        },
    });

    // Handle messages from client
    ws.on("message", (data) => {
        try {
            const message = JSON.parse(data.toString());

            // Check if it's a session message
            if (manager.isSession(message)) {
                const session = manager.getSession(message, clientId);
                if (session) {
                    // Pass the message to the corresponding session
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log(`Received regular message from ${clientId}:`, message);

                // Example: Handle client request, create new session
                if (message.type === "command") {
                    // Create new session to handle command
                    const session = manager.createSession(clientId);

                    // Send session message and wait for response
                    session
                        .send({
                            type: "response",
                            command: message.command,
                            status: "processing",
                        })
                        .then(() => {
                            // Simulate command processing
                            setTimeout(() => {
                                session.send({
                                    type: "response",
                                    command: message.command,
                                    status: "completed",
                                    result: `Command "${message.command}" has been executed`,
                                });

                                // End session
                                session.end();
                            }, 1000);
                        });
                }
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Handle connection close
    ws.on("close", () => {
        console.log(`Client disconnected: ${clientId}`);
        // Destroy all sessions for this client
        port.destroy();
    });

});

// Listen for session creation events
manager.on("session:create", (session) => {
console.log(`New session created: ${session.id} (port: ${session.port})`);
});

````

## Guide

### Session Principles

The core of `PSession` is a session management mechanism based on session IDs (`sid`), which tracks and manages multiple concurrent sessions by embedding unique session identifiers in messages.

1. **SID Generation and Assignment**:

    - Each new session is automatically assigned a unique numeric `ID`
    - `SID` starts from `1` and increments until it reaches the configured maximum session count (default `65535`)
    - When `SID` is exhausted, the system recycles the earliest session ID according to the configured strategy

2. **Message Marking Mechanism**:

    - When sending a message, the system automatically adds a session `SID` field to the message object (default field name is `sid`)
    - The receiver identifies and routes messages to the corresponding session handler by checking the `SID` field in the message
    - This mechanism allows messages from multiple sessions to be transmitted in the same channel without confusion

3. **Session Lifecycle Management**:
    - Session creation: Create a new session via the `createSession()` method
    - Session activity: Update the session's last activity time each time a message is sent
    - Session termination: Actively end the session via the `session.end()` method, or wait for the system to automatically clean up timed-out sessions

**SID Configuration**

```typescript
// Customize session ID field name
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionIdName: "sessionId", // Change default 'sid' to 'sessionId'
    maxSessionCount: 1000, // Set maximum session count to 1000 (default 65535)
    // Custom session overflow handling strategy
    onSessionOverflow: (port) => {
        // Return the session ID to be recycled
        // Default returns 1, i.e., recycle the earliest created session
        return 1;
    },
});
````

### Creating a Session Manager

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
    sessionMaxLife: 600000, // Maximum session lifecycle, default 600000ms (10 minutes)
    sessionIdName: "sid", // Session ID field name, default 'sid'
    maxSessionCount: 255, // Maximum session count, default 65535
});
```

### Creating and Using Sessions

```typescript
// Create a session
const session = manager.createSession("default");

// Send message and wait for reply
try {
    const response = await session.send({ command: "turnOnLight" });
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

### Handling Session Messages

**Important**: When receiving messages from remote endpoints, you need to use `manager.isSession(message)` to determine if it's a session message. If it is, get the corresponding session via `manager.getSession(message, message.from)` and then call `session.next(message)` to pass the message to the session handler.

```typescript
// In message receiving handler function
function onMessage(message) {
    // Check if it's a session message
    if (manager.isSession(message)) {
        // Get the corresponding session
        const session = manager.getSession(message, message.from);
        if (session) {
            // Pass the message to session handler
            session.next(message);
        }
    } else {
        // Handle non-session messages
        console.log("Received regular message:", message);
    }
}
```

### Retry Mechanism

`PSession` has a built-in retry mechanism that can be configured using the `retryCount` and `retryInterval` parameters of the `send` method.

```typescript
import { SessionTimeoutError } from "psession";

// Use built-in retry mechanism to send messages
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // Set retry parameters directly in the send method
        const response = await session.send(
            { command: "queryStatus" },
            {
                retryCount: 3, // Retry 3 times (4 times total)
                retryInterval: 500, // 500ms interval between retries
            }
        );
        console.log("Received reply:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("Still timed out after multiple retries");
        } else {
            console.error("Error occurred:", error);
        }
    } finally {
        session.end();
    }
}
```

### Timeout Mechanism

`PSession` provides two timeout mechanisms to manage session lifecycles:

1. **Session Timeout (sessionTimeout)**: Controls the maximum time to wait for a response after sending a message
2. **Session Maximum Lifetime (sessionMaxLife)**: Controls the maximum survival time of the entire session object

```typescript
// Configure timeout parameters when creating session manager
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionTimeout: 5000, // Session will timeout if no response is received after 5 seconds
    sessionMaxLife: 600000, // After 10 minutes, the session will be automatically cleaned up even if still in use
});

// Configure timeout parameter for a single send (higher priority than global configuration)
try {
    const response = await session.send(
        { command: "queryStatus" },
        { timeout: 3000 } // Set 3 seconds timeout for this request only
    );
    console.log("Received reply:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Request timeout");
    }
}
```

**How Timeout Mechanism Works**:

-   After sending a message, the system starts a timer. If no response is received within `sessionTimeout`, a `SessionTimeoutError` is thrown
-   The system periodically checks all sessions (default every `sessionTimeout/2` time)
-   If a session's last activity time exceeds `sessionMaxLife`, the session is automatically terminated and cleaned up
-   When using the retry mechanism, timeout detection is paused until all retries are completed

### Port

In `PSession`, `Port` is an important concept, especially suitable for one-to-many and many-to-many communication scenarios:

1. **Purpose of Ports**:

    - Ports are used to distinguish different communication endpoints (such as different devices, services, or clients)
    - Each port maintains its own collection of sessions, allowing session IDs from different ports to be managed independently
    - The port mechanism enables the system to establish sessions with multiple endpoints simultaneously without confusing session states

2. **One-to-Many Communication Scenarios**:

    - When an application needs to communicate with multiple devices simultaneously, it can create a port for each device
    - Each port can independently manage sessions with the corresponding device, using its own session ID space
    - Example: A control center connecting to multiple smart home devices, each device using an independent port

3. **Many-to-Many Communication Scenarios**:

    - In complex systems, multiple services need to communicate with multiple clients
    - The port mechanism allows the system to create independent session management spaces for each communication relationship
    - Example: In a microservice architecture, Service A needs to communicate simultaneously with Services B, C, and D

Example below:

### Socket Server Example

Here's a simple example of a Socket server using PSession, showing how to manage sessions for multiple clients:

```typescript
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
    sessionTimeout: 10000, // 10 seconds timeout
});

// Create TCP server
const server = net.createServer((client) => {
    console.log("Client connected", client.remoteAddress);

    // Create a port for each client
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

            // If it's a session message, pass it to the session manager
            if (manager.isSession(message)) {
                const session = manager.getSession(message, portName);
                if (session) {
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log("Received regular message:", message);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Clean up resources when client disconnects
    client.on("end", () => {
        console.log("Client disconnected", client.remoteAddress);
        port.destroy();
    });
});

// Start server
server.listen(3000, () => {
    console.log("Server started, listening on port 3000");
});

// Example: Handle client commands
manager.on("session:create", (session) => {
    console.log("New session created:", session.id);

    // Set session handler function
    session.on("next", async (message) => {
        console.log("Received session message:", message);

        // Simulate command processing
        if (message.command === "getTime") {
            await session.send({
                status: "success",
                time: new Date().toISOString(),
            });
        }
    });
});
```

This example demonstrates how to:

1. Create an independent port for each connected client
2. Use the session manager to handle client messages
3. Implement basic command processing logic
4. Manage session lifecycle and resource cleanup

## Error Handling

`PSession` provides several error types to help handle different exception situations:

-   `SessionTimeoutError`: Session timeout error
-   `SessionCancelError`: Session cancelled error
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
        console.error("Session cancelled");
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

1. Always call the `session.end()` method to release resources after using a session
2. Set appropriate `sessionTimeout` and `sessionMaxLife` parameters to avoid resource waste
3. When handling received messages, ensure correct calling of the `session.next(message)` method

## License

`MIT`

[Open Source Recommendations](https://zhangfisher.github.io/repos/)

### WebSocket Client Side

````

## Guide

### Session Principles

The core of `PSession` is a session management mechanism based on session IDs (`sid`), which tracks and manages multiple concurrent sessions by embedding unique session identifiers in messages.

1. **SID Generation and Assignment**:

    - Each new session is automatically assigned a unique numeric `ID`
    - `SID` starts from `1` and increments until it reaches the configured maximum session count (default `65535`)
    - When `SID` is exhausted, the system recycles the earliest session ID according to the configured strategy

2. **Message Marking Mechanism**:

    - When sending a message, the system automatically adds a session `SID` field to the message object (default field name is `sid`)
    - The receiver identifies and routes messages to the corresponding session handler by checking the `SID` field in the message
    - This mechanism allows messages from multiple sessions to be transmitted in the same channel without confusion

3. **Session Lifecycle Management**:
    - Session creation: Create a new session via the `createSession()` method
    - Session activity: Update the session's last activity time each time a message is sent
    - Session termination: Actively end the session via the `session.end()` method, or wait for the system to automatically clean up timed-out sessions

**SID Configuration**

```typescript
// Customize session ID field name
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionIdName: "sessionId", // Change default 'sid' to 'sessionId'
    maxSessionCount: 1000, // Set maximum session count to 1000 (default 65535)
    // Custom session overflow handling strategy
    onSessionOverflow: (port) => {
        // Return the session ID to be recycled
        // Default returns 1, i.e., recycle the earliest created session
        return 1;
    },
});
````

### Creating a Session Manager

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
    sessionMaxLife: 600000, // Maximum session lifecycle, default 600000ms (10 minutes)
    sessionIdName: "sid", // Session ID field name, default 'sid'
    maxSessionCount: 255, // Maximum session count, default 65535
});
```

### Creating and Using Sessions

```typescript
// Create a session
const session = manager.createSession("default");

// Send message and wait for reply
try {
    const response = await session.send({ command: "turnOnLight" });
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

### Handling Session Messages

**Important**: When receiving messages from remote endpoints, you need to use `manager.isSession(message)` to determine if it's a session message. If it is, get the corresponding session via `manager.getSession(message, message.from)` and then call `session.next(message)` to pass the message to the session handler.

```typescript
// In message receiving handler function
function onMessage(message) {
    // Check if it's a session message
    if (manager.isSession(message)) {
        // Get the corresponding session
        const session = manager.getSession(message, message.from);
        if (session) {
            // Pass the message to session handler
            session.next(message);
        }
    } else {
        // Handle non-session messages
        console.log("Received regular message:", message);
    }
}
```

### Retry Mechanism

`PSession` has a built-in retry mechanism that can be configured using the `retryCount` and `retryInterval` parameters of the `send` method.

```typescript
import { SessionTimeoutError } from "psession";

// Use built-in retry mechanism to send messages
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // Set retry parameters directly in the send method
        const response = await session.send(
            { command: "queryStatus" },
            {
                retryCount: 3, // Retry 3 times (4 times total)
                retryInterval: 500, // 500ms interval between retries
            }
        );
        console.log("Received reply:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("Still timed out after multiple retries");
        } else {
            console.error("Error occurred:", error);
        }
    } finally {
        session.end();
    }
}
```

### Timeout Mechanism

`PSession` provides two timeout mechanisms to manage session lifecycles:

1. **Session Timeout (sessionTimeout)**: Controls the maximum time to wait for a response after sending a message
2. **Session Maximum Lifetime (sessionMaxLife)**: Controls the maximum survival time of the entire session object

```typescript
// Configure timeout parameters when creating session manager
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionTimeout: 5000, // Session will timeout if no response is received after 5 seconds
    sessionMaxLife: 600000, // After 10 minutes, the session will be automatically cleaned up even if still in use
});

// Configure timeout parameter for a single send (higher priority than global configuration)
try {
    const response = await session.send(
        { command: "queryStatus" },
        { timeout: 3000 } // Set 3 seconds timeout for this request only
    );
    console.log("Received reply:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Request timeout");
    }
}
```

**How Timeout Mechanism Works**:

-   After sending a message, the system starts a timer. If no response is received within `sessionTimeout`, a `SessionTimeoutError` is thrown
-   The system periodically checks all sessions (default every `sessionTimeout/2` time)
-   If a session's last activity time exceeds `sessionMaxLife`, the session is automatically terminated and cleaned up
-   When using the retry mechanism, timeout detection is paused until all retries are completed

### Port

In `PSession`, `Port` is an important concept, especially suitable for one-to-many and many-to-many communication scenarios:

1. **Purpose of Ports**:

    - Ports are used to distinguish different communication endpoints (such as different devices, services, or clients)
    - Each port maintains its own collection of sessions, allowing session IDs from different ports to be managed independently
    - The port mechanism enables the system to establish sessions with multiple endpoints simultaneously without confusing session states

2. **One-to-Many Communication Scenarios**:

    - When an application needs to communicate with multiple devices simultaneously, it can create a port for each device
    - Each port can independently manage sessions with the corresponding device, using its own session ID space
    - Example: A control center connecting to multiple smart home devices, each device using an independent port

3. **Many-to-Many Communication Scenarios**:

    - In complex systems, multiple services need to communicate with multiple clients
    - The port mechanism allows the system to create independent session management spaces for each communication relationship
    - Example: In a microservice architecture, Service A needs to communicate simultaneously with Services B, C, and D

Example below:

### Socket Server Example

Here's a simple example of a Socket server using PSession, showing how to manage sessions for multiple clients:

```typescript
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
    sessionTimeout: 10000, // 10 seconds timeout
});

// Create TCP server
const server = net.createServer((client) => {
    console.log("Client connected", client.remoteAddress);

    // Create a port for each client
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

            // If it's a session message, pass it to the session manager
            if (manager.isSession(message)) {
                const session = manager.getSession(message, portName);
                if (session) {
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log("Received regular message:", message);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Clean up resources when client disconnects
    client.on("end", () => {
        console.log("Client disconnected", client.remoteAddress);
        port.destroy();
    });
});

// Start server
server.listen(3000, () => {
    console.log("Server started, listening on port 3000");
});

// Example: Handle client commands
manager.on("session:create", (session) => {
    console.log("New session created:", session.id);

    // Set session handler function
    session.on("next", async (message) => {
        console.log("Received session message:", message);

        // Simulate command processing
        if (message.command === "getTime") {
            await session.send({
                status: "success",
                time: new Date().toISOString(),
            });
        }
    });
});
```

This example demonstrates how to:

1. Create an independent port for each connected client
2. Use the session manager to handle client messages
3. Implement basic command processing logic
4. Manage session lifecycle and resource cleanup

## Error Handling

`PSession` provides several error types to help handle different exception situations:

-   `SessionTimeoutError`: Session timeout error
-   `SessionCancelError`: Session cancelled error
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
        console.error("Session cancelled");
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

1. Always call the `session.end()` method to release resources after using a session
2. Set appropriate `sessionTimeout` and `sessionMaxLife` parameters to avoid resource waste
3. When handling received messages, ensure correct calling of the `session.next(message)` method

## License

`MIT`

[Open Source Recommendations](https://zhangfisher.github.io/repos/)typescript
import { SessionManager } from "psession";
import WebSocket from "ws";

// Create WebSocket client
const ws = new WebSocket("ws://localhost:8080");

// Create session manager
const manager = new SessionManager({
sender: (message) => {
// Send message to server
if (ws.readyState === ws.OPEN) {
ws.send(JSON.stringify(message));
} else {
console.error("WebSocket not connected, cannot send message");
}
},
sessionTimeout: 5000, // 5 seconds timeout
});

// Handle successful connection
ws.on("open", () => {
console.log("Connected to server");

    // Send regular command message
    ws.send(
        JSON.stringify({
            type: "command",
            command: "getStatus",
        })
    );

    // Create session and send message
    const session = manager.createSession("default");

    // Use session to send message and wait for response
    session
        .send({
            type: "query",
            query: "getDeviceList",
        })
        .then((response) => {
            console.log("Received session response:", response);

            // Continue sending messages in the same session
            return session.send({
                type: "query",
                query: "getDeviceDetails",
                deviceId: response.devices[0].id,
            });
        })
        .then((details) => {
            console.log("Received device details:", details);

            // End session
            session.end();
        })
        .catch((error) => {
            console.error("Session error:", error);
            session.end();
        });

});

// Handle server messages
ws.on("message", (data) => {
try {
const message = JSON.parse(data.toString());

        // Check if it's a session message
        if (manager.isSession(message)) {
            const session = manager.getSession(message);
            if (session) {
                // Pass the message to the corresponding session
                session.next(message);
            }
        } else {
            // Handle non-session messages
            console.log("Received regular server message:", message);
        }
    } catch (error) {
        console.error("Message parsing error:", error);
    }

});

// Handle connection close
ws.on("close", () => {
console.log("Connection to server closed");
});

// Handle errors
ws.on("error", (error) => {
console.error("WebSocket error:", error);
});

````

## Guide

### Session Principles

The core of `PSession` is a session management mechanism based on session IDs (`sid`), which tracks and manages multiple concurrent sessions by embedding unique session identifiers in messages.

1. **SID Generation and Assignment**:

    - Each new session is automatically assigned a unique numeric `ID`
    - `SID` starts from `1` and increments until it reaches the configured maximum session count (default `65535`)
    - When `SID` is exhausted, the system recycles the earliest session ID according to the configured strategy

2. **Message Marking Mechanism**:

    - When sending a message, the system automatically adds a session `SID` field to the message object (default field name is `sid`)
    - The receiver identifies and routes messages to the corresponding session handler by checking the `SID` field in the message
    - This mechanism allows messages from multiple sessions to be transmitted in the same channel without confusion

3. **Session Lifecycle Management**:
    - Session creation: Create a new session via the `createSession()` method
    - Session activity: Update the session's last activity time each time a message is sent
    - Session termination: Actively end the session via the `session.end()` method, or wait for the system to automatically clean up timed-out sessions

**SID Configuration**

```typescript
// Customize session ID field name
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionIdName: "sessionId", // Change default 'sid' to 'sessionId'
    maxSessionCount: 1000, // Set maximum session count to 1000 (default 65535)
    // Custom session overflow handling strategy
    onSessionOverflow: (port) => {
        // Return the session ID to be recycled
        // Default returns 1, i.e., recycle the earliest created session
        return 1;
    },
});
````

### Creating a Session Manager

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
    sessionMaxLife: 600000, // Maximum session lifecycle, default 600000ms (10 minutes)
    sessionIdName: "sid", // Session ID field name, default 'sid'
    maxSessionCount: 255, // Maximum session count, default 65535
});
```

### Creating and Using Sessions

```typescript
// Create a session
const session = manager.createSession("default");

// Send message and wait for reply
try {
    const response = await session.send({ command: "turnOnLight" });
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

### Handling Session Messages

**Important**: When receiving messages from remote endpoints, you need to use `manager.isSession(message)` to determine if it's a session message. If it is, get the corresponding session via `manager.getSession(message, message.from)` and then call `session.next(message)` to pass the message to the session handler.

```typescript
// In message receiving handler function
function onMessage(message) {
    // Check if it's a session message
    if (manager.isSession(message)) {
        // Get the corresponding session
        const session = manager.getSession(message, message.from);
        if (session) {
            // Pass the message to session handler
            session.next(message);
        }
    } else {
        // Handle non-session messages
        console.log("Received regular message:", message);
    }
}
```

### Retry Mechanism

`PSession` has a built-in retry mechanism that can be configured using the `retryCount` and `retryInterval` parameters of the `send` method.

```typescript
import { SessionTimeoutError } from "psession";

// Use built-in retry mechanism to send messages
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // Set retry parameters directly in the send method
        const response = await session.send(
            { command: "queryStatus" },
            {
                retryCount: 3, // Retry 3 times (4 times total)
                retryInterval: 500, // 500ms interval between retries
            }
        );
        console.log("Received reply:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("Still timed out after multiple retries");
        } else {
            console.error("Error occurred:", error);
        }
    } finally {
        session.end();
    }
}
```

### Timeout Mechanism

`PSession` provides two timeout mechanisms to manage session lifecycles:

1. **Session Timeout (sessionTimeout)**: Controls the maximum time to wait for a response after sending a message
2. **Session Maximum Lifetime (sessionMaxLife)**: Controls the maximum survival time of the entire session object

```typescript
// Configure timeout parameters when creating session manager
const manager = new SessionManager({
    sender: (message) => {
        /* Sending logic */
    },
    sessionTimeout: 5000, // Session will timeout if no response is received after 5 seconds
    sessionMaxLife: 600000, // After 10 minutes, the session will be automatically cleaned up even if still in use
});

// Configure timeout parameter for a single send (higher priority than global configuration)
try {
    const response = await session.send(
        { command: "queryStatus" },
        { timeout: 3000 } // Set 3 seconds timeout for this request only
    );
    console.log("Received reply:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("Request timeout");
    }
}
```

**How Timeout Mechanism Works**:

-   After sending a message, the system starts a timer. If no response is received within `sessionTimeout`, a `SessionTimeoutError` is thrown
-   The system periodically checks all sessions (default every `sessionTimeout/2` time)
-   If a session's last activity time exceeds `sessionMaxLife`, the session is automatically terminated and cleaned up
-   When using the retry mechanism, timeout detection is paused until all retries are completed

### Port

In `PSession`, `Port` is an important concept, especially suitable for one-to-many and many-to-many communication scenarios:

1. **Purpose of Ports**:

    - Ports are used to distinguish different communication endpoints (such as different devices, services, or clients)
    - Each port maintains its own collection of sessions, allowing session IDs from different ports to be managed independently
    - The port mechanism enables the system to establish sessions with multiple endpoints simultaneously without confusing session states

2. **One-to-Many Communication Scenarios**:

    - When an application needs to communicate with multiple devices simultaneously, it can create a port for each device
    - Each port can independently manage sessions with the corresponding device, using its own session ID space
    - Example: A control center connecting to multiple smart home devices, each device using an independent port

3. **Many-to-Many Communication Scenarios**:

    - In complex systems, multiple services need to communicate with multiple clients
    - The port mechanism allows the system to create independent session management spaces for each communication relationship
    - Example: In a microservice architecture, Service A needs to communicate simultaneously with Services B, C, and D

Example below:

### Socket Server Example

Here's a simple example of a Socket server using PSession, showing how to manage sessions for multiple clients:

```typescript
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
    sessionTimeout: 10000, // 10 seconds timeout
});

// Create TCP server
const server = net.createServer((client) => {
    console.log("Client connected", client.remoteAddress);

    // Create a port for each client
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

            // If it's a session message, pass it to the session manager
            if (manager.isSession(message)) {
                const session = manager.getSession(message, portName);
                if (session) {
                    session.next(message);
                }
            } else {
                // Handle non-session messages
                console.log("Received regular message:", message);
            }
        } catch (error) {
            console.error("Message parsing error:", error);
        }
    });

    // Clean up resources when client disconnects
    client.on("end", () => {
        console.log("Client disconnected", client.remoteAddress);
        port.destroy();
    });
});

// Start server
server.listen(3000, () => {
    console.log("Server started, listening on port 3000");
});

// Example: Handle client commands
manager.on("session:create", (session) => {
    console.log("New session created:", session.id);

    // Set session handler function
    session.on("next", async (message) => {
        console.log("Received session message:", message);

        // Simulate command processing
        if (message.command === "getTime") {
            await session.send({
                status: "success",
                time: new Date().toISOString(),
            });
        }
    });
});
```

This example demonstrates how to:

1. Create an independent port for each connected client
2. Use the session manager to handle client messages
3. Implement basic command processing logic
4. Manage session lifecycle and resource cleanup

## Error Handling

`PSession` provides several error types to help handle different exception situations:

-   `SessionTimeoutError`: Session timeout error
-   `SessionCancelError`: Session cancelled error
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
        console.error("Session cancelled");
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

1. Always call the `session.end()` method to release resources after using a session
2. Set appropriate `sessionTimeout` and `sessionMaxLife` parameters to avoid resource waste
3. When handling received messages, ensure correct calling of the `session.next(message)` method

## License

`MIT`

[Open Source Recommendations](https://zhangfisher.github.io/repos/)
