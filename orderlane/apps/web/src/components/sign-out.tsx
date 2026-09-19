import { signOutAction } from "@/app/signin/actions";

/**
 * A form, not a link.
 *
 * Signing out changes state, and a GET that changes state can be triggered by
 * anything that can make the browser fetch a URL — including an image tag on
 * somebody else's page.
 */
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button type="submit">Sign out</button>
    </form>
  );
}
