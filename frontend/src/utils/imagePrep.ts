/**
 * Get a photo ready to be sent to a model.
 *
 * A phone camera hands over 3–6 MB and 4000 pixels across. A vision model
 * reads nothing useful past about 1500, and everything in between is time
 * on a mobile connection and money per request — so the photo is redrawn
 * smaller here, before it leaves the device.
 *
 * It returns a data URL because that is the shape every vision API takes,
 * and because nothing is stored on the way: the picture goes with the
 * question and lives only in that conversation.
 */

const MAX_EDGE = 1280;
const QUALITY = 0.82;

export interface PreparedImage {
  /** data:image/jpeg;base64,… */
  dataUrl: string;
  name: string;
  bytes: number;
}

export const prepareImage = (file: File): Promise<PreparedImage> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('no canvas')); return; }

      // A screenshot of a dark chart on a white canvas would come back with
      // white edges wherever the aspect ratio does not match.
      ctx.drawImage(img, 0, 0, w, h);

      const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
      resolve({
        dataUrl,
        name: file.name || 'photo.jpg',
        bytes: Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75),
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('not an image this browser can read'));
    };

    img.src = url;
  });
