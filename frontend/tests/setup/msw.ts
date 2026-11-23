import { setupServer } from 'msw/node';

/** Mock API. Tests add handlers with server.use(http.get(api('/...'), ...)). */
export const server = setupServer();
export const API = 'http://app.test/api'; // same origin as the page
export const api = (path: string) => `${API}${path}`;
