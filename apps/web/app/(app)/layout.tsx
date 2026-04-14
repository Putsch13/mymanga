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
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Erreur Prisma de migration → afficher une page d'erreur claire, pas une boucle login
    const isMigration =
      msg.includes("column") || msg.includes("does not exist") ||
      msg.includes("P2022") || msg.includes("Unknown field") ||
      msg.includes("P1001");
    if (isMigration) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0b0b10] px-6">
          <div className="max-w-md text-center space-y-4">
            <p className="text-2xl font-semibold text-white">Mise à jour en cours</p>
            <p className="text-sm text-white/60">
              La base de données est en cours de mise à jour. Réessaie dans quelques instants.
            </p>
            <a
              href="/"
              className="inline-block rounded-xl border border-white/20 px-4 py-2 text-sm text-white/70 hover:text-white transition-colors"
            >
              Retour à l&apos;accueil
            </a>
          </div>
        </div>
      );
    }
    redirect("/login?error=db_error");
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
