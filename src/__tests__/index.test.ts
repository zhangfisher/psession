import { describe, test, expect, beforeEach, beforeAll, jest, afterEach } from "bun:test";
import { SessionManager, type SessionManagerOptions } from "../manager";
import { FastEventBus, FastEventBusNode } from "fastevent/eventbus";
import { SessionTimeoutError, SessionCancelError } from "../errors";
import type { Session } from "../session";

type MockMessage = {
	type: "request" | "response";
	value: number;
};

const eventbus = new FastEventBus();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Peer = {
	node: FastEventBusNode;
	sessionManager: SessionManager;
	send: (message: any) => Promise<any>;
	createSession: () => Session<any>;
	setPeer: (id: string) => void;
};
function createPeer(id: string, peerId: string) {
	let sessionManager: SessionManager;
	const node = new FastEventBusNode({
		id,
		onMessage: async (message) => {
			await delay(10);
			const data = message.payload;
			if (sessionManager.isSession(data)) {
				const session = sessionManager.getSession(data);
				if (session) {
					session?.next(data);
				} else {
					node.send(peerId, { sid: data.sid, type: "response", value: data.value + 1 });
				}
			}
		},
	});
	node.connect(eventbus);
	sessionManager = creaetSessionManager(node, peerId);
	return {
		node,
		sessionManager,
		setPeer: (id: string) => {
			peerId = id;
			sessionManager = creaetSessionManager(node, peerId);
		},
		createSession: () => {
			return sessionManager.createSession()!;
		},
		send: (message: any) => {
			return sessionManager.createSession()!.send(message);
		},
	};
}

function creaetSessionManager(
	peer: FastEventBusNode,
	receiver: string,
	options?: Omit<SessionManagerOptions, "sender">,
) {
	return new SessionManager({
		sender: (message: any) => {
			peer.send(receiver, message);
		},
		maxSessionCount: 100,
		sessionTimeout: 1000,
		sessionMaxLife: 2000,
		...Object.assign({}, options),
	});
}

// SessionPort类的单元测试
describe("Session", () => {
	let sender: Peer;
	let receiver: Peer;

	beforeAll(() => {});
	beforeEach(() => {
		sender = createPeer("sender", "receiver");
		receiver = createPeer("receiver", "sender");
	});
	afterEach(() => {
		sender.node.disconnect();
		receiver.node.disconnect();
		eventbus.clear();
	});
	test("创建会话并发送等待响应", () => {
		return new Promise<void>((resolve) => {
			// sender.send({ type: "request", value: 1 }).then((response) => {
			// 	expect(response.type).toBe("response");
			// 	expect(response.value).toBe(2);
			// 	// expect(session.pending).toBe(false);
			// 	expect(sender.sessionManager.ports.get("default")?.sessions.size).toBe(0);
			// 	resolve();
			// });
			const session = sender.sessionManager.createSession()!;
			session.send({ type: "request", value: 1 }).then((response) => {
				expect(response.type).toBe("response");
				expect(response.value).toBe(2);
				expect(session.pending).toBe(false);
				resolve();
			});
		});
	});

	test("会话超时没有响应导致超时", () => {
		return new Promise<void>((resolve) => {
			sender.setPeer("x");
			const session = sender.sessionManager.createSession()!;
			sender.send({ type: "request", value: 1 }).catch((error) => {
				expect(error).toBeInstanceOf(SessionTimeoutError);
				expect(session.pending).toBe(false);
				resolve();
			});
		});
	});

	test("会话被主动取消", () => {
		return new Promise<void>((resolve) => {
			const session = sender.createSession()!;
			// 发送请求但立即取消
			session.send({ type: "request", value: 1 }).catch((error) => {
				expect(error).toBeInstanceOf(SessionCancelError);
				expect(session.pending).toBe(false);
				resolve();
			});
			setTimeout(() => {
				// 取消会话
				session.cancel();
			});
		});
	});

	test("多次会话来回", async () => {
		const session = sender.createSession()!;

		// 第一次请求
		const response1 = await session.send({ type: "request", value: 1 });
		expect(response1.type).toBe("response");
		expect(response1.value).toBe(2);

		// 第二次请求
		const response2 = await session.send({ type: "request", value: 2 });
		expect(response2.type).toBe("response");
		expect(response2.value).toBe(3);

		// 第三次请求
		const response3 = await session.send({ type: "request", value: 3 });
		expect(response3.type).toBe("response");
		expect(response3.value).toBe(4);

		expect(session.pending).toBe(false);
	});

	test("会话达到最大生存周期时超时", () => {
		return new Promise<void>((resolve) => {
			const session = sender.createSession()!;
			const defaultPort = sender.sessionManager.ports.get("default")!;
			Object.assign(defaultPort.options, {
				maxSessionCount: 100,
				sessionTimeout: 1000,
				sessionMaxLife: 100, // 设置非常短的生命周期
			});

			// 模拟会话已经超过最大生命周期
			// 设置为200ms前发送的，所以
			session.lastSendTime = Date.now() - 300;
			// 马上会话检测，超时会话会被timeput
			defaultPort.inspect();
			// 等待一段时间后检查会话是否被清除
			setTimeout(() => {
				expect(defaultPort.sessions.size).toBe(0);
				expect(session.pending).toBe(false);
				resolve();
			}, 300);
		});
	});

	test("会话发送出错处理", () => {
		return new Promise<void>((resolve) => {
			// 创建一个会话管理器，发送函数会抛出错误
			const errorSessionManager = new SessionManager({
				sender: () => {
					throw new Error("发送失败");
				},
				maxSessionCount: 100,
				sessionTimeout: 1000,
				sessionMaxLife: 2000,
			});

			const session = errorSessionManager.createSession()!;
			session.send({ type: "request", value: 1 }).catch((error) => {
				expect(error).toBeInstanceOf(Error);
				expect(error.message).toBe("发送失败");
				expect(session.pending).toBe(false);
				resolve();
			});
		});
	});

	test("创建多个Port", () => {
		// 创建多个Port
		const port1 = sender.sessionManager.createPort("port1", {
			sender: () => sender.send("receiver"),
		});
		const port2 = sender.sessionManager.createPort("port2", {
			sender: () => sender.send("receiver"),
		});

		expect(sender.sessionManager.ports.has("port1")).toBe(true);
		expect(sender.sessionManager.ports.has("port2")).toBe(true);

		// 在不同的Port上创建会话
		const session1 = sender.sessionManager.createSession("port1")!;
		const session2 = sender.sessionManager.createSession("port2")!;

		expect(port1.sessions.has(String(session1.id))).toBe(true);
		expect(port2.sessions.has(String(session2.id))).toBe(true);
	});

	test("当会话id溢出时的处理", () => {
		return new Promise<void>((resolve) => {
			let isOverflow: boolean = false;
			// 创建一个会话管理器，设置最大会话数为3
			const smallSessionManager = new SessionManager({
				sender: () => sender.send("receiver"),
				maxSessionCount: 3,
				sessionTimeout: 1000,
				sessionMaxLife: 2000,
				onSessionOverflow: () => {
					isOverflow = true;
					return 2;
				},
			});

			const port = smallSessionManager.ports.get("default")!;

			// 创建3个会话，达到最大会话数
			smallSessionManager.createSession()!;
			smallSessionManager.createSession()!;
			smallSessionManager.createSession()!;

			expect(port.sessions.size).toBe(3);

			// 尝试创建第4个会话，此时应该会触发onSessionOverflow
			// 默认行为是返回1，即会取消id为1的会话
			const session4 = smallSessionManager.createSession()!;

			// 检查id为1的会话是否被取消

			expect(port.sessions.size).toBe(3);
			expect(session4.id).toBe(2); // 新会话应该复用id 1
			expect(isOverflow).toBe(true);
			resolve();
		});
	});
	test("发送函数出错时的处理", () => {
		return new Promise<void>((resolve) => {
			sender.sessionManager.default.options.sender = () => {
				throw new Error("发送失败");
			};
			const session = sender.sessionManager.createSession()!;
			session.send({ type: "request", value: 1 }).catch((error) => {
				expect(error).toBeInstanceOf(Error);
				expect(error.message).toBe("发送失败");
				expect(session.pending).toBe(false);
				resolve();
			});
		});
	});
	test("发送时超时产生Timeout错误", () => {
		return new Promise<void>((resolve) => {
			sender.sessionManager.default.options.sessionTimeout = 10;
			const session = sender.sessionManager.createSession()!;
			session.send({ type: "request", value: 1 }).catch((error) => {
				expect(error).toBeInstanceOf(Error);
				expect(session.pending).toBe(false);
				resolve();
			});
		});
	});
	test("发送时超时时进行了5次重试", () => {
		return new Promise<void>((resolve) => {
			const sendFn = jest.fn();
			sender.sessionManager.default.options.sessionTimeout = 100;
			sender.sessionManager.default.options.retryCount = 5;
			sender.sessionManager.default.options.retryInterval = 10;
			sender.sessionManager.default.options.sender = sendFn;
			// 指定一个不存在的Peer，会导致发送超时失败
			sender.setPeer("xxx");
			const session = sender.sessionManager.default.create()!;
			session.send({ type: "request", value: 1 }).catch((error) => {
				expect(error).toBeInstanceOf(Error);
				expect(session.pending).toBe(false);
				expect(sendFn).toHaveBeenCalledTimes(6);
				resolve();
			});
		});
	}, 10000000);

	test("单一Session多轮连续对话", async () => {
		const count = 10;

		const session = sender.sessionManager.default.create()!;
		const values = [];
		for (let i = 0; i < count; i++) {
			const response = await session.send({ type: "request", value: i });
			values.push(response.value);
		}
		expect(values).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
	});
});
