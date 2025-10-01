import { writable } from 'svelte/store';
import { goto } from '$app/navigation';

export const authToken = writable(null);
export const username = writable(null);

export function setAuth(token, user) {
  authToken.set(token);
  username.set(user);
  localStorage.setItem("token", token);
  localStorage.setItem("username", user);
}

export function clearAuth() {
  authToken.set(null);
  username.set(null);
  localStorage.removeItem("token");
  localStorage.removeItem("username");
}

export function autoLogout() {
  clearAuth();
  goto("/login");
}

export function handleApiError(response) {
  if (response.status === 401) {
    autoLogout();
    return true; 
  }
  return false;
}
