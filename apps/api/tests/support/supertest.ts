import request from 'supertest';
import { app } from '../../src/app';

export function api() {
  return request(app);
}
