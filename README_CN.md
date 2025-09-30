# PSession

`PSession`是一个轻量级的会话管理工具，专为需要维护多个会话状态的应用程序设计。它提供了简单而强大的 API，帮助开发者轻松处理`一对一`或`一对多`等场景下的会话通信流程。

## 特性

-   🚀 轻量级设计，易于集成
-   🔄 支持多端口会话管理
-   ⏱️ 内置会话超时管理
-   🔁 支持重试机制
-   🧩 灵活的会话 ID 管理
-   📦 TypeScript 支持，类型安全

## 安装

```bash
npm install psession
yarn add psession
pnpm add psession
bun add psession
```

## 快速入门

以下是一个使用 `WebSocket` 实现的服务器和客户端示例，展示如何使用 `PSession` 进行会话管理：

### WebSocket 服务器端

```typescript
import { SessionManager } from "psession";
import { WebSocketServer } from "ws";

// 创建WebSocket服务器
const wss = new WebSocketServer({ port: 8080 });

// 创建会话管理器
const manager = new SessionManager({
    sessionTimeout: 10000,
});

// 处理新的WebSocket连接
wss.on("connection", (ws, req) => {
    const clientId = req.socket.remoteAddress + ":" + req.socket.remotePort;
    // 为每个客户端创建一个独立的端口
    const port = manager.createPort(clientId, {
        sender: (message) => {
            // 发送消息到特定客户端
            if (ws.readyState === ws.OPEN) {
                ws.send(JSON.stringify(message));
            }
        },
    });

    // 处理来自客户端的消息
    ws.on("message", (data) => {
        try {
            const message = JSON.parse(data.toString());

            // 判断是否是会话消息
            if (manager.isSession(message)) {
                const session = manager.getSession(message, clientId);
                if (session) {
                    // 将消息传递给对应的会话
                    session.next(message);
                }
            } else {
                // 处理非会话消息
                // 示例：处理客户端请求，创建新会话
                if (message.type === "command") {
                    // 创建新会话处理命令
                    const session = manager.createSession(clientId);

                    // 发送会话消息并等待响应
                    session
                        .send({
                            type: "response",
                            command: message.command,
                            status: "processing",
                        })
                        .then(() => {
                            // 模拟处理命令
                            setTimeout(() => {
                                session.send({
                                    type: "response",
                                    command: message.command,
                                    status: "completed",
                                    result: `命令 "${message.command}" 已执行完成`,
                                });

                                // 结束会话
                                session.end();
                            }, 1000);
                        });
                }
            }
        } catch (error) {
            console.error("消息解析错误:", error);
        }
    });

    // 处理连接关闭
    ws.on("close", () => {
        console.log(`客户端已断开: ${clientId}`);
        // 销毁该客户端的所有会话
        port.destroy();
    });
});

// 监听会话创建事件
manager.on("session:create", (session) => {
    console.log(`新会话已创建: ${session.id} (端口: ${session.port})`);
});
```

### WebSocket 客户端端

```typescript
import { SessionManager } from "psession";
import WebSocket from "ws";

// 创建WebSocket客户端
const ws = new WebSocket("ws://localhost:8080");

// 创建会话管理器
const manager = new SessionManager({
    sender: (message) => {
        // 发送消息到服务器
        if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify(message));
        } else {
            console.error("WebSocket未连接，无法发送消息");
        }
    },
    sessionTimeout: 5000, // 5秒超时
});

// 连接成功时的处理
ws.on("open", () => {
    console.log("已连接到服务器");

    // 发送普通命令消息
    ws.send(
        JSON.stringify({
            type: "command",
            command: "getStatus",
        })
    );

    // 创建会话并发送消息
    const session = manager.createSession("default");

    // 使用会话发送消息并等待响应
    session
        .send({
            type: "query",
            query: "getDeviceList",
        })
        .then((response) => {
            console.log("收到会话响应:", response);

            // 在同一会话中继续发送消息
            return session.send({
                type: "query",
                query: "getDeviceDetails",
                deviceId: response.devices[0].id,
            });
        })
        .then((details) => {
            console.log("收到设备详情:", details);

            // 结束会话
            session.end();
        })
        .catch((error) => {
            console.error("会话错误:", error);
            session.end();
        });
});

// 处理服务器消息
ws.on("message", (data) => {
    try {
        const message = JSON.parse(data.toString());

        // 判断是否是会话消息
        if (manager.isSession(message)) {
            const session = manager.getSession(message);
            if (session) {
                // 将消息传递给对应的会话
                session.next(message);
            }
        } else {
            // 处理非会话消息
            console.log("收到服务器普通消息:", message);
        }
    } catch (error) {
        console.error("消息解析错误:", error);
    }
});

// 处理连接关闭
ws.on("close", () => {
    console.log("与服务器的连接已关闭");
});

// 处理错误
ws.on("error", (error) => {
    console.error("WebSocket错误:", error);
});
```

## 指南

### 会话原理

`PSession`的核心是基于会话 ID（`sid`）的会话管理机制，它通过在消息中嵌入唯一的会话标识符来跟踪和管理多个并发会话。

1. **SID 的生成与分配**：

    - 每个新会话被创建时，系统会自动分配一个唯一的数字`ID`
    - `SID` 从 `1` 开始递增，直到达到配置的最大会话数（默认`65535`）
    - 当 `SID` 用尽时，系统会根据配置的策略回收最早的会话 ID

2. **消息标记机制**：

    - 发送消息时，系统自动在消息对象中添加会话 `SID` 字段（默认字段名为 `sid`）
    - 接收方通过检查消息中的`SID`字段来识别和路由消息到对应的会话处理器
    - 这种机制使得多个会话的消息可以在同一通道中传输而不会混淆

3. **会话生命周期管理**：
    - 会话创建：通过 `createSession()` 方法创建新会话
    - 会话活跃：每次发送消息时更新会话的最后活动时间
    - 会话结束：通过 `session.end()` 方法主动结束会话，或等待系统自动清理超时会话

**SID 配置**

```typescript
// 自定义会话 ID 字段名
const manager = new SessionManager({
    sender: (message) => {
        /* 发送逻辑 */
    },
    sessionIdName: "sessionId", // 将默认的 'sid' 改为 'sessionId'
    maxSessionCount: 1000, // 设置最大会话数为 1000（默认 65535）
    // 自定义会话溢出处理策略
    onSessionOverflow: (port) => {
        // 返回要回收的会话 ID
        // 默认返回 1，即回收最早创建的会话
        return 1;
    },
});
```

### 创建会话管理器

```typescript
import { SessionManager } from "psession";

// 创建会话管理器
const manager = new SessionManager({
    // 发送消息的函数
    sender: (message) => {
        // 实现消息发送逻辑
        console.log("发送消息:", message);
        // 例如: socket.send(JSON.stringify(message));
    },
    // 可选配置
    sessionTimeout: 5000, // 会话超时时间，默认 60000ms (1分钟)
    sessionMaxLife: 600000, // 会话最大生命周期，默认 600000ms (10分钟)
    sessionIdName: "sid", // 会话ID字段名，默认 'sid'
    maxSessionCount: 255, // 最大会话数，默认 65535
});
```

### 创建和使用会话

```typescript
// 创建一个会话
const session = manager.createSession("default");

// 发送消息并等待回复
try {
    const response = await session.send({ command: "打开灯" });
    console.log("收到回复:", response);

    // 可以在同一会话中继续发送消息
    if (response.status === "needPassword") {
        const result = await session.send({ password: "123456" });
        console.log("验证结果:", result);
    }
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("会话超时");
    }
} finally {
    // 会话结束后记得调用 end 方法释放资源
    session.end();
}
```

### 处理会话消息

**重点**：当从远端接收到消息时，需要通过`manager.isSession(message)`判断是否是会话消息，如果是，则通过`manager.getSession(message, message.from)`获取对应的会话，然后调用`session.next(message)`将消息传递给会话处理函数。

```typescript
// 在消息接收处理函数中
function onMessage(message) {
    // 判断是否是会话消息
    if (manager.isSession(message)) {
        // 获取对应的会话
        const session = manager.getSession(message, message.from);
        if (session) {
            // 将消息传递给会话处理
            session.next(message);
        }
    } else {
        // 处理非会话消息
        console.log("收到普通消息:", message);
    }
}
```

### 重试机制

`Psession` 内置了重试机制，可以通过 `send` 方法的 `retryCount` 和 `retryInterval` 参数来设置重试次数和重试间隔。

```typescript
import { SessionTimeoutError } from "psession";

// 使用内置重试机制发送消息
async function sendWithRetry() {
    const session = manager.createSession("device1");

    try {
        // 直接在send方法中设置重试参数
        const response = await session.send(
            { command: "查询状态" },
            {
                retryCount: 3, // 重试3次（总共4次）
                retryInterval: 500, // 每次重试间隔500ms
            }
        );
        console.log("收到回复:", response);
    } catch (error) {
        if (error instanceof SessionTimeoutError) {
            console.error("多次重试后仍然超时");
        } else {
            console.error("发生错误:", error);
        }
    } finally {
        session.end();
    }
}
```

### 超时机制

`PSession`提供了两种超时机制来管理会话的生命周期：

1. **会话超时（sessionTimeout）**：控制每次发送消息后等待响应的最大时间
2. **会话最大生命周期（sessionMaxLife）**：控制整个会话对象的最大存活时间

```typescript
// 创建会话管理器时配置超时参数
const manager = new SessionManager({
    sender: (message) => {
        /* 发送逻辑 */
    },
    sessionTimeout: 5000, // 5秒后如果没有收到响应，会话将超时
    sessionMaxLife: 600000, // 10分钟后，即使会话仍在使用，也会被自动清理
});

// 单次发送时配置超时参数（优先级高于全局配置）
try {
    const response = await session.send(
        { command: "查询状态" },
        { timeout: 3000 } // 仅为此次请求设置3秒超时
    );
    console.log("收到回复:", response);
} catch (error) {
    if (error instanceof SessionTimeoutError) {
        console.error("请求超时");
    }
}
```

**超时机制工作原理**：

-   每次发送消息后，系统会启动一个计时器，如果在 `sessionTimeout` 时间内没有收到响应，会抛出 `SessionTimeoutError`
-   系统会定期检查所有会话（默认每 `sessionTimeout/2` 时间检查一次）
-   如果发现会话的最后活动时间超过 `sessionMaxLife`，会自动结束并清理该会话
-   当使用重试机制时，超时检测会暂停，直到所有重试完成

### Port

在`PSession`中，`Port`（端口）是一个重要概念，特别适用于一对多、多对多通信场景：

1. **端口的作用**：

    - 端口用于区分不同的通信对端（如不同的设备、服务或客户端）
    - 每个端口维护自己的会话集合，使得不同端口的会话 ID 可以独立管理
    - 端口机制使系统能够同时与多个对端建立会话，而不会混淆会话状态

2. **一对多通信场景**：

    - 当一个应用需要同时与多个设备通信时，可以为每个设备创建一个端口
    - 每个端口可以独立管理与对应设备的会话，使用各自的会话 ID 空间
    - 例如：一个控制中心同时连接多个智能家居设备，每个设备使用独立端口

3. **多对多通信场景**：

    - 在复杂系统中，多个服务需要与多个客户端通信
    - 端口机制允许系统为每对通信关系创建独立的会话管理空间
    - 例如：微服务架构中，服务 A 需要同时与服务 B、C、D 通信

示例如下：

### Socket 服务器示例

以下是一个简单的 Socket 服务器使用 PSession 的示例，展示了如何管理多个客户端的会话：

```typescript
import { SessionManager } from "psession";
import * as net from "net";

// 创建会话管理器
const manager = new SessionManager({
    sender: (message) => {
        // 发送消息到客户端
        const client = message.client;
        if (client && !client.destroyed) {
            client.write(JSON.stringify(message));
        }
    },
    sessionTimeout: 10000, // 10秒超时
});

// 创建 TCP 服务器
const server = net.createServer((client) => {
    console.log("客户端已连接", client.remoteAddress);

    // 为每个客户端创建一个端口
    const portName = `client_${client.remoteAddress}:${client.remotePort}`;
    const port = manager.createPort(portName, {
        sender: (message) => {
            // 发送消息到特定客户端
            if (!client.destroyed) {
                client.write(JSON.stringify(message));
            }
        },
    });

    // 处理客户端消息
    client.on("data", (data) => {
        try {
            const message = JSON.parse(data.toString());
            message.client = client; // 附加客户端引用

            // 如果是会话消息，交给会话管理器处理
            if (manager.isSession(message)) {
                const session = manager.getSession(message, portName);
                if (session) {
                    session.next(message);
                }
            } else {
                // 处理非会话消息
                console.log("收到普通消息:", message);
            }
        } catch (error) {
            console.error("消息解析错误:", error);
        }
    });

    // 客户端断开连接时清理资源
    client.on("end", () => {
        console.log("客户端已断开", client.remoteAddress);
        port.destory();
    });
});

// 启动服务器
server.listen(3000, () => {
    console.log("服务器已启动，监听端口 3000");
});

// 示例：处理客户端命令
manager.on("session:create", (session) => {
    console.log("新会话创建:", session.id);

    // 设置会话处理函数
    session.on("next", async (message) => {
        console.log("收到会话消息:", message);

        // 模拟处理命令
        if (message.command === "getTime") {
            await session.send({
                status: "success",
                time: new Date().toISOString(),
            });
        }
    });
});
```

这个示例展示了如何：

1. 为每个连接的客户端创建一个独立的端口
2. 使用会话管理器处理客户端消息
3. 实现基本的命令处理逻辑
4. 管理会话生命周期和资源清理

## 错误处理

`PSession`提供了几种错误类型来帮助处理不同的异常情况：

-   `SessionTimeoutError`: 会话超时错误
-   `SessionCancelError`: 会话被取消错误
-   `SessionInvalidError`: 无效会话错误
-   `SessionAbortError`: 会话中止错误

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
        console.error("会话超时");
    } else if (error instanceof SessionCancelError) {
        console.error("会话被取消");
    } else if (error instanceof SessionInvalidError) {
        console.error("无效的会话");
    } else if (error instanceof SessionAbortError) {
        console.error("会话被中止");
    } else {
        console.error("未知错误:", error);
    }
}
```

## 注意事项

1. 会话使用完毕后务必调用 `session.end()` 方法释放资源
2. 合理设置 `sessionTimeout` 和 `sessionMaxLife` 参数，避免资源浪费
3. 处理接收到的消息时，确保正确调用 `session.next(message)` 方法

## 许可证

`MIT`

[开源推荐](https://zhangfisher.github.io/repos/)
