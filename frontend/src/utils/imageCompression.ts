/**
 * Image compression utility using Canvas API
 * Compresses images before upload to reduce file size and dimensions
 */

/**
 * Get the dimensions of an image file
 */
export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.width, height: img.height });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    img.src = objectUrl;
  });
}

/**
 * Calculate new dimensions while preserving aspect ratio
 */
export function calculateNewDimensions(
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }

  const aspectRatio = width / height;

  if (width > height) {
    return {
      width: maxDimension,
      height: Math.round(maxDimension / aspectRatio),
    };
  } else {
    return {
      width: Math.round(maxDimension * aspectRatio),
      height: maxDimension,
    };
  }
}

/**
 * Convert a File to a data URL
 */
export function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      if (e.target?.result && typeof e.target.result === 'string') {
        resolve(e.target.result);
      } else {
        reject(new Error('Failed to read file as data URL'));
      }
    };

    reader.onerror = () => {
      reject(new Error('FileReader error'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Convert a data URL to a File object
 */
export function dataURLToFile(dataURL: string, filename: string): File {
  const arr = dataURL.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new File([u8arr], filename, { type: mime });
}

/**
 * Compress an image file
 * @param file - The image file to compress
 * @param maxDimension - Maximum width or height (default: 1920)
 * @param maxSizeMB - Target maximum file size in MB (default: 1)
 * @returns Compressed image as a File object
 */
export async function compressImage(
  file: File,
  maxDimension: number = 1920,
  maxSizeMB: number = 1
): Promise<File> {
  try {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image');
    }

    // Get original dimensions
    const { width, height } = await getImageDimensions(file);

    // Calculate new dimensions
    const { width: newWidth, height: newHeight } = calculateNewDimensions(
      width,
      height,
      maxDimension
    );

    // Create canvas and draw resized image
    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Load image into canvas
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    await new Promise<void>((resolve, reject) => {
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };
      img.src = objectUrl;
    });

    // Draw image on canvas
    ctx.drawImage(img, 0, 0, newWidth, newHeight);

    // Compress with quality adjustment to meet size target
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    let quality = 0.9;
    let compressedDataURL: string;
    let compressedFile: File;

    // Binary search for optimal quality
    let minQuality = 0.1;
    let maxQuality = 0.9;

    while (true) {
      compressedDataURL = canvas.toDataURL('image/jpeg', quality);
      compressedFile = dataURLToFile(
        compressedDataURL,
        file.name.replace(/\.[^/.]+$/, '.jpg')
      );

      if (compressedFile.size > maxSizeBytes && quality > minQuality) {
        // File too large, reduce quality
        maxQuality = quality;
        quality = (minQuality + quality) / 2;
      } else if (
        compressedFile.size < maxSizeBytes * 0.8 &&
        quality < maxQuality
      ) {
        // File could be larger, increase quality
        minQuality = quality;
        quality = (quality + maxQuality) / 2;
      } else {
        // Size is acceptable
        break;
      }

      // Prevent infinite loop
      if (maxQuality - minQuality < 0.01) {
        break;
      }
    }

    // If still too large, use minimum quality
    if (compressedFile.size > maxSizeBytes) {
      compressedDataURL = canvas.toDataURL('image/jpeg', 0.1);
      compressedFile = dataURLToFile(
        compressedDataURL,
        file.name.replace(/\.[^/.]+$/, '.jpg')
      );
    }

    return compressedFile;
  } catch (error) {
    console.error('Image compression failed:', error);
    throw error;
  }
}
