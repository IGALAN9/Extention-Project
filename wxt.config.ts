import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
  // localhost untuk API model; akses halaman web diperlukan oleh mode Auto untuk membaca artikel aktif.
  host_permissions: ['http://localhost:8000/*', '<all_urls>'],
  permissions: ['storage', 'tabs', 'activeTab', 'scripting'],
  },
});
