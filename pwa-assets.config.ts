import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const BRAND_GREEN = '#006c4c';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: BRAND_GREEN },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: BRAND_GREEN },
    },
  },
  images: ['public/favicon.svg'],
});
