import assert from 'node:assert/strict';
import {extractPublicUrls} from '../netlify/functions/_shared/public-url-reader.mjs';
assert.equal(extractPublicUrls('https://example.com/a')[0],'https://example.com/a');
console.log('URL parser passed');
