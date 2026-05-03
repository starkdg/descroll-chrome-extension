import path from 'path';
import { fileURLToPath } from 'url';
import CopyPlugin from 'copy-webpack-plugin';
import { execSync } from 'child_process';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
const version = packageJson.version;

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
    {
      apply: (compiler) => {
        compiler.hooks.afterEmit.tap('ZipPlugin', () => {
          try {
            console.log('Packaging extension...');
            execSync(`mkdir -p releases && cd dist && zip -r ../releases/descroll-extension-v${version}.zip ./*`);
            console.log(`Created releases/descroll-extension-v${version}.zip`);
          } catch (error) {
            console.error('Error creating zip package:', error);
          }
        });
      },
    },
  ],
  resolve: {
    extensions: ['.js'],
  },
  optimization: {
    minimize: false,
  },
};
