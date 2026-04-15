import path from 'path';
import { fileURLToPath } from 'url';
import CopyPlugin from 'copy-webpack-plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  mode: 'production',
  entry: {
    app: './src/app.js',
    background: './src/background.js',
    options: './src/options.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'manifest.json',
          to: 'manifest.json',
          transform(content) {
            const manifest = JSON.parse(content.toString());
            // Adjust paths for bundled files (flattened in dist/)
            if (manifest.background && manifest.background.service_worker) {
              manifest.background.service_worker = 'background.js';
            }
            if (manifest.chrome_url_overrides && manifest.chrome_url_overrides.newtab) {
              manifest.chrome_url_overrides.newtab = 'newtab.html';
            }
            if (manifest.options_ui && manifest.options_ui.page) {
              manifest.options_ui.page = 'options.html';
            }
            return JSON.stringify(manifest, null, 2);
          },
        },
        { from: 'src/newtab.html', to: 'newtab.html' },
        { from: 'src/options.html', to: 'options.html' },
        { from: 'src/styles.css', to: 'styles.css' },
        { from: 'src/themes', to: 'themes' },
        { from: 'icons', to: 'icons' },
      ],
    }),
  ],
  resolve: {
    extensions: ['.js'],
  },
  optimization: {
    minimize: false,
  },
};
