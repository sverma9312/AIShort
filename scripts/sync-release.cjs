/**
 * sync-release.cjs
 * Automatically fetches the latest completed Android EAS build and uploads it
 * to GitHub Releases (v1.0.0-preview) with permanent hosting.
 */
const { execSync } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');

const REPO = 'sverma9312/AIShort';
const RELEASE_TAG = 'v1.0.0-preview';
const TEMP_APK = path.join(__dirname, '..', '.temp-latest-build.apk');

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const creds = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const match = creds.match(/password=(.+)/);
    if (match && match[1]) return match[1].trim();
  } catch (e) {}
  throw new Error('No GitHub token found. Please set GITHUB_TOKEN or configure git credential manager.');
}

async function main() {
  const token = getGitHubToken();

  console.log('1. Checking latest EAS build...');
  const jsonOutput = execSync('eas build:list --limit=1 --json', {
    cwd: path.join(__dirname, '..', 'apps', 'mobile'),
    encoding: 'utf8'
  });

  const builds = JSON.parse(jsonOutput);
  if (!builds || builds.length === 0) {
    throw new Error('No builds found on EAS.');
  }

  const latest = builds[0];
  console.log(`Latest build ID: ${latest.id}`);
  console.log(`Status: ${latest.status}`);
  console.log(`Commit: ${latest.gitCommitHash} ("${latest.gitCommitMessage || ''}")`);

  if (latest.status !== 'FINISHED') {
    console.log(`Build is currently ${latest.status}. Please wait until the build finishes.`);
    return;
  }

  const apkUrl = latest.artifacts?.buildUrl || latest.artifacts?.applicationArchiveUrl;
  if (!apkUrl) {
    throw new Error('No artifact URL found on the latest build.');
  }

  console.log(`\n2. Downloading APK from Expo...\n   ${apkUrl}`);
  await downloadFile(apkUrl, TEMP_APK);
  const stats = fs.statSync(TEMP_APK);
  console.log(`Downloaded: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);

  console.log(`\n3. Finding GitHub Release ${RELEASE_TAG}...`);
  const release = await githubRequest(`/repos/${REPO}/releases/tags/${RELEASE_TAG}`, 'GET', null, token);
  console.log(`Found release ID: ${release.id}`);

  // If asset already exists, delete it first
  if (release.assets && release.assets.length > 0) {
    for (const a of release.assets) {
      if (a.name === 'AIShort.apk') {
        console.log(`Replacing existing asset ${a.id}...`);
        await githubRequest(`/repos/${REPO}/releases/assets/${a.id}`, 'DELETE', null, token);
      }
    }
  }

  console.log('\n4. Uploading fresh AIShort.apk to GitHub Release...');
  const uploadUrl = new URL(release.upload_url.replace('{?name,label}', ''));
  uploadUrl.searchParams.set('name', 'AIShort.apk');

  await new Promise((resolve, reject) => {
    const uploadReq = https.request({
      hostname: uploadUrl.hostname,
      path: uploadUrl.pathname + uploadUrl.search,
      method: 'POST',
      headers: {
        'User-Agent': 'AIShort-Sync-Bot',
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Length': stats.size
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(body));
        } else {
          reject(new Error(`Asset upload failed: HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    uploadReq.on('error', reject);

    const stream = fs.createReadStream(TEMP_APK);
    let uploaded = 0;
    stream.on('data', chunk => {
      uploaded += chunk.length;
      process.stdout.write(`\rUploading... ${(uploaded / (1024 * 1024)).toFixed(1)} / ${(stats.size / (1024 * 1024)).toFixed(1)} MB`);
    });
    stream.pipe(uploadReq);
  });

  console.log('\n\n✅ GitHub Release successfully updated!');
  console.log(`Permanent link: https://github.com/${REPO}/releases/download/${RELEASE_TAG}/AIShort.apk`);

  // Cleanup temp file
  try { fs.unlinkSync(TEMP_APK); } catch (e) {}
}

function downloadFile(targetUrl, dest) {
  return new Promise((resolve, reject) => {
    https.get(targetUrl, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', reject);
  });
}

function githubRequest(apiPath, method = 'GET', data = null, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'User-Agent': 'AIShort-Sync-Bot',
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body ? JSON.parse(body) : null);
        } else {
          reject(new Error(`GitHub API error ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

main().catch(err => {
  console.error('\nError:', err.message);
  process.exit(1);
});
