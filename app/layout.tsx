import type { Metadata } from "next";
import "./tailwind.generated.css";
export const metadata: Metadata = { title: "PitchPlanner", description: "Turn your presentation slides into a natural speaking script." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }

