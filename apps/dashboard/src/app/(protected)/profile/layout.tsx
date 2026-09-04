import { ProfilePageHeader } from "@/components/pages/profile/profile-header";
import { Page } from "@/components/ds";

/**
 * Shell for every /profile tab. The tabs themselves live in the navbar (see
 * config/nav-tabs.ts), so this owns the page container and the hero — which
 * keeps the five tabs sharing one width, one rhythm and one header, and means
 * none of the five page.tsx files needs to know about either.
 */
export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Page className="max-w-3xl">
      <ProfilePageHeader />
      {children}
    </Page>
  );
}
