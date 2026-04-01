export function isAuthDisabled() {
  return process.env.AUTH_DISABLED === "true";
}

export function isProduction() {
  return process.env.NODE_ENV === "production";
}

export function authDisabledInProduction() {
  return isProduction() && isAuthDisabled();
}

export function requireSafeAuthMode() {
  if (authDisabledInProduction()) {
    throw new Error("AUTH_DISABLED ne doit jamais être activé en production.");
  }
}
