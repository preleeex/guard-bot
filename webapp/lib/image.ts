// Read an image File, downscale it on a canvas and return a compact data URL.
// Keeps scenario images small enough to store inline in the block config.
export function resizeImage(file: File, maxWidth = 600, quality = 0.7): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode failed"));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("no canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

// Hidden-input helper: opens the file picker and resolves with a data URL.
// The input is attached to the DOM before clicking: iOS / Telegram webviews
// ignore clicks on a detached input, which silently breaks the picker.
export function pickImage(maxWidth = 600): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.style.opacity = "0";
    document.body.appendChild(input);

    let settled = false;
    const finish = (v: string | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(v);
    };

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return finish(null);
      try {
        finish(await resizeImage(file, maxWidth));
      } catch {
        finish(null);
      }
    };

    input.click();
  });
}
