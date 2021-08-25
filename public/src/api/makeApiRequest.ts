import { AxiosRequestConfig } from 'axios';
import { httpClient } from './httpClient';

export function makeApiRequest<T>(
  urlOrConfig: string | AxiosRequestConfig
): Promise<T> {
  const config: AxiosRequestConfig =
    typeof urlOrConfig === 'string' ? { url: urlOrConfig } : urlOrConfig;

  return httpClient
    .request(config)
    .then((response) => {
      const token = response.headers.authorization;
      token && sessionStorage.setItem('token', token);
      return response.data;
    })
    .catch((error) => {
      sessionStorage.removeItem('email');
      sessionStorage.removeItem('token');
      return error.response.status === 401
        ? {
            ...error,
            errorText:
              'Authentication failed, please check your credentials and try again'
          }
        : {
            ...error,
            errorText: 'Something went wrong. Please try again later'
          };
    });
}
