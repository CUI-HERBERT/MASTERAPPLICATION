import {createRemoteJWKSet, customFetch, decodeProtectedHeader, jwtVerify} from 'jose';

// Cloudflare's signed application token is verified for every route, including
// the personal portfolio seed. No browser-supplied identity header is trusted.
// https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
const authHeaders = {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};
const authFailure = (error,status) => new Response(JSON.stringify({error}),{status,headers:authHeaders});
const CLOCK_TOLERANCE = 30;
const MAX_TOKEN_LENGTH = 16384;
const MAX_RESOLVERS = 4;

function accessConfig(env) {
  const issuer=typeof env?.ACCESS_TEAM_DOMAIN==='string'?env.ACCESS_TEAM_DOMAIN.trim().replace(/\/$/,''):'';
  const audience=typeof env?.ACCESS_AUD==='string'?env.ACCESS_AUD.trim():'';
  const owner=typeof env?.ACCESS_OWNER_EMAIL==='string'?env.ACCESS_OWNER_EMAIL.trim().toLowerCase():'';
  // Keep the certificate URL in the configured Cloudflare Access tenant. Never
  // follow an untrusted token's issuer, jku or x5u to fetch verification keys.
  if(!/^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/.test(issuer))return null;
  if(!audience||audience.length>256||/\s|REPLACE|YOUR_|YOUR-/i.test(audience))return null;
  if(owner.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(owner))return null;
  return {issuer,audience,owner};
}

/** A factory keeps test network stubs out of deployment configuration. */
export function createAccessAuthorizer({fetchImplementation}={}) {
  const resolvers=new Map();
  function resolver(issuer) {
    let cached=resolvers.get(issuer);
    if(!cached) {
      if(resolvers.size>=MAX_RESOLVERS)resolvers.delete(resolvers.keys().next().value);
      cached=createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`),{
        cacheMaxAge:300000,
        cooldownDuration:30000,
        timeoutDuration:5000,
        [customFetch]:(url,init)=>(fetchImplementation||globalThis.fetch)(url,{...init,redirect:'error'}),
      });
      resolvers.set(issuer,cached);
    }
    // jose refreshes stale keys and retries an unknown kid after its 30 second
    // cooldown. Until a verified matching key is available, access is denied.
    return cached;
  }
  return async function authorizeRequest(request,env) {
    const config=accessConfig(env);
    if(!config)return authFailure('authentication_not_configured',503);
    const token=request.headers.get('cf-access-jwt-assertion');
    if(!token||token.length>MAX_TOKEN_LENGTH)return authFailure('authentication_required',401);
    try {
      const header=decodeProtectedHeader(token);
      if(header.alg!=='RS256'||typeof header.kid!=='string'||!header.kid||header.kid.length>256||header.jku||header.x5u)return authFailure('authentication_required',401);
      const {payload}=await jwtVerify(token,resolver(config.issuer),{
        issuer:config.issuer,audience:config.audience,algorithms:['RS256'],
        clockTolerance:CLOCK_TOLERANCE,
        requiredClaims:['iss','aud','exp','iat','sub','email','type'],
      });
      const now=Math.floor(Date.now()/1000);
      if(payload.type!=='app'||typeof payload.sub!=='string'||!payload.sub||payload.sub.length>512||payload.sub.trim()!==payload.sub||/[\u0000-\u001f\u007f]/.test(payload.sub))return authFailure('authentication_required',401);
      if(!Number.isFinite(payload.iat)||payload.iat>now+CLOCK_TOLERANCE||payload.iat>=payload.exp)return authFailure('authentication_required',401);
      if(typeof payload.email!=='string'||payload.email.trim().toLowerCase()!==config.owner)return authFailure('access_denied',403);
      const userId=`access:${payload.sub}`;
      const headers=new Headers(request.headers);
      // This internal header is rewritten only after signature, audience and
      // sole-owner validation, before calling the retained state API.
      headers.delete('oai-authenticated-user-id');
      headers.delete('cf-access-authenticated-user-email');
      headers.set('oai-authenticated-user-id',userId);
      return {request:new Request(request,{headers}),identity:{userId,email:config.owner}};
    } catch {
      // Do not leak tokens, claims, certificate responses or verifier errors.
      return authFailure('authentication_required',401);
    }
  };
}

export const authorizeRequest=createAccessAuthorizer();
