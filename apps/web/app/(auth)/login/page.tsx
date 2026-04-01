import { LoginClient } from "./login-client";

export default function LoginPage() {
  const authDisabled = process.env.AUTH_DISABLED === "true";
  return <LoginClient authDisabled={authDisabled} />;
}
