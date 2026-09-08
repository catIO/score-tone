const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const xml = execSync('unzip -p "/Users/catherina/Library/Application Support/BraveSoftware/Brave-Browser/Default/IndexedDB/http_localhost_5173.indexeddb.blob/1/00/8" score.xml').toString();

https.get('https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.9.3/build/opensheetmusicdisplay.min.js', (res) => {
  let code = '';
  res.on('data', chunk => code += chunk);
  res.on('end', () => {
    // Check how many measures and print tags in xml
    console.log('XML length:', xml.length);
  });
});
