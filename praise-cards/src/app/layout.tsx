// app/layout.tsx
import "@/app/globals.css";

export const metadata = {
  title: "❤️ Praise Wall",
  description: "A wall of love from Gratitude Users",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
