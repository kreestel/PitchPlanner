import type { Metadata } from "next";
import "./tailwind.generated.css";
export const metadata: Metadata = {
  metadataBase: new URL(process.env.URL || "http://localhost:3000"),
  title: "PitchPlanner",
  description: "Turn your presentation slides into a natural speaking script.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

