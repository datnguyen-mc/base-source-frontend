import { createClient } from '@devvibex/sdk';
import { appParams } from '@/lib/app-params';

const { serverUrl } = appParams;

export const vibex = createClient({
  serverUrl: serverUrl,
});