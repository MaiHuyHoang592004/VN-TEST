"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";

/**
 * Chép một giá trị máy đọc (mã API, mã SKU) vào clipboard.
 *
 * Nâng lên từ api-keys-panel, nơi hai điều đã được học bằng lỗi thật:
 * navigator.clipboard là undefined ngoài secure context và có thể bị từ chối
 * quyền — không bọc thì cả hai hỏng IM LẶNG trong khi dấu tick vẫn hiện, và
 * người dùng bỏ đi tay không. Và timer sống lâu hơn nút khi dialog đóng giữa
 * chừng, nên phải dọn lúc unmount thay vì để nó set state lên component đã chết.
 */
export function CopyButton({
  value,
  label,
  size = "sm",
  variant = "outline",
}: {
  value: string;
  /** Tên khả truy cập. Bắt buộc — nút chỉ có icon. */
  label: string;
  size?: "sm" | "icon-sm";
  variant?: "outline" | "ghost";
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          toast.error(t("common.copyFailed"));
          return;
        }
        setCopied(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  );
}
