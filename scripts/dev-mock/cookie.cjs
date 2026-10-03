const b64u = (s) => Buffer.from(s).toString("base64url");
const F = require("./fixtures.cjs");
const exp = Math.floor(Date.now() / 1000) + 3600 * 24 * 300;
const jwt = [b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })), b64u(JSON.stringify({ sub: F.user.id, exp, aud: "authenticated", role: "authenticated", email: F.user.email })), "sig"].join(".");
const session = { access_token: jwt, token_type: "bearer", expires_in: 3600 * 24 * 300, expires_at: exp, refresh_token: "refresh", user: F.user };
module.exports = { name: "sb-127-auth-token", value: "base64-" + b64u(JSON.stringify(session)) };
