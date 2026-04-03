import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getAppUser, isUnlimitedAdminEmail } from "@/lib/auth/get-app-user";
import { isAuthDisabled } from "@/lib/auth/auth-mode";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const authDisabled = isAuthDisabled();

  let user: Awaited<ReturnType<typeof getAppUser>>;
  try {
    user = await getAppUser();
  } catch {
    redirect("/demo?reason=db_error");
  }

  if (!user) {
    redirect("/login");
  }

  const unlimitedAdmin = isUnlimitedAdminEmail(user.email);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b10] via-[#0e0e16] to-[#0b0b10]">
      <AppHeader
        email={user.email}
        displayName={user.displayName}
        authDisabled={authDisabled}
        role={user.role}
        unlimitedAdmin={unlimitedAdmin}
      />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
