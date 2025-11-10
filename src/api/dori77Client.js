import { createClient } from '../sdk/index';

import { appParams } from '@/lib/app-params';

const { serverUrl } = appParams;

export const dori77 = createClient({
  serverUrl,
});