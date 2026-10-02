import { api as remoteApi } from './remoteClient';
import { api as localApi } from './local/localApi';

export const api = import.meta.env.VITE_DATA_MODE === 'local' ? localApi : remoteApi;
