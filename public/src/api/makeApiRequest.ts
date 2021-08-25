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
      if (error.response.status === 401) {
        sessionStorage.removeItem('email');
        sessionStorage.removeItem('token');
        return {
          ...error,
          errorText:
            'Authentication failed, please check your credentials and try again'
        };
      }
      return {
        ...error,
        errorText: 'Something went wrong. Please try again later'
      };
    });
}
