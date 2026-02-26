const BASE_URL = 'http://api.xiaoen.xyz';

export async function request(
  url: string,
  method: 'GET' | 'POST',
  data?: any
) {
  const response = await fetch(`${BASE_URL}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? JSON.stringify(data) : undefined,
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result?.message || 'Request Error');
  }

  return result;
}