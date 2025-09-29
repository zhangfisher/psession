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

export type ISessionMessage = Record<string, any>;

/**
 * 将指定字段设置为必选，排除指定的字段
 * 
 * RequiredKeys<{a?:string,b?:string,c?:string,d?:string},"b" | "c">
 * 
 * === {a:string,b?:string,c?:string,d:string}
 * 
 * 
 */
export type RequiredKeys<T extends Record<string, any>, K extends keyof T = never> = 
  Required<Omit<T, K>> & 
  Partial<Pick<T, K>> extends infer O ? 
    { [P in keyof O]: O[P] } : 
    never


// type Test = {
//   a?: string;
//   b?: string; 
//   c?: string;
//   d?: string;
// }

// // 应用 RequiredKeys
// type Result = RequiredKeys<Test, "b" | "c">;