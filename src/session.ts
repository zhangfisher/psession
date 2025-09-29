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

import type { ISessionMessage } from "./types";
import type { SessionPort } from "./port";
import { SessionAbortError, SessionCancelError, SessionInvalidError, SessionTimeoutError } from "./errors";
import { delay } from "./utils";

export type SessionOptions = {
	timeout?: number;
	retryCount?: number;
	retryInterval?: number;
};

export class Session<Message extends ISessionMessage> {
	id: number;
	private _resolve: ((value: any) => void) | null;
	private _reject: ((reason?: any) => void) | null;
	destroyed: boolean = false;
	retrying: boolean = false; //是否正在重试
	pending: boolean;
	lastSendTime: number;

	options: Required<SessionOptions>;
	constructor(
		public port: SessionPort,
		id: number,
		options?: SessionOptions,
	) {
		this.options = Object.assign(
			{
				timeout: 0,
				retryCount: 0,
				retryInterval: 1000,
			},
			options,
		);
		this.id = id;
		this._resolve = null;
		this._reject = null;
		this.pending = false; //是否正在等待回复
		this.lastSendTime = Date.now(); // 更新最后发送时间戳
	}

	private _assertSessionInvalid() {
		if (this.destroyed) throw new SessionInvalidError();
	}
	/**
	 *
	 * 发送消息并等待回复
	 *
	 * @param message
	 * @param options {SessionOptions}
	 * @param options.timeout 等待回复的超时时间，默认0，由全局会话超时控制，如果指定，则需要小于全局会话超时
	 * @param options.retry 重试次数，默认0，不重试，当超时后进行重试
	 * @return {Promise<any>}
	 */
	async send<R = Message>(message: Message, options?: SessionOptions): Promise<R> {
		// 会话是否有效，如果已经被销毁，则抛出异常
		// 当会话对象会end后就不再有效，如果需要则需要重新创建会话对象
		this._assertSessionInvalid();
		const retryCount = (options?.retryCount || this.options.retryCount) + 1;
		if (retryCount > 1) {
			let result: R;
			let hasError: any;
			const retryInterval = options?.retryInterval || this.options.retryInterval;
			try {
				for (let i = 0; i < retryCount; i++) {
					if (i > 0) {
						this.retrying = true;
					}
					try {
						result = await this._send(message, options);
						return result;
					} catch (e) {
						hasError = e;
					}
					if (i < retryCount - 1) await delay(retryInterval);
				}
				if (hasError) {
					throw hasError;
				} else {
					throw new SessionAbortError();
				}
			} finally {
				this.retrying = false;
			}
		} else {
			return this._send(message, options);
		}
	}
	private _send<R = Message>(message: Message, options?: SessionOptions): Promise<R> {
		const { timeout } = options ? Object.assign({}, options, this.options) : this.options;
		return new Promise<R>((resolve, reject) => {
			this.pending = true;
			//每次发送均需要更新时间，否则会话因为超时被清除
			this.lastSendTime = Date.now(); // 更新最后发送时间戳
			// @ts-expect-error
			message[this.port.options.sessionIdName] = this.id;
			this._resolve = resolve;
			this._reject = reject;
			try {
				this.port.send(message);
				// 如果指定了超时时间且小于全局会话超时时，允许单独控制本次发送的超时
				if (timeout > 0) {
					setTimeout(() => {
						this.timeout();
					}, timeout);
				}
			} catch (e: any) {
				this.abort(e);
			}
		});
	}
	/**
	 *
	 *  让会话超时
	 *
	 */
	timeout(): void {
		this.pending = false;
		if (this._reject) {
			this._reject(new SessionTimeoutError());
		}
	}
	cancel() {
		this.pending = false;
		if (this._reject) {
			this._reject(new SessionCancelError());
		}
	}
	abort(e?: Error) {
		this.pending = false;
		if (this._reject) {
			this._reject(e);
		}
	}
	/**
	 * 发送消息，不等待回复
	 * @param message
	 * @returns
	 */
	post(message: Message) {
		// @ts-expect-error
		message[this.manager.options.sessionIdName] = this.id;
		//每次发送均需要更新时间，否则会话因为超时被清除
		this.lastSendTime = Date.now(); // 更新最后发送时间戳
		//执行初始化SessionManager传入的回调函数
		return this.port.send!(message);
	}
	/**
	 *
	 * 此方法在接收到消息时调用
	 *
	 * - 当有下一条消息来时，由会话拥有者调用此方法
	 * - 传入的消息会被返回给send的调用者
	 *
	 *
	 * @param message
	 */
	next(message: Message): void {
		this.pending = false;
		if (this._resolve) {
			this._resolve(message);
		}
	}
	//结束会话
	end(): void {
		if (this.pending) {
			this.cancel();
		}
		this.destroyed = true;
		//延时销毁自己
		setTimeout(() => {
			this.port.remove(this.id);
		});
	}
}
