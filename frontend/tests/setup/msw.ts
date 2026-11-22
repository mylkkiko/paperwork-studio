import { setupServer } from 'msw/node';

/** Mock API. Tests add handlers with server.use(http.get(api('/...'), ...)). */
export const server = setupServer();
export const API = 'http://api.test/api';
export const api = (path: string) => `${API}${path}`;
