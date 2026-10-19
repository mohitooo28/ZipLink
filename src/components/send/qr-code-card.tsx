import { QRCodeSVG } from "qrcode.react";

/** QR code for the invitation link; always dark-on-white so every camera can read it. */
export function QRCodeCard({ link }: { link: string }) {
  return (
    <figure className="flex flex-col items-center gap-2.5">
      <div className="rounded-2xl bg-white p-3 ring-1 ring-line">
        <QRCodeSVG
          value={link}
          size={152}
          level="M"
          marginSize={0}
          bgColor="#ffffff"
          fgColor="#0c0c12"
          title="QR code with the invitation link"
          className="block size-36"
        />
      </div>
      <figcaption className="text-xs text-muted">Scan to receive</figcaption>
    </figure>
  );
}
