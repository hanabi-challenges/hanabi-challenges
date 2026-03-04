import { api } from './supertest';

export function get(path: string) {
  return api().get(path);
}

export function post(path: string) {
  return api().post(path);
}

export function put(path: string) {
  return api().put(path);
}

export function del(path: string) {
  return api().delete(path);
}
