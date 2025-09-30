import { Session, type SessionOptions } from "./session";
import type { ISessionMessage } from "./types";

export type SessionPortOptions = {
	name?: string;
	sender: (message: any) => void;

	retryCount?: number;
	retryInterval?: number;
	maxSessionCount?: number;
	/**
	 * 会话id名称，默认sid
	 *
	 */
	sessionIdName?: string;
	/**
	 * 每次会话超时时间默认10秒
	 */
	sessionTimeout?: number;
	/**
	 * 会话最大存活时间，默认5分钟
	 *
	 * 与sessionTimeout的区别：
	 *
	 * - sessionTimeout是每次发送消息后等待响应超时时间，如果没有收到响应，则会话超时
	 *   而一个会话可以有多次来回，每发送一次启用一次sessionTimeout
	 * - 而sessionMaxLife是会话对象的最大存活时间，一般远远超过sessionTimeout值
	 *
	 * 超过后会强制清除会话对象
	 *
	 */
	sessionMaxLife?: number;
	onSessionOverflow?: (port: SessionPort) => number | string;
};
export class SessionPort<Message extends ISessionMessage = ISessionMessage> {
	options: Required<SessionPortOptions>;
	private _idSeq: number = 1;
	private _timerId: any;
	sessions: Map<string, Session<Message>> = new Map();
	constructor(options?: SessionPortOptions) {
		this.options = Object.assign(
			{
				name: "default",
				retryCount: 0,
				retryInterval: 1000,
				maxSessionCount: 65535,
				sessionIdName: "sid",
				sessionTimeout: 1000 * 10,
				sessionMaxLife: 1000 * 60 * 5,
				onSessionOverflow: () => 1,
			},
			options,
		);
		this._trackSessions();
	}
	get name() {
		return this.options.name!;
	}
	/**
	 * 检测会话ID是否已经被使用了
	 * @param sid
	 * @param endpoint
	 * @private
	 */
	isFree(sid: number | string): boolean {
		return this.sessions.has(String(sid));
	}
	/**
	 * 获取可用的会话ID
	 * @returns {number} 可用的会话ID
	 * @throws {Error} 当会话ID已达最大值时抛出错误
	 * @private
	 */
	private _getFreeSessionId(): number {
		if (this._idSeq >= this.options.maxSessionCount) {
			const newId = this.options.onSessionOverflow(this);
			const session = this.sessions.get(String(newId));
			if (session) {
				session.cancel();
			}
			return Number(newId);
		}
		for (let i = this._idSeq; i <= this.options.maxSessionCount; i++) {
			if (this.sessions.has(String(i))) continue;
			this._idSeq = i;
			return i;
		}
		return 1;
	}
	destory() {
		this.clear();
		if (this._timerId) clearTimeout(this._timerId);
	}
	/**
	 *
	 * 检查所有会话
	 *
	 * - 发现会话超时时执行timeout
	 * - 发现会话已经超过最大存活时间时，执行end
	 * - 每隔sessionTimeout/2 执行一次
	 *
	 * */
	inspect() {
		try {
			const expiredSessions: number[] = [];
			this.sessions.forEach((session) => {
				// 如果会话正在重试，则跳过检查
				if (session.retrying) return;
				const currentTime = Date.now();
				const elapsedTime = currentTime - session.lastSendTime;
				if (session.pending) {
					//如果会话正在等待并且已经超时时间
					if (elapsedTime > this.options.sessionTimeout) {
						session.timeout();
					}
				} else {
					//如果未处于超时状态，则查看是否已经超过会话的最大生命时长
					// 即距离最近一次发送数据已经超时10分钟，则说明可能是session没有调用end结束会话
					// 因此销毁此会话
					if (elapsedTime > this.options.sessionMaxLife) {
						session.end();
						expiredSessions.push(session.id);
					}
				}
			});
			expiredSessions.forEach((id) => {
				this.sessions.delete(String(id));
			});
		} catch (error) {
			console.error("Error in session tracking:", error);
		}
	}
	/**
	 * 跟踪会话
	 *
	 * - 发现会话超时时执行timeout
	 * - 发现会话已经超过最大存活时间时，执行end
	 * - 每隔sessionTimeout/2 执行一次
	 *
	 */
	private _trackSessions(): void {
		const traceSession = () => {
			this.inspect();
			// 清除之前的定时器，避免多个定时器同时运行
			if (this._timerId) {
				clearTimeout(this._timerId);
			}
			// 设置新的定时器
			this._timerId = setTimeout(traceSession, this.options.sessionTimeout / 2);
		};
		// 启动第一个定时器
		this._timerId = setTimeout(traceSession, this.options.sessionTimeout / 2);
	}
	send(message: Message) {
		this.options.sender(message);
	}
	/**
     *
     * 创建一个会话

     * @param options 会话选项

     * @returns 
     * 
     */
	create(options?: SessionOptions): Session<Message> {
		const sid = this._getFreeSessionId();
		const session = new Session<Message>(
			this,
			sid,
			Object.assign(
				{},
				{
					retryCount: this.options.retryCount,
					retryInterval: this.options.retryInterval,
					timeout: this.options.sessionTimeout,
				},
				options,
			),
		);
		this.sessions.set(String(sid), session);
		return session;
	}

	/**
	 * 清除所有会话
	 * @param behavior 如何处理未完成的会话
	 */
	clear(behavior: "timeout" | "cancel" | "abort" = "abort"): void {
		this[behavior]();
		this.sessions.clear();
		this._idSeq = 1;
	}
	abort(e?: Error) {
		this.sessions.forEach((session) => {
			session.abort(e);
		});
	}
	/**
	 * 取消正在进行的会话
	 */
	cancel() {
		this.sessions.forEach((session) => {
			session.cancel();
		});
	}
	/**
	 * 使所有会话超时结束
	 */
	timeout() {
		this.sessions.forEach((session) => {
			session.timeout();
		});
	}
	/**
	 *  判断该消息是否是会话消息
	 *  如果message消息中的sid大于零
	 * @param message
	 * @returns {boolean}
	 */
	isSession(message: Record<string, any>): boolean {
		if (!message) return false;
		try {
			return (
				typeof message === "object" &&
				this.options.sessionIdName in message &&
				message[this.options.sessionIdName] > 0
			);
		} catch {
			return false;
		}
	}
	/**
	 * 根据消息对象获取对应的会话数据
	 * @param {Record<string, any>} message - 包含会话信息的消息对象
	 * @returns {any|null} 如果消息是会话消息则返回对应的会话数据，否则返回null
	 */
	get(message: Record<string, any>) {
		if (this.isSession(message)) {
			const sid = message[this.options.sessionIdName];
			return this.sessions.get(String(sid));
		}
		return null;
	}
	/**
	 * 发送请求并等等响应
	 * @param message
	 * @param options
	 * @returns
	 */
	request<R = Message>(message: Message, options?: SessionOptions): Promise<R> {
		const session = this.create(Object.assign({}, options, { once: true }));
		return session.send<R>(message);
	}
}
