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

        {/* Google Fonts: Arvo (Bold) & Lato (Regular) */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Arvo:wght@700&family=Lato:wght@300;400;700&display=swap" rel="stylesheet" />

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
    background-color: #111111;
    font-family: 'Lato', sans-serif;
  }
`;
