"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { useTranslation } from "@/lib/i18n";
import { Input } from "@/components/ui/input";

/** Password field with a show/hide toggle. */
export function PasswordInput(
  props: Omit<React.ComponentProps<typeof Input>, "type">,
) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={show ? "text" : "password"} className="pr-10" />
      <button
        type="button"
        tabIndex={-1}
        aria-label={t(show ? "auth.hidePassword" : "auth.showPassword")}
        className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center transition-colors"
        onClick={() => setShow((s) => !s)}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
