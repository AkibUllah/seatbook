export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: 'ORGANIZER' | 'ATTENDEE';
}

export function getToken() {
  return localStorage.getItem('token');
}

export function getUser(): SessionUser | null {
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch {
    return null;
  }
}

export function saveSession(token: string, user: SessionUser) {
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
