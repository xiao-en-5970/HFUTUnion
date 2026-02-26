import { request } from './request';

export function register(username: string, password: string, re_password: string) {
  return request('/api/v1/user/register', 'POST', {
    username,
    password,
    re_password,
  });
}

export function login(username: string, password: string) {
  return request('/api/v1/user/login', 'POST', {
    username,
    password,
  });
}