/**
 * QR code generation.
 *
 * Wraps the `qrcode` library. Produces PNG data URLs (for inline
 * <img>) and SVG strings (for crisp print at any size). Used by the
 * review-funnel links page and, later, the dedicated QR module.
 */

import QRCode from "qrcode";

export interface QrOptions {
  /** Pixel size for PNG output. Default 512. */
  size?: number;
  /** Quiet-zone margin in modules. Default 2. */
  margin?: number;
  /** Foreground color. Default near-black. */
  dark?: string;
  /** Background color. Default white. */
  light?: string;
}

export const qrService = {
  async toPngDataUrl(data: string, opts: QrOptions = {}): Promise<string> {
    return QRCode.toDataURL(data, {
      errorCorrectionLevel: "M",
      width: opts.size ?? 512,
      margin: opts.margin ?? 2,
      color: {
        dark: opts.dark ?? "#0f172a",
        light: opts.light ?? "#ffffff",
      },
    });
  },

  async toSvg(data: string, opts: QrOptions = {}): Promise<string> {
    return QRCode.toString(data, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: opts.margin ?? 2,
      color: {
        dark: opts.dark ?? "#0f172a",
        light: opts.light ?? "#ffffff",
      },
    });
  },
};
