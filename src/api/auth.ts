/** 兼容旧引用；请优先使用 ./user + ./client */
export { login, register } from './user';
export { setToken, getToken, clearToken } from './client';
