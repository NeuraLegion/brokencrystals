import axios, { AxiosInstance } from 'axios';
import { makeApiRequest } from './makeApiRequest';
import { ApiUrl } from './ApiUrl';
import { Testimonial } from '../interfaces/Testimonial';
import { LoginUser, RegistrationUser } from '../interfaces/User';

export const httpClient: AxiosInstance = axios.create();

export function getTestimonials(): Promise<any> {
  return makeApiRequest({ url: ApiUrl.Testimonials, method: 'get' });
}

export function postTestimonials(data: Testimonial): Promise<any> {
  return makeApiRequest({
    url: ApiUrl.Testimonials,
    method: 'post',
    data,
  });
}

export function postSubscriptions(email: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Subscriptions}?email=${email}`,
    method: 'post',
  });
}

export function postUser(data: RegistrationUser): Promise<any> {
  return makeApiRequest({
    url: ApiUrl.Users,
    method: 'post',
    data,
  });
}

export function getUser(data: LoginUser): Promise<any> {
  return makeApiRequest({
    url: ApiUrl.Auth,
    method: 'post',
    data,
  });
}

export function getLdap(ldapProfileLink: string): Promise<any> {
  return makeApiRequest({
    url: `${ApiUrl.Users}/ldap?query=${ldapProfileLink}`,
    method: 'get',
  });
}
