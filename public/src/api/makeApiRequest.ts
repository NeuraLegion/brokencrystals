import { AxiosRequestConfig } from 'axios';
import { httpClient } from './httpClient';

export function makeApiRequest<T>(
  urlOrConfig: string | AxiosRequestConfig
): Promise<T> {
  const config: AxiosRequestConfig =
    typeof urlOrConfig === 'string' ? { url: urlOrConfig } : urlOrConfig;

  return httpClient.request(config).then((response) => {
    if (response) {
      const token = response.headers.authorization;
      token && sessionStorage.setItem('token', token);

      return response.data;
    }
  });
}
