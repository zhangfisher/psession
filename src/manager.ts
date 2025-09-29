import { SessionPort, type SessionPortOptions } from './port';
import type { Session } from './session';

// 定义会话管理器选项接口
export type SessionManagerOptions = {
    maxSessionCount?: number;
    sessionIdName?: string;
    sessionTimeout?: number;
    sessionMaxLife?: number;
    sender: (message: Record<string, any>) => void;
    /**
     * 当会话数量超过最大值时，触发此事件
     * 默认会话管理器会自动删除最早建立的会话，以释放资源
     * 如果需要自定义删除策略，则可以实现此方法
     *
     * 默认会返回最近的会话id
     * onSessionOverflow：（)=>1
     *
     * @param port
     * @returns
     */
    onSessionOverflow?: (port: SessionPort) => number | string;
};

/*
构建会话管理器时需要提供一个发送函数
该函数负责进行实际的消息发送，发送函数的签名要求如下：
@param message : 发送的消息
function(message){...}
 endpoints={
    default:{
    }，
    sn=123:{
        1:Session(),
        2:Session()
    }
    sn=456:{
    }
 }

 */
export class SessionManager<Message extends Record<string, any> = Record<string, any>> {
    ports: Map<string, SessionPort<Message>> = new Map();
    options: Required<SessionManagerOptions>;
    constructor(options?: SessionManagerOptions) {
        this.options = Object.assign(
            {
                maxSessionCount: 65535, //默认65535个会话对象
                sessionIdName: 'sid',
                sessionTimeout: 1000 * 60, //会话超时时间默认1分钟
                sessionMaxLife: 1000 * 60 * 10,
                onSessionOverflow: () => 1,
            },
            options,
        );
        this.ports.set(
            'default',
            new SessionPort(
                Object.assign(
                    {
                        name: 'default',
                    },
                    this.options,
                ),
            ),
        );
    }
    /**
     * 获取默认端口
     * @returns {SessionPort}
     */
    get default() {
        return this.ports.get('default')!;
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
            return typeof message === 'object' && this.options.sessionIdName in message && message[this.options.sessionIdName] > 0;
        } catch {
            return false;
        }
    }
    /**
     * 根据消息和端口获取对应的会话
     * @param {Record<string, any>} message - 包含会话ID的消息对象
     * @param {string} [port='default'] - 端口名称，默认为'default'
     * @returns {Session<Message>|undefined} 找到的会话对象，未找到则返回undefined
     */
    getSession(message: Record<string, any>, port: string = 'default'): Session<Message> | undefined {
        if (!this.isSession(message)) return;
        const portObj = this.ports.get(port);
        if (!portObj) return;
        return portObj.sessions.get(String(message[this.options.sessionIdName]));
    }
    /**
     * 创建指定端口的会话
     * @param {string} [port='default'] - 要创建会话的端口名称，默认为'default'
     * @returns {Session|undefined} 创建的会话对象，如果端口不存在则返回undefined
     */
    createSession(port: string = 'default') {
        const portObj = this.ports.get(port);
        if (!portObj) return;
        return portObj.create();
    }
    createPort(name: string, options: SessionPortOptions) {
        const port = new SessionPort(Object.assign(this.options, options, { name }));
        this.ports.set(name, port);
        return port;
    }
    /**
     * 清除所有会话
     */
    clear() {}
}
