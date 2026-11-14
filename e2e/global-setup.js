const TUNNEL_CMD =
  'ssh -i ~/.ssh/id_serverTech -o IdentitiesOnly=yes -N -L 18322:127.0.0.1:8002 root@72.61.20.120';

export default async function globalSetup() {
  const baseURL = (process.env.BASE_URL || 'http://127.0.0.1:18322').replace(/\/+$/, '');
  let res;
  try {
    res = await fetch(`${baseURL}/`, { signal: AbortSignal.timeout(5000) });
  } catch (err) {
    throw new Error(
      `[e2e] Target ${baseURL} is unreachable (${err.message}).\n` +
        `Open the SSH tunnel first:\n  ${TUNNEL_CMD}`,
    );
  }

  if (!res.ok) {
    throw new Error(
      `[e2e] Target ${baseURL} returned HTTP ${res.status}.\n` +
        `Check the SSH tunnel:\n  ${TUNNEL_CMD}`,
    );
  }

  const html = await res.text();
  const match = html.match(/assets\/index-[^"']+\.js/);
  const bundle = match ? match[0] : '(bundle hash not found in HTML)';
  console.log(`[e2e] Target: ${baseURL} | Bundle: ${bundle}`);
}
