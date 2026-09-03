"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Camera, CameraOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import { recordScanAction } from "@/modules/fulfillment/stations/actions";

import { useProofUpload } from "./use-proof-upload";
import type { StationGroup } from "./station";

/** Legacy's capture size, kept: the photo is dispute evidence, and 1080p is
 * what made a shipping label readable in it. */
const CAPTURE_WIDTH = 1920;
const CAPTURE_HEIGHT = 1080;
/** Barcode sampling. Faster than this burns battery on a tablet for frames
 * that have not changed; slower feels broken to someone waving a box at it. */
const SAMPLE_MS = 400;
const DUPLICATE_TOAST_MS = 3000;

type Detector = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>> };

/**
 * The optional camera: barcode reading and the proof photo, on hardware that
 * has one.
 *
 * PROGRESSIVE ENHANCEMENT, deliberately. BarcodeDetector ships in Chromium and
 * not in Safari or Firefox, so this panel renders only where it works and the
 * keyboard-wedge input above loses nothing when it doesn't — a station that
 * degraded to "no scanning" on the wrong browser would be worse than no camera
 * feature at all.
 */
export function CameraPanel({
  group,
  onScanned,
  onGroup,
}: {
  group: StationGroup | null;
  onScanned: (group: StationGroup) => void;
  onGroup: (group: StationGroup) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  // Capability, read the hydration-safe way: the server snapshot is false and
  // the client's is the real answer, so the panel is absent in the HTML and
  // appears only where it can work. Setting this from an effect would be a
  // render-then-correct, which is what the lint rule is guarding against.
  const supported = useSyncExternalStore(
    () => () => {},
    () => "BarcodeDetector" in window,
    () => false,
  );
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  /**
   * Mirror the PREVIEW for a front-facing camera.
   *
   * A laptop webcam points at you, and people expect a mirror: raise your left
   * hand and the image should raise its left. Unmirrored, it reads as backwards
   * — which is what a rear/environment camera SHOULD do, because there you are
   * pointing at the world and the picture must match reality (a mirrored
   * shipping label is unreadable).
   *
   * This is CSS only. `drawImage` copies the raw video frame and is unaffected
   * by a transform, so the captured proof photo is never mirrored no matter
   * what the preview shows — which is the property that actually matters, since
   * that photo is dispute evidence.
   */
  const [mirrored, setMirrored] = useState(false);
  const lastValue = useRef<{ value: string; at: number } | null>(null);
  const busy = useRef(false);
  const { upload, overwritePrompt } = useProofUpload(group, onGroup);

  // Start the stream. The ideal constraints come first and a bare {video:true}
  // is the fallback — asking a 720p webcam for 1080p throws
  // OverconstrainedError rather than degrading, which is how a working camera
  // ends up showing a blank panel.
  useEffect(() => {
    if (!supported) return;
    let stream: MediaStream | null = null;
    let cancelled = false;

    (async () => {
      const attempts: MediaStreamConstraints[] = [
        {
          video: {
            width: { ideal: CAPTURE_WIDTH },
            height: { ideal: CAPTURE_HEIGHT },
            frameRate: { ideal: 30, min: 15 },
            facingMode: "environment",
          },
        },
        { video: true },
      ];
      for (const constraints of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (e) {
          if (e instanceof DOMException && e.name === "OverconstrainedError") continue;
          if (!cancelled) setError(t("fulfillment.camera.denied"));
          return;
        }
      }
      if (cancelled || !stream) return;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        // Desktop browsers usually report no facingMode at all; a webcam with
        // no stated facing is a front-facing one in every practical case, so
        // anything that is not explicitly "environment" gets mirrored.
        const facing = stream.getVideoTracks()[0]?.getSettings().facingMode;
        setMirrored(facing !== "environment");
        setActive(true);
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [supported, t]);

  const search = useCallback(
    async (value: string) => {
      busy.current = true;
      const result = await recordScanAction({ mode: "tracking", value });
      busy.current = false;
      if ("error" in result) {
        toast.error(t(`fulfillment.errors.${result.error}`));
        return;
      }
      if (result.requiresConfirmation) {
        // The camera does not get to move hundreds of orders on a stray frame.
        toast.warning(t("fulfillment.camera.tooMany"));
        return;
      }
      if (result.group) onScanned(result.group);
    },
    [onScanned, t],
  );

  // Poll for barcodes. `detect` on a video element only works once frames are
  // actually flowing, hence the readyState check.
  useEffect(() => {
    if (!active || !supported) return;
    const Ctor = (window as unknown as { BarcodeDetector: new (o: unknown) => Detector })
      .BarcodeDetector;
    const detector = new Ctor({ formats: ["qr_code", "code_128", "ean_13", "code_39"] });

    const timer = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || busy.current) return;
      const found = await detector.detect(video).catch(() => []);
      const value = found[0]?.rawValue?.trim();
      if (!value) return;

      const now = Date.now();
      if (lastValue.current?.value === value) {
        // Still the same code in frame. Say so at most every few seconds —
        // one toast per 400ms sample would bury the screen.
        if (now - lastValue.current.at > DUPLICATE_TOAST_MS) {
          lastValue.current = { value, at: now };
          toast.message(t("fulfillment.camera.duplicate"));
        }
        return;
      }
      lastValue.current = { value, at: now };

      // THE PHOTO-FIRST RULE: a new barcode while the parcel in hand has no
      // proof photo means the operator is about to lose it by searching away.
      if (group && !group.orders.some((o) => o.proofImageUrl)) {
        toast.warning(t("fulfillment.camera.photoFirst"));
        return;
      }
      await search(value);
    }, SAMPLE_MS);

    return () => clearInterval(timer);
  }, [active, supported, group, search, t]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !group) return;

    // Letterboxed onto a fixed canvas: a fixed output size keeps every proof
    // photo comparable, and aspect-fit (rather than stretch) is what stops a
    // 4:3 webcam producing a distorted label nobody can read back.
    const canvas = document.createElement("canvas");
    canvas.width = CAPTURE_WIDTH;
    canvas.height = CAPTURE_HEIGHT;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#000";
    context.fillRect(0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);
    const scale = Math.min(
      CAPTURE_WIDTH / video.videoWidth,
      CAPTURE_HEIGHT / video.videoHeight,
    );
    const width = video.videoWidth * scale;
    const height = video.videoHeight * scale;
    context.drawImage(video, (CAPTURE_WIDTH - width) / 2, (CAPTURE_HEIGHT - height) / 2, width, height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    await upload(new File([blob], `proof-${Date.now()}.png`, { type: "image/png" }));
  }, [group, upload]);

  // Space is the shutter, because both of the operator's hands are on a box.
  useEffect(() => {
    if (!active || !group) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.code !== "Space" || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      e.preventDefault();
      void capture();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, group, capture]);

  if (!supported) return null;

  return (
    <aside className="border-border bg-card h-fit space-y-3 rounded-lg border p-4">
      <h2 className="text-sm font-medium">{t("fulfillment.camera.title")}</h2>

      {error ? (
        <div className="border-border space-y-3 rounded-md border border-dashed p-4 text-center">
          <CameraOff className="text-muted-foreground mx-auto size-6" />
          <p className="text-muted-foreground text-sm">{error}</p>
          <Button product="outline" size="sm" onClick={() => window.location.reload()}>
            {t("fulfillment.camera.retry")}
          </Button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            muted
            playsInline
            className={`bg-muted aspect-video w-full rounded-md object-cover ${
              mirrored ? "-scale-x-100" : ""
            }`}
          />
          {mirrored && (
            <p className="text-muted-foreground text-xs">{t("fulfillment.camera.mirrored")}</p>
          )}
          <Button onClick={capture} disabled={!group} className="w-full">
            <Camera className="size-4" />
            {t("fulfillment.camera.capture")}
          </Button>
          <p className="text-muted-foreground text-xs">
            {group ? t("fulfillment.camera.spaceHint") : t("fulfillment.camera.scanHint")}
          </p>
        </>
      )}

      {overwritePrompt}
    </aside>
  );
}
