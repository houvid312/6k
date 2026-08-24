import { ScrollViewStyleReset } from 'expo-router/html';
import React from 'react';

// This file is web-only and used to configure the root HTML.
export default function Html({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* Google Fonts: Inter (400, 500, 600, 700) & Arvo (700) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Arvo:wght@700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />

        {/* CSS Reset for ScrollView */}
        <ScrollViewStyleReset />

        {/* Custom global styling to apply fonts on web */}
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
  body {
    background-color: #0D0D0E;
    color: #F5F0EB;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11', 'tnum';
  }
`;
