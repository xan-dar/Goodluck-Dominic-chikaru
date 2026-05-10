export async function apiFetch(url: string, options: RequestInit = {}) {
  const user = localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null;
  
  const headers = new Headers(options.headers || {});
  if (user) {
    headers.set('x-user-id', user.id.toString());
  }
  headers.set('Content-Type', 'application/json');

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  return response;
}
