import base44 from '@base44/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        base44({
            legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
        }),
        react(),
    ],
    server: {
        port: 5173,
        allowedHosts: ['${projectName}.aishare.live'],
    },
});
