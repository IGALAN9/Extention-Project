import { defineConfig } from 'wxt';
import { MODEL_APIS } from './utils/model-api';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    // Izinkan kedua API model dan akses halaman untuk ekstraksi mode Auto.
    host_permissions: [...MODEL_APIS.map(({ baseUrl }) => `${baseUrl}/*`), '<all_urls>'],
    permissions: ['storage', 'tabs', 'activeTab', 'scripting'],
  },
});
