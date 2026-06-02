import React, { useEffect, useState } from "react";

const LOGO_URL = "https://media.base44.com/images/public/6a1ea0b8b40fc9c2e83c0952/216c7d0c1_image.png";

// Process the PNG once: knock out the baked-in (near-black) background to transparent,
// so the white logo art floats cleanly over any page background.
function buildTransparentLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = LOGO_URL;
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const d = imageData.data;
        for (let i = 0; i < d.length; i += 4) {
          // Background is dark (near-black). Fade those pixels to transparent.
          const brightness = (d[i] + d[i + 1] + d[i + 2]) / 3;
          if (brightness < 60) {
            d[i + 3] = 0; // fully transparent
          }
        }
        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(LOGO_URL); // cross-origin tainted canvas fallback
      }
    };
    img.onerror = () => resolve(LOGO_URL);
  });
}

let cachedLogoPromise = null;
function getTransparentLogo() {
  if (!cachedLogoPromise) cachedLogoPromise = buildTransparentLogo();
  return cachedLogoPromise;
}

export default function Logo({ className = "", alt = "Anatome.dev", asFavicon = false }) {
  const [src, setSrc] = useState(LOGO_URL);

  useEffect(() => {
    let mounted = true;
    getTransparentLogo().then((url) => {
      if (!mounted) return;
      setSrc(url);
      if (asFavicon) {
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = url;
      }
    });
    return () => { mounted = false; };
  }, [asFavicon]);

  if (asFavicon) return null;

  // Transparent art is white — invert to dark in light mode so it stays visible.
  return (
    <img
      src={src}
      alt={alt}
      className={`object-contain invert dark:invert-0 ${className}`}
    />
  );
}