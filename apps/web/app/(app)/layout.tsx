import { AppHeader } from "@/components/app-header";
import { getCurrentUser } from "@/lib/auth/get-app-user";
import { isAuthDisabled } from "@/lib/auth/auth-mode";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const authDisabled = isAuthDisabled();

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b10] via-[#0e0e16] to-[#0b0b10]">
      <AppHeader email={user.email} displayName={user.displayName} authDisabled={authDisabled} role={user.role} />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
