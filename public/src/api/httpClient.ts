import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Testimonial } from '../interfaces/Testimonial';
import { LoginFormMode, LoginUser, RegistrationUser } from '../interfaces/User';
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

export function postTestimonials(data: Testimonial): Promise<any> {
  return makeApiRequest({
    url: ApiUrl.Testimonials,
    method: 'post',
    headers: { authorization: sessionStorage.getItem('token') },
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
    url: ApiUrl.Users,
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

export function getLdap(ldapProfileLink: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/ldap?query=${encodeURIComponent(ldapProfileLink)}`,
    method: 'get'
  });
}

export function loadXsrfToken(): Promise<string> {
  return makeApiRequest({
    url: `${ApiUrl.Auth}/simple-csrf-flow`,
    method: 'get'
  });
}

export function postMetadata(): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Metadata}?xml=${encodeURIComponent(
      '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE child [ <!ENTITY child SYSTEM "file:///etc/passwd"> ]><child></child>'
    )}`,
    method: 'post',
    headers: { 'content-type': 'text/xml' }
  });
}
export function getUserPhoto(email: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/one/${email}/photo`,
    method: 'get',
    headers: { authorization: sessionStorage.getItem('token') },
    responseType: 'arraybuffer'
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
      'authorization': sessionStorage.getItem('token')
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
