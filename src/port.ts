/*
   提供一个抽象的会话管理功能

    let manager=new SessionManager({
        sessionMaxId:255,                           // 默认255个会话对象
        sessionName:''                              // 会话字段名称，默认是session
        sessionTimeout:                             // 会话超时时间默认5秒
        sessionMaxLife || 1000 * 60 * 10            // 会话生命周期 10分钟
        sender:function(message){}                  // 需要提供一个发送函数，用来发送消息
    })


    let session=manager.createSession(endpoint="45353454353")
    result1 = await session.send({....})//当有数据回复时，会返回接收到的消息，如果超时则会返回undefined
    try{
        result1 = await session.send({....})
    }catch(e){
    }

    ....
    session.send(Message({...}),false) //发送一条不需要回复的消息
    result2 = await session.send(Message({....}))//同一个会话，允许多个来回，每次调用此方法均会重新计算超时时间
    //当会话结束时，需要调用会话结束方法，该方法告诉Protocol清除Session对象
    //如果没有调用可能导致Protocol对象长时间保存该session对象，
    // 因此Protocol对象给每个Session对象指定了一个10分钟的生存期，即每次调用send开始计算，如果10分钟内没有
    // 任何回复，则会清除该会话对象
    session.end()

    特殊注意：
    1. 由于sid使用sessionMaxId约定最大值。
    2. Session特别适用于一问一答式的协议会话处理
    3. 如果会话超时，即session.send会话没有及时得到回复,则会触发一个超时错误。可以有以下几种处理方式：
       - 整个会话结束，调用.end()方法完成会话。超时回复的消息会被忽略。
    4.endpoint用来标识建立会话的对方.以Eventbus为例
      ANode、BNode均是Eventbus的节点，ANode可能即需要与BNode之间创建多条会话，也可能需要与其他节点创建多条会话
      因此，endpoint就用来标识对方名称，一般可以使用对方的sn或节点的名称。

 
    使用方法：

    1. 创建会话管理器
    let manager=new SessionManager({
        ....
        sender:chat.send
    })

      message={from:"tom",sid:8}
      在接收到消息时应该判断是否是会话消息，如果是则应该交给SessionManager处理
      onMessage(message){
        if(manager.isSession(message)){
            let session = manager.getSession(message.sid,message.from)
            if(!session){ 
                session = manager.createSession(message.from)
            }
            session.next(message)
        }else{
            .....
        }
      }


function retry(fn,{retryCount=3,retryInterval=1000}={}){}



    2. 发送消息：命令对方开灯

    async openLight(){

        let session = await manager.createSession("jack")

        const retrySend = retry(session.send,{retryCount:5,retryInterval:500})

        try{
            let response  = await retrySend({请打开灯})
            break
        }catch(error){
            if(error instanceof SessionTimeoutError){

            }
        } 

        
        
        if(response.cms=="请输入密码"){
            response  = await retrySend("123")
        }
        
        session.end()


            <----> EndPoint(B)  1
        A   <----> EndPoint(C)  1 
            <----> EndPoint(D)
   
        A
          onMessage(topic,data){
             // 判定Endpoint 是谁
             // 判定是是不是会话，哪个会话
            if(manager.isSession(message)){
                let session = manager.getSession(message.sid,message.from)
                if(!session){ 
                    session = manager.createSession(message.from)  ===  {[endpoint]:{[sid]:{}，}}
                }
                session.next(message)
            }else{
                .....
            }
          }

        onMessage(){
            if(isMessage){
                this.log(`${message.from} ${message.message}`)
            }
        }


        async startTalkSession(username){
            
            let session = await manager.createSession("tech")

             while(true){
                try{
                    let response = await session.send({from,message})
                    if(response.type==="回执"){
                        this.log(`${response.message})
                    }
                }catch(e){
                    if(e instanceof TimeOutError){

                    }
                }
            }
        }
        async startRoomTalkSession(username){
           ....
        }




        const retrySend = retry(session.send,{retryCount:5,retryInterval:500})

        try{
            let response  = await retrySend({请打开灯})
            break
        }catch(error){
            if(error instanceof SessionTimeoutError){

            }
        } 
    }



 */

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
	 */
	clear(): void {
		this.sessions.clear();
		this._idSeq = 1;
	}
	/**
	 * 取消正在进行的会话
	 */
	cancel() {
		this.sessions.forEach((session) => {
			session.cancel();
		});
		this.sessions.clear();
	}
	timeout() {
		this.sessions.forEach((session) => {
			session.timeout();
		});
		this.sessions.clear();
	}
	remove(sid: number | string) {
		this.sessions.delete(String(sid));
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
}
