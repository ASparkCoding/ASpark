import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ASpark - AI-Powered Full-Stack App Generator | Open Source",
  description:
    "Describe your idea in natural language and get a working full-stack application in minutes. Open source, multi-model AI, zero vendor lock-in.",
};

export default function LandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
