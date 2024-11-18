import React from 'react';
import { Thorbis } from 'thorbis';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Thorbis />
      </body>
    </html>
  );
}
