export function createImageUrl(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onerror = reject;
    image.onload = () => {
      const canvas = document.createElement('canvas') as HTMLCanvasElement;

      canvas.width = image.width;
      canvas.height = image.height;

      const context = canvas.getContext('2d') as CanvasRenderingContext2D;

      context.drawImage(image, 0, 0, image.width, image.height);

      canvas.toBlob((blob) => resolve(URL.createObjectURL(blob)));
    };

    image.src = url;
  });
}
