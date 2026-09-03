/**
 * Shell for every /profile tab. The tabs themselves live in the navbar (see
 * config/nav-tabs.ts), so this only owns the page container — which keeps the
 * five tabs sharing one width and rhythm.
 */
export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8 lg:px-20">
      {children}
    </main>
  );
}
