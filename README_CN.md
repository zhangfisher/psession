# PSession

`PSession`是一个轻量级的会话管理工具，它提供了简单而强大的 API，帮助开发者轻松处理`一对一`或`一对多`等通信场景下的会话通信流程。

## 特性

-   🚀 轻量级设计，易于集成
-   🔄 支持多端口会话管理
-   ⏱️ 内置会话超时机制
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

## 工作原理

`Psession`是目的了帮助位于远程网络上的两端进行点对点异步通信时，建立`请求/响应`通信提供封装。

即向远程对象发送一条异步消息，并等待对方的响应，确保在本地与远程建立端到端的`请求/响应`通信。

**基本原理如下：**

1. 在`Local`创建一个`SessionManager`管理器,负责会话的跟踪和管理.
2. 创建一个`Session`对象，由于本地的`SessionManager`自动分配一个`sid`.
3. 然后当`session.send(message)`向`Remote`发送一条消息。`session.send`方法会自动在消息体中增加会话标识（即`sid`）。

```ts
messsage = {
    type: "get",
    payload: 1,
};

session.send(message);
// 实际发送的中{type:'get',payload:1,sid:<会话id>}
```

3. `Remote`接收到该消息后，在进行响应时，需要**原样返回该会话 id**。这样，在本地就可以跟据此`sid`来给发送者响应。

## 快速入门

为了帮助快速了解`Psession`的使用，假设有`Local`和`Remote`两个对象，两者位于不同的电脑，双方通过`TCP/UDP/WebSocket`等，或者浏览器中与`worker`进行通信，并且在接收到到消息会调用`onMessage` 方法。如下：

### 环境准备

下面以在浏览器端中，页面与`worker`进行`请求/响应`通信为例、

```ts
// main.js
const worker = new Worker("./worker.js");

class Local {
    constructor() {
        worker.onmessage = this.onMessage.bind(this);
    }
    onMessage(message) {
        // 接收来至worker的方法
    }
}

// worker.js
class Remote {
    constructor() {
        self.onmessage = this.onMessage.bind(this);
    }
    onMessage(message) {
        // 接收来自页面的消息
    }
}
```

现在我们需用利用`PSession`来实现`Local`向`Remote`发送端到端的消息并得到正确响应。

###第 1 步: 创建`SessionManager`

在发送端需要创建`SessionManager`，负责管理和跟踪每一次会话。

```ts
// main.ts
import { SessionManager } from "psession";

const worker = new Worker("./worker.js");

class Local {
    // 创建会话管理器
    sessionManager = new SessionManager({
        // 需要配置一个发送函数，用来向远程发送消息
        sender: (message) => {
            worker.postMessage(message);
        },
    });
    constructor() {
        worker.onmessage = this.onMessage.bind(this);
    }
    onMessage(message) {
        // 接收来至worker的方法
    }
}
```

### 第 2 步: 创建`Session`并发送消息

接下来，`Local`创建会话对象并向`Remote`发送消息。

```ts
// main.ts
import { SessionManager } from "psession";

const worker = new Worker("./worker.js");

class Local {
    // 创建会话管理器
    sessionManager = new SessionManager({
        // 需要配置一个发送函数，用来向远程发送消息
        sender: (message) => {
            worker.postMessage(message);
        },
    });
    constructor() {
        worker.onmessage = this.onMessage.bind(this);
    }
    onMessage(message) {
        // 接收来至worker的方法
    }
    // 向远程发送消息
    send(message) {
        const session = this.sessionManager.createSession({ once: true });
        // session.send内部会调用上述配置的sender通过worker.postMessage将消息发送出去

        return session.send(message);
    }
}

const local = new Local();
// send返回的是一个Promise，因为需要等待响应
// 向远程发送并等待响应
const result = await local.send({ type: "request", value: 1 });
```

-   `this.sessionManager.createSession`会创建一个`Session`实例并保存，直到会话结束。
-   以`{ once: true }`参数用于标识该会话是一次性的，在会话响应或结束时会自动销毁。
-   `session.send`返回一个`Promise`，直至会话得到响应/超时/中止/取消等时被`resolve`或`reject`。

### 第 3 步: 接收端响应

当`Remote`接收到来自`Local`的消息时，需要进行识别并响应。

```ts
// worker.ts
class Remote {
    constructor() {
        self.onmessage = this.onMessage.bind(this);
    }
    onMessage(message) {
        // 如果消息体中sid>0，则说明这是一条会话消息
        if (message.sid && message.sid > 0) {
            // ...处理消息
            self.postMessage({
                type: "response",
                payload: 100,
                // 重点：需要原路返回此sid值，这样Local才可以识别
                sid: message.sid,
            });
        }
    }
}
```

### 第 4 步: 处理响应消息

在`第2步`中,`await local.send(....)`发送语句处于堵塞状态`pending`，正在等待对方`Remote`的响应。

当`Local`端接收来自`Remote`的消息进行识别，如下：

```ts
// main.ts
import { SessionManager } from "psession";

const worker = new Worker("./worker.js");

class Local {
    sessionManager = new SessionManager(...);
    onMessage(message) {
        // 判断接收到的是否是会话消息
        // 事实上仅仅是判断消息体中是否有sid且sid>0
        if(this.sessionManager.isSession(message)){
            // 如果是，则获取会话实例，即Session实例
            const session = this.sessionManager.getSession()
            // 如果会话实例存在，
            if(session){
                // 会话响应，即上述的await send()被resolve
                session.next(message)
            }else{
                // 会话实例可能已经因超时等原因被销毁了
            }
        }
    }
    ...
}
```

### 第 5 步: 得到响应结果

由于`session.resolve`，所以`await send(...)`就可以返回结果。

```ts
const local = new Local();
// send返回的是一个Promise，因为需要等待响应
// 向远程发送并等待响应
const result = await local.send({ type: "request", value: 1 });
console.log(result);
// { type: "response",payload: 100, sid: 1}
```

### 小结

以上我们仅在`Local`创建`SessionManager`，如果`Remote`也需要向`Local`发送消息并得到响应，只需要同样创建`SessionManager`并按相同逻辑处理即可。

## 指南

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
