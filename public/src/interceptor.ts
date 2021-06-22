import axios from 'axios';

axios.interceptors.response.use(
  (response) => {
    console.error('fuck this shit');
    return response;
  },
  (error) => {
    console.log(`error: ${error}`);
    return Promise.reject(error);
  }
);
