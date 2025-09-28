import { writable } from 'svelte/store';

export const authToken = writable(null);
export const username = writable(null);

export function setAuth(token, user) {
  authToken.set(token);
  username.set(user);
}

export function clearAuth() {
  authToken.set(null);
  username.set(null);
}
