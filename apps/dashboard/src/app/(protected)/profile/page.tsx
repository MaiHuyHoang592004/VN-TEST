import { getMyProfile } from "@/modules/identity/profile/queries";
import { ProfileForm } from "@/components/pages/profile/profile-form";

/** Reads the signed-in user's own record (guarded in the query) and hands the
 * plain values to the client form. Decimals and Dates are serialised here so
 * nothing non-serialisable crosses the server→client boundary. */
export default async function ProfilePage() {
  const me = await getMyProfile();

  return (
    <ProfileForm
      initial={{
        name: me.name ?? "",
        email: me.email,
        phone: me.phone ?? "",
        companyName: me.companyName ?? "",
        taxId: me.taxId ?? "",
        locale: me.locale,
        timezone: me.timezone,
        image: me.image,
        avatarUrl: me.avatarUrl,
        createdAt: me.createdAt.toISOString(),
      }}
    />
  );
}
