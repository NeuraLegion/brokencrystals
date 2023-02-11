import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Testimonial } from '../interfaces/Testimonial';
import {
  LoginFormMode,
  LoginUser,
  RegistrationUser,
  UserData
} from '../interfaces/User';
import { Product } from '../interfaces/Product';
import { OidcClient } from '../interfaces/Auth';
import { ApiUrl } from './ApiUrl';
import { makeApiRequest } from './makeApiRequest';

export const httpClient: AxiosInstance = axios.create();

export function getTestimonials(): Promise<any> {
  return makeApiRequest({ url: ApiUrl.Testimonials, method: 'get' });
}

export function getTestimonialsCount(): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Testimonials}/count?query=${encodeURIComponent(
      'select count(1) as count from testimonial'
    )}`,
    method: 'get'
  });
}

export function getProducts(): Promise<Product[]> {
  return makeApiRequest({
    url: ApiUrl.Products,
    method: 'get',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    }
  });
}

export function getLatestProducts(): Promise<Product[]> {
  return makeApiRequest({ url: ApiUrl.LatestProducts, method: 'get' });
}

export function postTestimonials(data: Testimonial): Promise<any> {
  return makeApiRequest({
    url: ApiUrl.Testimonials,
    method: 'post',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    },
    data
  });
}

export function postSubscriptions(email: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Subscriptions}?email=${email}`,
    method: 'post'
  });
}

export function postUser(data: RegistrationUser): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/${data.op}`,
    method: 'post',
    data
  });
}

export function getUser(
  user: LoginUser,
  config: AxiosRequestConfig = {}
): Promise<any> {
  const data = user.op === LoginFormMode.HTML ? mapToUrlParams(user) : user;
  return makeApiRequest({
    url: `${ApiUrl.Auth}/login`,
    method: 'post',
    data,
    ...config
  });
}

export function searchUsers(searchText: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/search/${searchText}`,
    method: 'get',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    }
  });
}

export function getUserData(
  email: string,
  config: AxiosRequestConfig = {}
): Promise<UserData> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${email.trim()}`,
    method: 'get',
    ...config
  });
}

export function getLdap(ldapProfileLink: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/ldap?query=${encodeURIComponent(ldapProfileLink)}`,
    method: 'get'
  });
}

export function loadDomXsrfToken(fingerprint: string): Promise<string> {
  const config: AxiosRequestConfig = {
    url: `${ApiUrl.Auth}/dom-csrf-flow`,
    method: 'get',
    headers: { fingerprint }
  };

  return makeApiRequest(config);
}

export function loadXsrfToken(): Promise<string> {
  const config: AxiosRequestConfig = {
    url: `${ApiUrl.Auth}/simple-csrf-flow`,
    method: 'get'
  };

  return makeApiRequest(config);
}

export function getOidcClient(): Promise<OidcClient> {
  return makeApiRequest({
    url: `${ApiUrl.Auth}/oidc-client`,
    method: 'get'
  });
}

export function postMetadata(): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Metadata}`,
    method: 'post',
    headers: { 'content-type': 'text/xml' },
    data:
      '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE child [ <!ENTITY child SYSTEM "file:///etc/passwd"> ]><child></child>'
  });
}

export function getSpawnData(): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Spawn}?command=pwd`,
    method: 'get',
    headers: { 'content-type': 'text/plain' }
  });
}

export function getUserPhoto(email: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${email}/photo`,
    method: 'get',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    },
    responseType: 'arraybuffer'
  });
}

export function getAdminStatus(email: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${email}/adminpermission`,
    method: 'get',
    headers: {
      authorization:
        sessionStorage.getItem('token') || localStorage.getItem('token')
    }
  });
}

export function putUserData(user: UserData): Promise<UserData> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${user.email}/info`,
    method: 'put',
    headers: {
      'content-type': 'application/json',
      'authorization':
        sessionStorage.getItem('token') || localStorage.getItem('token')
    },
    data: user
  });
}

export function putPhoto(photo: File, email: string): Promise<any> {
  const data = new FormData();
  data.append(email, photo, photo.name);

  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${email}/photo`,
    method: 'put',
    headers: {
      'content-type': 'image/png',
      'authorization':
        sessionStorage.getItem('token') || localStorage.getItem('token')
    },
    data
  });
}

export function goTo(url: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Goto}?url=${url}`,
    method: 'get'
  });
}

export function postRender(data: string): Promise<any> {
  return makeApiRequest({
    url: ApiUrl.Render,
    method: 'post',
    headers: { 'content-type': 'text/plain' },
    data
  });
}

function mapToUrlParams<T>(data: T): URLSearchParams {
  return Object.entries(data).reduce((acc, [k, v]) => {
    acc.append(k, v);
    return acc;
  }, new URLSearchParams());
}

export function putFile(fileName: string, file: File): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.File}/raw?path=${fileName}`,
    method: 'put',
    headers: {
      'content-type': 'file/*'
    },
    data: file
  });
}

export function getFile(fileName: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.File}/raw?path=${fileName}`,
    method: 'get',
    headers: {
      'content-type': 'file/*'
    }
  });
}

export function viewProduct(productName: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Products}/views`,
    method: 'get',
    headers: {
      'authorization':
        sessionStorage.getItem('token') || localStorage.getItem('token'),
      'x-product-name': productName
    }
  });
}
