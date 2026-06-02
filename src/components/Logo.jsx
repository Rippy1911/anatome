import React, { useEffect } from "react";
import { useTheme } from "@/hooks/useTheme";

const LOGO_URL = "https://media.base44.com/images/public/6a1ea0b8b40fc9c2e83c0952/216c7d0c1_image.png";

export default function Logo({ className = "", alt = "Anatome.dev", asFavicon = false }) {
  useEffect(() => {
    if (!asFavicon) return;

    const updateFavicon = () => {
      // Browser tab theme typically follows system preference
      const isSystemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = LOGO_URL;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        // The bicep icon is roughly a square at the start of the rectangular logo
        const cropW = img.height * 1.15; 
        const cropH = img.height;
        const size = Math.max(cropW, cropH);
        
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        
        // Draw centered vertically
        const dy = (size - cropH) / 2;
        ctx.drawImage(img, 0, 0, cropW, cropH, 0, dy, cropW, cropH);
        
        // If system is light mode, invert the white logo to dark so it's visible on the browser tab
        if (!isSystemDark) {
          const imageData = ctx.getImageData(0, 0, size, size);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            // Invert RGB channels, keep Alpha intact
            if (data[i+3] > 0) {
              data[i] = 255 - data[i];
              data[i+1] = 255 - data[i+1];
              data[i+2] = 255 - data[i+2];
            }
          }
          ctx.putImageData(imageData, 0, 0);
        }
        
        const dataUrl = canvas.toDataURL("image/png");
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
          link = document.createElement("link");
          link.rel = "icon";
          document.head.appendChild(link);
        }
        link.href = dataUrl;
      };
    };

    updateFavicon();
    
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    if (mq.addEventListener) {
      mq.addEventListener("change", updateFavicon);
      return () => mq.removeEventListener("change", updateFavicon);
    }
  }, [asFavicon]);

  if (asFavicon) return null;

  return (
    <img 
      src={LOGO_URL} 
      alt={alt} 
      className={`object-contain dark:invert-0 invert ${className}`} 
    />
  );
}