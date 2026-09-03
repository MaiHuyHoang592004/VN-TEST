import { auth } from "@opcreative/auth";

import { Home } from "@/components/pages/home/home";
import { LoginScreen } from "@/components/pages/auth/login-screen";
import { ResetPassword } from "@/components/pages/auth/reset-password";

export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    reset?: string;
    signup?: string;
    period?: string;
    from?: string;
    to?: string;
  }>;
}) {
  // "/" is the login screen when signed out, the dashboard home when signed
  // in. Auth.js error redirects land here as ?error=… for the inline message;
  // the forgot-password OTP flow lands signed-in at /?reset=1.
  const session = await auth();
  const { error, reset, signup, period, from, to } = await searchParams;
  if (session?.user) {
    return reset ? (
      <ResetPassword />
    ) : (
      // Home decides WHICH report to run from the viewer's permissions, so the
      // window is all this page has to hand it.
      <Home user={session.user} searchParams={{ period, from, to }} />
    );
  }
  return <LoginScreen error={error} signup={!!signup} />;
}
