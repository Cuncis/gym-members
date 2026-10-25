import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { UserMenu } from '@/components/UserMenu'
import { brandStyle } from '@/lib/branding'
import { getRequestGym } from '@/lib/tenant'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// The tab title is the gym's name on a gym's address, and the platform's name elsewhere.
export async function generateMetadata(): Promise<Metadata> {
  const gym = await getRequestGym();
  return { title: gym?.name ?? "FitnessGM" };
}

// Reads the gym of this address and exposes its colours (--brand, --brand-contrast) to everything below.
// It is its own component so that the request-time lookup sits inside a Suspense boundary.
// "contents" keeps the wrapper out of the layout: <body>'s flex column still sees the children directly.
async function BrandScope({ children }: { children: ReactNode }) {
  const gym = await getRequestGym();
  return (
    <div className="contents" style={brandStyle(gym?.brandColor)}>
      {children}
    </div>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >

      <body className="min-h-full flex flex-col">
        <Suspense
          fallback={
            <div className="contents" style={brandStyle(null)}>
              {children}
            </div>
          }
        >
          <BrandScope>
            <Suspense
              fallback={
                <header className="border-b border-neutral-200">
                  <div className="mx-auto h-[45px] max-w-2xl px-6" />
                </header>
              }
            >
              <UserMenu />
            </Suspense>
            {children}
          </BrandScope>
        </Suspense>
      </body>
    </html>
  );
}
