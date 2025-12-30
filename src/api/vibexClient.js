import { createClient } from '../sdk/index';

import { appParams } from '@/lib/app-params';

const { serverUrl } = appParams;

export const vibexClient = createClient({
  serverUrl,
});