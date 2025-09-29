export class SessionError extends Error {}
export class SessionTimeoutError extends SessionError {}
export class SessionCancelError extends SessionError {}
export class SessionInvalidError extends SessionError {}
export class SessionAbortError extends SessionError {}
