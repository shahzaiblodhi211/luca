/** Browser-side image compression before upload (faster network + Gemini). */
export async function compressImageFile(
  file: File,
  opts?: { maxEdge?: number; quality?: number },
): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }

  // Already small enough
  if (file.size < 350_000) return file;

  const maxEdge = opts?.maxEdge ?? 1280;
  const quality = opts?.quality ?? 0.72;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.\w+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}

export async function prepareFilesForUpload(files: File[]): Promise<File[]> {
  return Promise.all(
    files.map(async (file) => {
      try {
        if (file.type.startsWith("image/")) {
          return await compressImageFile(file);
        }
        return file;
      } catch {
        return file;
      }
    }),
  );
}
