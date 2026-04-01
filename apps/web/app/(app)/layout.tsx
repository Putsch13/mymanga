import { AppHeader } from "@/components/app-header";
import { getCurrentUser } from "@/lib/auth/get-app-user";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const authDisabled = process.env.AUTH_DISABLED === "true";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b10] via-[#0e0e16] to-[#0b0b10]">
      <AppHeader email={user.email} displayName={user.displayName} authDisabled={authDisabled} />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
